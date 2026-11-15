import ts from 'typescript'

import { ENV_READ_ROOTS } from '../data/env-roots.js'
import {
  carriesProp,
  collectComments,
  containsJsx,
  countCodeLines,
  declaredPropOf,
  lineOf,
  positionOf,
  stringContext,
} from './facts-syntax.js'

import { assertTypeScriptApi } from './ts-api.js'

import type { Facts, FileRecord } from './types.js'

/**
 * 事实模型（facts）：引擎里**唯一**接触 TS AST 的地方。
 * 规则只消费这里产出的纯 JSON —— 换 parser 只需重写本文件（见 docs/DESIGN.md §6.1.1）。
 */

// typescript@7 是原生重写，JS 侧不再暴露编译期 API；这里 fail-fast 给出可执行报错
assertTypeScriptApi(ts)

interface SourceFileWithDiagnostics extends ts.SourceFile {
  parseDiagnostics?: ts.Diagnostic[]
}

const SCRIPT_KIND: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
}

export const TS_EXTENSIONS: string[] = Object.keys(SCRIPT_KIND)

function scriptKindOf(file: string): ts.ScriptKind {
  const dot = file.lastIndexOf('.')
  return SCRIPT_KIND[file.slice(dot)] ?? ts.ScriptKind.TS
}

/** 注释：走 TS 的 comment range API，避免正则把字符串里的 // 当注释 */

/**
 * 下面两个辅助函数**显式接收父节点**，而不是读 `node.parent`。
 *
 * 为什么：`createSourceFile(..., setParentNodes = true)` 会让 TS 给**每个**节点挂父指针，
 * 而解析是 facts 提取的绝对大头；真正需要父节点的只有这里的几处。显式传参后，
 * 解析就能按 DESIGN §6.1.1 写的那样用 `setParentNodes = false`。
 */

export interface FactInput {
  file: string
  rel: string
  role: string
  text: string
}

/**
 * 事实模型（facts）是 parser ↔ 规则之间**唯一的契约**，因此只收「有规则在读」的字段。
 *
 * 收一堆没人读的字段不是"以后也许用得上"，而是每次全量解析都要付的真金白银：
 * 早先为 H01（`any` / 非空断言）、H05（空 catch）、C01（JSX 裸文本）收集的
 * `anyNodes` / `nonNull` / `catches` 三组，在那些规则委派给 eslint 之后就没有消费者了 ——
 * 已删除（见 docs/ECOSYSTEM-AUDIT.md）。**要给新规则加字段：先让规则真的读它，再回这里收集。**
 *
 * 反过来的那次也记在这里：`inlineStyles` 曾在委派 D15 时删掉，0.4.0 把 D15 收回本体时
 * 以更小的形状（`styleProps`：只收 JSX `style` 里的**字面量**属性）加了回来；
 * 同一次还加了 `numbers`（D19 / D20 读它）。两组都改了事实形状 → `FACTS_CACHE_SPEC` 5 → 6。
 *
 * **R-128（列号）**：所有带位置的事实多了一个 `column`（行 + 列，都从 1 起）—— 报告与 `--format=github`
 * 注解据此印 `file:line:col`，编辑器/CI 能跳到列。值变了 → `FACTS_CACHE_SPEC` 10 → **11**。
 *
 * **R-164（代码行）**：新增 `codeLineCount`（S16 改读它：空行与整行注释不计），`lineCount` 仍是原始行数。
 * 形状变了 → `FACTS_CACHE_SPEC` 11 → **12**。
 */
/**
 * import / re-export → 事实（S45 的名字对账、依赖图、C07 的语言对账都读它）。
 *
 * 从 `extractFacts` 的访问器里抽出来：那个函数本身也顶到了 300 行上限。
 */
function recordImports(node: ts.Node, facts: Facts, sf: ts.SourceFile): void {
  /* ---- import / re-export ---- */
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const clause = node.importClause
    const bindings = clause?.namedBindings
    facts.imports.push({
      spec: node.moduleSpecifier.text,
      ...positionOf(sf, node.getStart(sf)),
      typeOnly: clause?.isTypeOnly === true,
      dynamic: false,
      ...(bindings && ts.isNamedImports(bindings)
        ? { names: bindings.elements.map((el) => (el.propertyName ?? el.name).text) }
        : {}),
      ...(clause?.name ? { hasDefault: true } : {}),
      ...(bindings && ts.isNamespaceImport(bindings) ? { star: true } : {}),
    })
  } else if (ts.isExportDeclaration(node)) {
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.exportClause
      facts.imports.push({
        spec: node.moduleSpecifier.text,
        ...positionOf(sf, node.getStart(sf)),
        typeOnly: node.isTypeOnly,
        dynamic: false,
        ...(clause && ts.isNamedExports(clause)
          ? { names: clause.elements.map((el) => (el.propertyName ?? el.name).text) }
          : {}),
        ...(clause ? {} : { star: true }),
      })
    }
    const start = lineOf(sf, node.getStart(sf))
    if (!node.exportClause) {
      facts.exports.push({
        name: '*',
        kind: 're-export',
        isStar: true,
        isDefault: false,
        typeOnly: node.isTypeOnly,
        line: start,
      })
    } else if (ts.isNamespaceExport(node.exportClause)) {
      facts.exports.push({
        name: node.exportClause.name.text,
        kind: 're-export',
        isStar: false,
        isDefault: false,
        typeOnly: node.isTypeOnly,
        line: start,
      })
    } else {
      for (const element of node.exportClause.elements) {
        facts.exports.push({
          name: element.name.text,
          kind: 're-export',
          isStar: false,
          isDefault: false,
          typeOnly: node.isTypeOnly || element.isTypeOnly,
          ...positionOf(sf, element.getStart(sf)),
        })
      }
    }
  } else if (ts.isExportAssignment(node)) {
    facts.exports.push({
      name: 'default',
      kind: 'assignment',
      isStar: false,
      isDefault: true,
      typeOnly: false,
      ...positionOf(sf, node.getStart(sf)),
      declared: true,
    })
  } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const argument = node.arguments[0]
    if (argument && ts.isStringLiteral(argument)) {
      facts.imports.push({
        spec: argument.text,
        ...positionOf(sf, node.getStart(sf)),
        typeOnly: false,
        dynamic: true,
      })
    }
  }
}

export function extractFacts(input: FactInput): Facts {
  const { file, rel, role, text } = input
  const scriptKind = scriptKindOf(file)
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKind,
  ) as SourceFileWithDiagnostics

  // scanner 需要 LanguageVariant 而不是 ScriptKind（JSX 变体才能正确扫描 JSX）
  const variant =
    scriptKind === ts.ScriptKind.TSX || scriptKind === ts.ScriptKind.JSX
      ? ts.LanguageVariant.JSX
      : ts.LanguageVariant.Standard
  const positioned = collectComments(sf, text, variant)
  const facts: Facts = {
    file,
    rel,
    role,
    lineCount: text.split('\n').length,
    codeLineCount: countCodeLines(text, positioned),
    parseErrors: (sf.parseDiagnostics ?? []).map((diagnostic) => ({
      line: diagnostic.start === undefined ? 1 : lineOf(sf, diagnostic.start),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    })),
    imports: [],
    exports: [],
    strings: [],
    reads: [],
    calls: [],
    styleProps: [],
    numbers: [],
    functions: [],
    comments: positioned.map(({ line, text: body, kind, pos, end }) => ({
      line,
      text: body,
      kind,
      pos,
      end,
    })),
    hasJsx: false,
  }

  const visit = (
    node: ts.Node,
    parent: ts.Node | undefined,
    /** 祖先里**最近的那个属性名**（`queryKey` / `path` / `to`…）：透传容器不改变它 */
    inheritedProp: string | null,
    /** 祖先里**最近的外层调用名**（对象实参里的文案靠它认"这是给谁用的"） */
    inheritedCall: string | null = null,
    /** 是否在 JSX `style={{}}` 的作用域里（D15 只判这里面的属性） */
    inheritedStyle = false,
    /**
     * 「键工厂」的两个坐标：变量名 + **不随函数体断开**的属性名。
     *
     * 为什么单独要一份：`inheritedProp` 进函数体就断开（那是给 C01/D22 用的语义），
     * 而 `detail: (id) => ['crews', id]` 这种键恰恰写在箭头函数体里 —— D26 要按"每个 key 工厂"
     * 分组比对前缀，缺了它就只剩 `list` 一个样本，形同不判（R-100）。
     */
    inheritedOwner: string | null = null,
    inheritedOwnedProp: string | null = null,
  ): void => {
    // 传给子孙的"最近属性名"：本级是属性 → 用它；本级只是透传容器 → 继承；其它 → 断开
    const childProp = declaredPropOf(node, sf) ?? (carriesProp(node) ? inheritedProp : null)
    // 调用名：本级是调用 → 取它的 callee；进了函数体 → 断开（参数里的回调与外面那次调用无关）
    const callHere =
      ts.isCallExpression(node) || ts.isNewExpression(node) ? node.expression.getText(sf) : null
    const childCall = callHere ?? (ts.isFunctionLike(node) ? null : inheritedCall)
    // 内联样式：`style={…}` 打开，进函数体断开（`style={{ … , onClick: () => {} }}` 里的回调不算样式）
    const childOwnedProp = declaredPropOf(node, sf) ?? inheritedOwnedProp
    const childOwner =
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node.name.text : inheritedOwner
    const childStyle = ts.isJsxAttribute(node)
      ? node.name.getText(sf) === 'style'
      : ts.isFunctionLike(node)
        ? false
        : inheritedStyle
    recordImports(node, facts, sf)
    /* ---- 声明型导出 ---- */
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
    const isExported =
      modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
    const isDefaultKeyword =
      modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) === true
    if (isExported || isDefaultKeyword) {
      let kind = 'const'
      let name = 'default'
      if (ts.isFunctionDeclaration(node)) {
        kind = 'function'
        name = node.name?.text ?? 'default'
      } else if (ts.isClassDeclaration(node)) {
        kind = 'class'
        name = node.name?.text ?? 'default'
      } else if (ts.isInterfaceDeclaration(node)) {
        kind = 'interface'
        name = node.name.text
      } else if (ts.isTypeAliasDeclaration(node)) {
        kind = 'type'
        name = node.name.text
      } else if (ts.isEnumDeclaration(node)) {
        kind = 'enum'
        name = node.name.text
      } else if (ts.isVariableStatement(node)) {
        const declaration = node.declarationList.declarations[0]
        const initializer = declaration?.initializer
        kind =
          initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
            ? 'arrow'
            : 'const'
        name =
          declaration?.name && ts.isIdentifier(declaration.name) ? declaration.name.text : 'default'
      }
      facts.exports.push({
        name,
        kind,
        isStar: false,
        isDefault: isDefaultKeyword || name === 'default',
        typeOnly: kind === 'type' || kind === 'interface',
        ...positionOf(sf, node.getStart(sf)),
        declared: true,
      })
    }

    /* ---- 环境读取（成员访问链的最外层） ---- */
    if (ts.isPropertyAccessExpression(node)) {
      const outermost = !(
        parent &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node
      )
      if (outermost) {
        const chain = node.getText(sf)
        if (ENV_READ_ROOTS.some((root) => chain === root || chain.startsWith(`${root}.`))) {
          facts.reads.push({ name: chain, ...positionOf(sf, node.getStart(sf)) })
        }
      }
    }

    /* ---- 字面量 ---- */
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // 数组**首元素**属于哪个"键工厂"：`crewKeys.list = ['crews']` / `detail: (id) => ['crews', id]`
      const arrayPath =
        parent !== undefined &&
        ts.isArrayLiteralExpression(parent) &&
        parent.elements[0] === node &&
        inheritedOwner !== null &&
        inheritedOwnedProp !== null
          ? `${inheritedOwner}.${inheritedOwnedProp}`
          : undefined
      facts.strings.push({
        value: node.text,
        ...positionOf(sf, node.getStart(sf)),
        context: stringContext(parent),
        // 最近的那个属性名（不一定是直接父节点：`queryKey: ['a']` 的字面量在数组里）
        prop: inheritedProp,
        ...(inheritedCall ? { inCall: inheritedCall } : {}),
        ...(arrayPath ? { arrayPath } : {}),
      })
    }
    /**
     * JSX 文本节点（`<button>保存</button>` 里的那半）也进 `strings`，`context` 标成 `jsx`。
     *
     * 它**不是字符串字面量** —— 只收字面量的话，"写死在 JSX 里的文案"永远看不见（C01 的主体）。
     * 纯空白（标签之间的缩进换行）跳过，否则每个 JSX 文件都会多出一堆噪音。
     */
    if (ts.isJsxText(node)) {
      const text = node.text.trim()
      if (text !== '') {
        facts.strings.push({
          value: text,
          ...positionOf(sf, node.getStart(sf)),
          context: 'jsx',
          prop: null,
        })
      }
    }
    if (
      !facts.hasJsx &&
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
    )
      facts.hasJsx = true

    /* ---- 内联样式属性（D15） ---- */
    if (inheritedStyle && ts.isPropertyAssignment(node)) {
      const initializer = node.initializer
      const literal = ts.isStringLiteralLike(initializer)
        ? { value: initializer.text, numeric: false }
        : ts.isNumericLiteral(initializer)
          ? { value: initializer.text, numeric: true }
          : ts.isPrefixUnaryExpression(initializer) &&
              initializer.operator === ts.SyntaxKind.MinusToken &&
              ts.isNumericLiteral(initializer.operand)
            ? { value: `-${initializer.operand.text}`, numeric: true }
            : null
      // 只收字面量：`color: token` / 模板插值正是"该有的样子"，收进来只会把判断变成猜谜
      if (literal) {
        facts.styleProps.push({
          prop: node.name.getText(sf),
          value: literal.value,
          numeric: literal.numeric,
          ...positionOf(sf, node.getStart(sf)),
        })
      }
    }

    /* ---- 有名字的数字字面量（D19 / D20） ---- */
    if (ts.isNumericLiteral(node)) {
      const raw = node.getText(sf)
      const named =
        inheritedProp ??
        (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
          ? parent.name.text
          : null)
      const value = Number(raw.replace(/_/g, ''))
      if (Number.isFinite(value)) {
        facts.numbers.push({ value, raw, name: named, ...positionOf(sf, node.getStart(sf)) })
      }
    }

    /* ---- 调用 / debugger ---- */
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // 记录**所有**调用：裸调用（alert/confirm/prompt）也要能被 H03 看见
      const first = node.arguments?.[0]
      const prefixOf = (arg: ts.Expression | undefined): string | undefined => {
        if (!arg || !ts.isTemplateExpression(arg)) return undefined
        return arg.head.text || undefined
      }
      const templateParts =
        first && ts.isTemplateExpression(first)
          ? [first.head.text, ...first.templateSpans.map((span) => span.literal.text)]
          : undefined
      facts.calls.push({
        callee: node.expression.getText(sf),
        ...positionOf(sf, node.getStart(sf)),
        ...(first && ts.isStringLiteralLike(first) ? { stringArg: first.text } : {}),
        ...(prefixOf(first) ? { keyPrefix: prefixOf(first) as string } : {}),
        ...(templateParts ? { templateParts } : {}),
      })
    }
    if (node.kind === ts.SyntaxKind.DebuggerStatement) {
      facts.calls.push({ callee: 'debugger', ...positionOf(sf, node.getStart(sf)) })
    }

    /* ---- 函数体量 ---- */
    let functionInfo: { name: string; start: number; end: number } | null = null
    if (ts.isFunctionDeclaration(node)) {
      functionInfo = {
        name: node.name?.text ?? '(anonymous)',
        start: node.getStart(sf),
        end: node.getEnd(),
      }
    } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const name = parent && ts.isVariableDeclaration(parent) ? parent.name.getText(sf) : '(fn)'
      functionInfo = { name, start: node.getStart(sf), end: node.getEnd() }
    }
    if (functionInfo) {
      const body =
        ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)
          ? node.body
          : undefined
      facts.functions.push({
        ...(inheritedOwnedProp ? { ownedProp: inheritedOwnedProp } : {}),
        ...(inheritedCall ? { inCall: inheritedCall } : {}),
        name: functionInfo.name,
        ...positionOf(sf, functionInfo.start),
        lines: lineOf(sf, functionInfo.end) - lineOf(sf, functionInfo.start) + 1,
        isComponent:
          /^[A-Z]/.test(functionInfo.name) && body !== undefined && ts.isBlock(body)
            ? containsJsx(body)
            : false,
      })
    }

    ts.forEachChild(node, (child) =>
      visit(child, node, childProp, childCall, childStyle, childOwner, childOwnedProp),
    )
  }

  visit(sf, undefined, null, null, false, null, null)
  return facts
}

/** 供其它模块把 FileRecord 转成事实输入 */
export function factInputOf(record: FileRecord, text: string): FactInput {
  return { file: record.abs, rel: record.rel, role: record.role, text }
}
