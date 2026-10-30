import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import picomatch from 'picomatch'
import valueParser from 'postcss-value-parser'

import { parseCss } from '../../../engine/css.js'
import { walk } from '../../../engine/util.js'
import type { RuleContext } from '../../../engine/types.js'
import type { ContrastPair, ExternalTokenNamespace } from '../../../presets/design-system.js'

/**
 * 对比度组合的形状**只有一份**：公开配置那份（`presets/design-system.ts`）。
 *
 * 这里曾经各写一份，于是两份**漂移**了：公开的那份漏了 `parent`，而 D07（按 parent 压底算比值）
 * 与 D05（把 parent 也算作被引用）都在读它 —— TS 宿主写 `parent` 直接编译期红。
 * 同一事实两处定义必然这样，所以这份改为复用，并由 `tests/process.test.mjs` 的
 * "同一事实只许一处定义"钉住接口只在公开那份出现。
 */
export type { ContrastPair }

/** 令牌前缀（`--sh-*`）曾在这里作为参数 —— 但**没有任何规则读它**（D02/D18 未实现），
 * 而且是宿主 superhive 的前缀，不该做通用默认。删掉；将来实现 D02/D18 时再作为
 * `designSystem({ tokenPrefix })` + `requires: ['designSystem.tokenPrefix']` 加回。 */
/**
 * 设计系统的**项目事实**。落点（`styleDir` / `tokenDir` / `vendorDir` / `paletteFile` /
 * `themeFile` / `storageFile`）**不设兜底默认**：它们由范式声明（`canonical()` / `fsd()` → `params`）
 * 或项目显式给（`designSystem({ … })`）；缺了就由 `requires: ['designSystem.<字段>']` 让依赖它的规则
 * **明列停用** —— 而不是悄悄用三根范式的路径去量一个不存在的目录。
 *
 * `spacing` / `lengthProps` / `allowLengthValues` 曾在这里，但**没有任何规则读**（D12–D14 魔法数字族未实现、
 * 已委派 stylelint/eslint）—— 按"声明必须有消费者"删掉，实现时再加回。
 */
export interface DesignParams {
  themes: string[]
  styleDir: string
  tokenDir: string
  vendorDir: string
  paletteFile: string
  themeFile: string
  storageFile: string
  htmlKeys: string[]
  contrastPairs: ContrastPair[]
  /** 外部运行时提供的令牌命名空间（D04 视为闭合 / D05 不进退化账） */
  externalTokens: ExternalTokenNamespace[]
  /** 本包之外（或契约域之外）会消费本包令牌的文件 glob（D05 的"被引用"证据） */
  externalConsumers: string[]
}

const DEFAULTS: Pick<DesignParams, 'themes' | 'htmlKeys'> = {
  themes: ['dark', 'light'],
  htmlKeys: ['theme'],
}

/**
 * 解析设计系统参数：**项目在 `designSystem()` 里写的值必须盖过默认值**。
 *
 * 这里曾经只展开 `DEFAULTS`、没把 `ctx.config.params` 里的路径盖上去，于是
 * `tokenPrefix` / `spacing` / `styleDir` / `tokenDir` / `vendorDir` / `paletteFile` /
 * `themeFile` / `storageFile` 八个字段的配置**全部被静默忽略**：规则照默认路径去找，
 * 什么也找不到，还显示"通过"。字段逐条列出而不是 `...params`，是为了让这份可配清单可见 ——
 * 顺带避免把 `params` 里别的键（deps 的 allow / capabilities、maxDepth 等）漏进 DesignParams。
 */
export function designParams(ctx: RuleContext): DesignParams {
  const p = ctx.config.params as Partial<DesignParams>
  return {
    // 落点：只认项目/范式声明过的（缺了就是空串，而依赖它的规则已被能力协商停用）
    styleDir: p.styleDir ?? '',
    tokenDir: p.tokenDir ?? '',
    vendorDir: p.vendorDir ?? '',
    paletteFile: p.paletteFile ?? '',
    themeFile: p.themeFile ?? '',
    storageFile: p.storageFile ?? '',
    // 约定（可覆盖）：明暗主题名与 index.html 里的键名
    themes: p.themes ?? DEFAULTS.themes,
    htmlKeys: p.htmlKeys ?? DEFAULTS.htmlKeys,
    contrastPairs: p.contrastPairs ?? [],
    // 外部令牌与外部消费者都是"声明才生效"的修饰项：缺省 = 没有（行为与旧版一致）
    externalTokens: p.externalTokens ?? [],
    externalConsumers: p.externalConsumers ?? [],
  }
}

/** 令牌名是否落在声明的外部命名空间里（前缀匹配 —— 提供方能承诺的最小事实，不抄名单） */
export function isExternalToken(
  name: string,
  namespaces: readonly ExternalTokenNamespace[],
): boolean {
  return namespaces.some((namespace) => name.startsWith(namespace.prefix))
}

/** 外部消费者扫描的文件扩展名（只读文本；不解析、不进图） */
const CONSUMER_EXTENSIONS = [
  '.css',
  '.scss',
  '.less',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.html',
]

/** 外部消费者目录里天然不该进的子目录（与扫描根的默认口径一致） */
const CONSUMER_SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', '.arch-guard-cache'])

const TOKEN_MENTION = /--[a-zA-Z0-9-]+(?![a-zA-Z0-9-])/g

/**
 * **本包之外（或契约域之外）的消费者文件里出现过的令牌名**（D05 用）。
 *
 * 只补"事实"：读声明的 glob 命中的文本文件、按令牌名出现算被引用；不解析、不进依赖图、
 * 不改扫描根。支持相对配置根的路径（含 `..`）与绝对路径。
 *
 * **0 命中不静默**：返回空集 = 声明没生效，D05 与没声明时一致（该报的假死令牌照报）——
 * 宁可吵，不可把"以为补了事实"变成假绿。
 */
export function externalConsumerTokens(ctx: RuleContext, patterns: readonly string[]): Set<string> {
  const names = new Set<string>()
  for (const pattern of patterns) {
    const absolute = isAbsolute(pattern) ? pattern : resolve(ctx.config.root, pattern)
    for (const file of filesForGlob(absolute)) {
      let text: string
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      for (const match of text.matchAll(TOKEN_MENTION)) names.add(match[0])
    }
  }
  return names
}

/** 把一个（绝对）glob 展开成文件列表：目录部分来自字面前缀，匹配交给 picomatch */
function filesForGlob(absolutePattern: string): string[] {
  const match = picomatch(absolutePattern)
  const magic = absolutePattern.search(/[*?[{]/)
  if (magic === -1) {
    // 没有通配：可能是单个文件，也可能是整个目录
    if (!existsSync(absolutePattern)) return []
    const isDirectory = statSync(absolutePattern).isDirectory()
    return isDirectory
      ? walk(absolutePattern, { extensions: CONSUMER_EXTENSIONS, skip: CONSUMER_SKIP })
      : [absolutePattern]
  }
  const literal = absolutePattern.slice(0, magic)
  const base = literal.endsWith('/') ? literal.slice(0, -1) : dirname(literal)
  if (!existsSync(base) || !statSync(base).isDirectory()) return []
  return walk(base, { extensions: CONSUMER_EXTENSIONS, skip: CONSUMER_SKIP }).filter((file) =>
    match(file),
  )
}

export { finding, type FindingPosition } from './finding.js'

/** 用事实模型里的注释区间把注释遮罩成空格（避免注释里的示例被误判） */
export { maskTs } from './mask.js'

export interface CssFile {
  rel: string
  text: string
  masked: string
  vars: { name: string; value: string; line: number }[]
  varRefs: { name: string; line: number; hasFallback: boolean }[]
  selectors: { selector: string; line: number }[]
  rules: {
    selector: string
    line: number
    declarations: { prop: string; value: string; line: number }[]
    vars: { name: string; value: string; line: number }[]
  }[]
}

export function cssFiles(ctx: RuleContext): CssFile[] {
  return ctx.records
    .filter((record) => record.kind === 'css')
    .map((record) => {
      const text = ctx.sourceOf(record.rel) ?? ''
      return { ...parseCss(record.rel, text), text, masked: text }
    })
}

/**
 * 适配表声明的 vendor 选择器 / 变量前缀（编译成正则）。
 *
 * **D10 / D10b / P11 共用这一份** —— 曾经各自 `new RegExp(pattern)` 并拿**整份文件文本**去 test，
 * 于是 `vendorVars: ['^--ant-']` 里的 `^`（本意是"变量名开头"）变成了"文件开头"：
 * 变量不在第一行就检测不到 → D10 漏检、P11 误报「零使用」。
 * 匹配必须落在**结构化结果**上：选择器比选择器、变量比变量名（见 `usesVendorPatterns`）。
 */
export function vendorPatterns(ctx: RuleContext): { selectors: RegExp[]; vars: RegExp[] } | null {
  const adapter = Object.values(ctx.config.adapters).find((item) => item.facet === 'ui-kit') as
    { vendorSelectors?: string[]; vendorVars?: string[] } | undefined
  const selectors = (adapter?.vendorSelectors ?? []).map((pattern) => new RegExp(pattern))
  const vars = (adapter?.vendorVars ?? []).map((pattern) => new RegExp(pattern))
  if (selectors.length === 0 && vars.length === 0) return null
  return { selectors, vars }
}

/** 这个 CSS 文件里有没有出现适配表声明的 vendor 选择器 / 变量（定义与引用都算） */
export function usesVendorPatterns(
  file: CssFile,
  patterns: { selectors: RegExp[]; vars: RegExp[] },
): boolean {
  const selectorHit = (selector: string): boolean =>
    patterns.selectors.some((regex) => regex.test(selector))
  const varHit = (name: string): boolean => patterns.vars.some((regex) => regex.test(name))
  return (
    file.selectors.some((item) => selectorHit(item.selector)) ||
    file.vars.some((item) => varHit(item.name)) ||
    file.varRefs.some((item) => varHit(item.name))
  )
}

export const isTokenFile = (rel: string, params: DesignParams): boolean =>
  rel.startsWith(`${params.tokenDir}/`)

/* ---------------- 数值刻度白名单（D12–D14 与 D15 共用） ---------------- */

export interface ValueWhitelist {
  rule: string
  allow: string[]
}

/** 某一族声明的刻度白名单；没声明（或空）→ null = **这一族不判** */
export const whitelistOf = (
  ctx: { config: { params: Record<string, unknown> } },
  rule: string,
): string[] | null => {
  const lists = (ctx.config.params.valueWhitelists as ValueWhitelist[] | undefined) ?? []
  const found = lists.find((item) => item.rule === rule)
  return found && found.allow.length > 0 ? found.allow : null
}

/**
 * 从一个声明值里取出该族的数值（`13px 4px` → `['13px','4px']`）。
 *
 * 用 `postcss-value-parser` 取值 AST（R-150），不再 `split(/\s+/)` + 正则：
 * ① **函数里面也是值**：`padding: calc(100% - 13px)` / `width: min(100%, 320px)` /
 *    `margin: var(--gap, 13px)` 里的 `13px` 以前一个都取不到 —— D12–D14 于是对 `calc()` **完全失效**
 *    （而 D19 在 `design-numbers.ts` 里是**显式跳过** calc 的，两条规则态度不一致），
 *    而"把长度藏进 calc"是最省事的绕过写法；
 * ② **单位大小写不敏感**（CSS 规定如此）：`13PX` / `150MS` 以前取不到 → 不报，也不说；
 * ③ 数值**归一化**：`+13px` → `13px`、`2.0rem` → `2rem`、`0.0s` → `0` —— 白名单是按**值**写的，
 *    不是按拼写写（归一后的 `0` 会被调用方按"零到处都在"放过）；
 * ④ `url(...)` 里是地址不是数值（`url(13px)` 的词法也能切出一个 `13px` 词），显式不进去。
 *
 * 单位族（长度 / 时长）仍**要求带单位**：`line-height: 1.5` 的无单位倍数是正常写法，不该算魔法数字；
 * 无单位族（z-index）只认整数。
 */
const DIMENSION = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]+)$/
const INTEGER = /^[+-]?\d+$/

/** `+013` → `13` · `2.0` → `2` · `1e3` → `1000`（白名单按值写，所以要按值比） */
const normalizedNumber = (raw: string): string => String(Number(raw))

export const numericTokens = (value: string, units: string[]): string[] => {
  const allowed = new Set(units.map((unit) => unit.toLowerCase()))
  const out: string[] = []
  const visit = (nodes: valueParser.Node[]): void => {
    for (const node of nodes) {
      if (node.type === 'function') {
        if (node.value.toLowerCase() !== 'url') visit(node.nodes)
        continue
      }
      if (node.type !== 'word') continue
      if (allowed.size === 0) {
        if (INTEGER.test(node.value)) out.push(normalizedNumber(node.value))
        continue
      }
      const match = DIMENSION.exec(node.value)
      if (!match) continue
      const unit = (match[2] as string).toLowerCase()
      if (!allowed.has(unit)) continue
      const number = normalizedNumber(match[1] as string)
      out.push(number === '0' ? '0' : `${number}${unit}`)
    }
  }
  visit(valueParser(value).nodes)
  return out
}

/** 规则需要读项目里任意文件（如 index.html）时的兜底 */
export function tryRead(ctx: RuleContext, rel: string): string | null {
  const direct = ctx.sourceOf(rel)
  if (direct !== undefined) return direct
  try {
    return readFileSync(join(ctx.config.root, rel), 'utf8')
  } catch {
    return null
  }
}
