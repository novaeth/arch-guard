import { resolveFramework } from '../../../data/framework-sources.js'
import { globToRegExp } from '../../../engine/util.js'
import type { Finding, Rule } from '../../../engine/types.js'

import { placementHint } from './placement.js'
import { domainRootOnlyRoutes, routesRequired } from './structure-routes.js'
import { finding } from './finding.js'

/** S00 解析失败必须报错：fail-closed —— 语法错误会让该文件失去全部检查，绝不能静默通过 */
export const parseFailClosed: Rule = {
  id: 'S00',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '解析失败必须报错',
  hint: '语法错误会让该文件失去全部检查，先修语法',
  run: (ctx) =>
    ctx.records.flatMap((record) => {
      const facts = ctx.facts.get(record.rel)
      if (!facts) return []
      return facts.parseErrors.map((error) => ({
        rule: 'S00',
        file: record.rel,
        line: error.line,
        text: `解析失败：${error.message}`,
        global: true,
      }))
    }),
}

/** S01 角色表互斥完备：每个文件必须恰好命中一个角色 */
export const roleTableComplete: Rule = {
  id: 'S01',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '目录契约（角色表互斥且完备）',
  hint: '按 PARADIGM.md 的目录契约把文件放到对应槽位',
  run: (ctx) => {
    const out: Finding[] = []
    // 域根从 layout 读（唯一真相），不要再拼 `${srcRoot}/modules` —— 见 structure-graph 的 rootsOf
    const modulesRoot = ctx.config.layout.modules
    /** 域根下的散件由 S03 专门报，S01 跳过以免同一处报两遍 */
    const isDomainRootFile = (rel: string): boolean =>
      rel.startsWith(`${modulesRoot}/`) && rel.slice(modulesRoot.length + 1).split('/').length === 2
    for (const rel of ctx.scan.missing) {
      if (isDomainRootFile(rel)) continue
      out.push(
        finding(
          'S01',
          rel,
          1,
          '文件不在目录契约内（未命中任何角色）',
          placementHint(rel, ctx.config),
          true,
        ),
      )
    }
    for (const entry of ctx.scan.ambiguous) {
      out.push(
        finding(
          'S01',
          entry.rel,
          1,
          `角色歧义：同时命中 ${entry.roles.join(' / ')}`,
          '角色判据必须互斥，请调整路径',
          true,
        ),
      )
    }
    return out
  },
}

/** S02 目录深度 ≤3（相对源码根）：域内槽位下不许再嵌套 */
export const maxDepth: Rule = {
  id: 'S02',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '目录深度上限',
  hint: '域内固定七个槽位，槽位下不许再建目录；域变大了就拆成更多域',
  run: (ctx) => {
    const prefix = `${ctx.config.srcRoot}/`
    // 默认 4：范式里 shared/i18n/locales/<lang>/<ns>.ts 本身就是 4 层；
    // 上限防的是「随手往下挖目录」，不是精确等于 3。可用 params.maxDepth 覆盖。
    const max = Number(ctx.config.params.maxDepth ?? 4)
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (!record.rel.startsWith(prefix)) continue
      const rest = record.rel.slice(prefix.length)
      const depth = rest.split('/').length - 1
      if (depth > max) {
        out.push(finding('S02', record.rel, 1, `目录深度 ${depth} 超过上限 ${max}`))
      }
    }
    return out
  },
}

/**
 * S11 禁 barrel：`export *` 会把真实依赖藏起来，使依赖图不可判定。
 *
 * **边界（两类声明过的 barrel 放行）**：
 * - **公开面入口**（角色 `entry: true` / 库范式 `slot: 'entry'`）：包 / 切片对外的唯一面就是它，
 *   `export *` 是契约本身；S08 已经负责"barrel 造出依赖环"那一半；
 * - **生成物**（`structure.generated` 命中）：机器生成的文件，形状由生成器负责，手改它才是错的。
 *
 * 两类都是**声明**（角色表 / structure.generated），不是按文件名猜 —— 没声明的 barrel 照报。
 */
export const noBarrel: Rule = {
  id: 'S11',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '禁 barrel 再导出',
  hint: '直接导出具体符号，别用 export * 聚合',
  run: (ctx) => {
    const generated = (ctx.config.structure.generated ?? []).map(globToRegExp)
    return ctx.records.flatMap((record) => {
      if (record.entry === true) return []
      if (generated.some((matcher) => matcher.test(record.rel))) return []
      const facts = ctx.facts.get(record.rel)
      if (!facts) return []
      return facts.exports
        .filter((entry) => entry.isStar && !entry.typeOnly)
        .map((entry) => finding('S11', record.rel, entry, '禁 barrel：export * from ...'))
    })
  },
}

/** S12 命名契约 */
export const namingRules: Rule = {
  id: 'S12',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '命名契约',
  hint: '见 PARADIGM.md 的命名契约表',
  run: (ctx) => {
    const out: Finding[] = []
    const { hookPrefix, viewSuffix } = ctx.config.naming
    for (const record of ctx.records) {
      const base = record.rel.split('/').pop() ?? ''
      const stem = base.replace(/\.[^.]+$/, '')
      if (record.slot === 'hooks' && !stem.startsWith(hookPrefix)) {
        out.push(finding('S12', record.rel, 1, `hook 文件必须以 ${hookPrefix} 开头：${base}`))
      }
      // 只对代码文件查页面命名：views/ 下的 .module.css 是页面样式，不是页面
      if (record.slot === 'views' && /\.tsx?$/.test(base) && !stem.endsWith(viewSuffix)) {
        out.push(finding('S12', record.rel, 1, `页面文件必须以 ${viewSuffix} 结尾：${base}`))
      }
      // api 层允许 camelCase（queryKeys / queryClient 这类基础设施），只禁首字母大写与下划线
      // 按角色**后缀**判（而不是写死 canonical 的 `shared:api`）：FSD 的 `fsd:shared:api` 语义相同
      if (record.role.endsWith(':api') && (/^[A-Z]/.test(stem) || stem.includes('_'))) {
        out.push(
          finding(
            'S12',
            record.rel,
            1,
            `api 文件名必须小写 camelCase（禁首字母大写与下划线）：${base}`,
          ),
        )
      }
      // 组件目录同理：canonical 的 `shared:components:{ui,common}` 与 FSD 的 `fsd:shared:ui`、`fsd:<层>:ui`
      if (
        (record.role.endsWith(':ui') || record.role.endsWith(':components:common')) &&
        base.endsWith('.tsx') &&
        !/^[A-Z]/.test(stem)
      ) {
        /**
         * 判据不动（组件目录里的文件必须 PascalCase），但**报文必须指向真正的修法**：
         * `ui/useThing.tsx` 被点名的真实问题是"hook 住错了目录"，不是"组件名起错了" ——
         * 一律报"组件文件必须 PascalCase"会把 agent 送去改名字，而它该做的是把文件挪走。
         * 所以按**文件的可判定形态**分三种说法：
         *   ① 名字像 hook（`config.naming.hookPrefix` 开头）→ 说"hook 不该住组件目录"；
         *   ② 文件里有 JSX → **只说明"有元素字面量"，推不出"导出的是组件"**（导出元素表也含 JSX：
         *      `export const ICONS: Record<K, ReactNode> = { dark: <Moon /> }`）。所以这一支的措辞必须
         *      对**两种形态都成立**：陈述事实 + 给两条路（是组件就改名；只放元素/常量就给 `.ts` 或挪走）。
         *   ③ 没有 JSX 且名字不像组件 → 说清它是什么、该去哪。
         *
         * **为什么不判"导出的到底是不是组件"再选措辞**：事实模型里的 `functions[].isComponent` 是启发式
         * （首字母大写 + **块体** + 含 JSX），而最常见的 `export const Foo = () => <div />`（表达式体）
         * 实测就是 `false` —— 拿一个会判错的判据去决定措辞，等于"用一个可能错的判据去修一个只是不够具体的报文"，
         * 方向是反的（还会制造新的错误提示）。
         */
        const looksLikeHook = stem.startsWith(hookPrefix)
        const hasJsx = ctx.facts.get(record.rel)?.hasJsx === true
        out.push(
          finding(
            'S12',
            record.rel,
            1,
            looksLikeHook
              ? `hook 不该住在组件目录：把 ${base} 挪到 model/ 或 hooks/`
              : hasJsx
                ? // 有 JSX ≠ 是组件（元素表也含 JSX）→ 只说结论 + 两条路，两种形态都成立
                  `${base} 在组件目录里但不是 PascalCase：是组件就改成 PascalCase 的 .tsx；只放元素 / 常量就给 .ts 或挪出 ui/`
                : `${base} 不是组件却住在组件目录：这份 .tsx 里没有 JSX，纯逻辑请放 model/、或干脆改成 .ts`,
            '组件目录（ui / components）只放组件：组件用 PascalCase .tsx；hook 与纯逻辑另有位置',
          ),
        )
      }
    }
    return out
  },
}

/** S13 导出形态契约 */
export const exportShape: Rule = {
  id: 'S13',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '导出形态契约',
  hint: 'views 必须 default 导出；hooks 只导出 use*；model 只放类型与字面量常量',
  // 本条全靠槽位语义：没有槽位的范式（library / fsd）下它 100% 空转 —— 明列停用，别假装在跑
  requires: ['structure.slots'],
  run: (ctx) => {
    const out: Finding[] = []
    for (const record of ctx.records) {
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      const exports = facts.exports.filter(
        (entry) => entry.declared || entry.isStar || entry.kind === 're-export',
      )
      if (record.slot === 'views' && facts.hasJsx) {
        if (!exports.some((entry) => entry.isDefault)) {
          out.push(finding('S13', record.rel, 1, '页面组件必须 default 导出（路由懒加载依赖它）'))
        }
      }
      if (record.slot === 'hooks') {
        for (const entry of exports) {
          // 类型导出是 hook 的公开契约（ToolStep / ConversationStream…），不是"非 hook 导出"
          if (entry.typeOnly) continue
          if (entry.isDefault || !entry.name.startsWith(ctx.config.naming.hookPrefix)) {
            out.push(finding('S13', record.rel, entry, `hook 模块只允许导出 use*：${entry.name}`))
          }
        }
      }
      if (record.slot === 'model') {
        for (const entry of exports) {
          if (!['type', 'interface', 'const', 'enum', 're-export'].includes(entry.kind)) {
            out.push(
              finding(
                'S13',
                record.rel,
                entry,
                `model 只允许类型与字面量常量：${entry.name}（${entry.kind}）`,
              ),
            )
          }
        }
      }
      if (record.slot === 'lib') {
        for (const entry of exports) {
          if (entry.isDefault) out.push(finding('S13', record.rel, entry, 'lib 禁止 default 导出'))
        }
        if (facts.hasJsx) out.push(finding('S13', record.rel, 1, 'lib 是纯函数层，不得包含 JSX'))
      }
    }
    return out
  },
}

/** S16 体积阈值：文件与组件函数 */
export const sizeLimits: Rule = {
  id: 'S16',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  // 体积是**产品代码**的纪律：测试文件是脚手架（夹具、逐条断言），按产品阈值拆只会把测试摞进 src/
  appliesTo: 'product',
  title: '体积阈值',
  hint: '超过上限就拆：页面拆组件，组件拆函数',
  run: (ctx) => {
    const { fileLines, viewLines, functionLines } = ctx.config.thresholds
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (record.kind !== 'ts') continue
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      // 「页面级」由角色表声明（`pageLike`）—— 只看 `slot === 'views'` 会让 library / fsd 下
      // 的 viewLines 静默失效（配了也不生效）
      const limit = record.pageLike === true || record.slot === 'views' ? viewLines : fileLines
      if (facts.lineCount > limit) {
        out.push({
          rule: 'S16',
          file: record.rel,
          line: 1,
          text: `文件 ${facts.lineCount} 行，超过上限 ${limit}`,
          hint: '拆成更小的单元',
          anchorKind: 'file',
        })
      }
      for (const fn of facts.functions) {
        if (fn.isComponent && fn.lines > functionLines) {
          out.push(
            finding(
              'S16',
              record.rel,
              fn,
              `组件函数 ${fn.name} 有 ${fn.lines} 行，超过上限 ${functionLines}`,
            ),
          )
        }
      }
    }
    return out
  },
}

/**
 * S19 导出宽度与单文件组件数：一个文件是一个单元。
 *
 * 为什么和 S16 分开：S16 量的是「行数」（任何工程类型都成立），S19 量的是「一个文件承担了几件事」——
 * 它对**应用**成立，对**库**不成立：库的入口（`src/index.ts`）就是公开面，导出几十个符号是正确形态。
 * 规则集必须跟着工程类型走（ADR-0003），所以 `canonical()` 默认开、`library()` 的启用名单里没有它。
 */
export const widthLimits: Rule = {
  id: 'S19',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '导出宽度与单文件组件数',
  hint: '导出值太多说明这个文件承担了多件事；组件太多说明该拆成组件目录',
  run: (ctx) => {
    const { exportsPerFile, componentsPerFile } = ctx.config.thresholds
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (record.kind !== 'ts') continue
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      // 「导出值」不含类型：类型导出是契约，不是宽度
      const values = facts.exports.filter((entry) => !entry.typeOnly)
      if (values.length > exportsPerFile) {
        out.push(
          finding(
            'S19',
            record.rel,
            values[0]?.line ?? 1,
            `导出值 ${values.length} 个，超过上限 ${exportsPerFile}`,
            '按职责拆文件',
          ),
        )
      }
      const components = facts.functions.filter((fn) => fn.isComponent)
      if (components.length > componentsPerFile) {
        out.push(
          finding(
            'S19',
            record.rel,
            components[0]?.line ?? 1,
            `单文件组件 ${components.length} 个，超过上限 ${componentsPerFile}`,
            '拆成 components/ 目录',
          ),
        )
      }
    }
    return out
  },
}

/**
 * S20 框架包必须覆盖项目的源码形态：扫到当前 pack 量不了的源码文件就报错。
 *
 * 为什么是红线而不是提示：那些文件会被 walk 直接丢掉，于是「量不了」表现为
 * 「0 个文件 → ✔ 通过」—— 假绿比报错危险。要么换 `sourceForm`，要么把量不了的源码移出去。
 */
export const frameworkCoverage: Rule = {
  id: 'S20',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '框架包必须覆盖项目的源码形态',
  hint: '这些文件不在当前框架包的处理范围内，会被静默跳过；换对应 pack，或把这些源码移出扫描范围',
  run: (ctx) => {
    if (ctx.scan.foreign.length === 0) return []
    const kinds = new Map<string, number>()
    for (const rel of ctx.scan.foreign) {
      const ext = rel.slice(rel.lastIndexOf('.'))
      kinds.set(ext, (kinds.get(ext) ?? 0) + 1)
    }
    const detail = [...kinds.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ext, count]) => `${ext} × ${count}`)
      .join('、')
    return [
      finding(
        'S20',
        ctx.scan.foreign[0] as string,
        1,
        `发现 ${ctx.scan.foreign.length} 个当前源码形态（${resolveFramework(ctx.config.sourceForm)}）量不了的源码文件：${detail}`,
        '本工具目前只有 react pack；要么换 pack，要么把这段源码移出扫描范围（ignore）',
        true,
      ),
    ]
  },
}

export const structureRules: Rule[] = [
  domainRootOnlyRoutes,
  parseFailClosed,
  roleTableComplete,
  maxDepth,
  noBarrel,
  namingRules,
  exportShape,
  routesRequired,
  sizeLimits,
  widthLimits,
  frameworkCoverage,
]
