import { join } from 'node:path'

import { depsPolicyFrom } from './deps.js'
import { MERGE_SPEC } from './merge-spec.js'
import type { Config } from './types.js'
import { readText, relOf, walk } from './util.js'

/**
 * 文档管理块：把「人读的文档」里那几张表**从 `arch.config.mjs` 渲染出来**（DESIGN §7.3）。
 *
 * 解决的是这一条：`arch.config.mjs` 是唯一机读真相，但文档里的选型表 / 阈值 / 角色表是**手抄**的，
 * 改一处忘一处就漂移；而 agent 恰恰最容易被过时文档带偏 —— 它读到的"规范"必须与门禁判的是同一份。
 *
 * 用法：在文档里包一块
 * ```md
 * <!-- arch-guard:begin deps -->
 * （这里的内容由 --render-docs 生成，不要手改）
 * <!-- arch-guard:end deps -->
 * ```
 * `--render-docs` 重写块内容，`--check-docs` 只校验（不符即红）。块名必须登记在 `DOC_BLOCKS` 里 ——
 * 拼错直接报错，而不是安静地什么都不做（那会让"文档已同步"变成假象）。
 */

export type DocBlockRenderer = (config: Config) => string

const table = (headers: string[], rows: string[][]): string => {
  const head = `| ${headers.join(' | ')} |`
  const rule = `| ${headers.map(() => '---').join(' | ')} |`
  return [head, rule, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

const code = (value: string): string => `\`${value}\``

/** 能力表 + 批准清单（P 域的两张表；AGENTS.md 的选型表就是它） */
const renderDeps: DocBlockRenderer = (config) => {
  const policy = depsPolicyFrom(config.params)
  const lines: string[] = []
  const capabilities = Object.entries(policy.capabilities).sort(([a], [b]) => a.localeCompare(b))
  lines.push('**能力表**（`deps({ capabilities })`）：这个能力必须用哪个方案（驱动 P06 手搓指纹）')
  lines.push('')
  lines.push(
    capabilities.length > 0
      ? table(
          ['能力', '首选方案'],
          capabilities.map(([capability, preferred]) => [code(capability), code(preferred)]),
        )
      : '（未登记任何能力 —— 项目不需要受限的选型）',
  )
  lines.push('')
  lines.push('**批准清单**（`deps({ allow })`，**非空才开启** P01「未登记即拒」）：')
  lines.push('')
  lines.push(
    policy.allow.length > 0
      ? policy.allow.map((name) => `- ${code(name)}`).join('\n')
      : '（未开启 P01：能力表**不会**隐式打开白名单，见 ADR-0005）',
  )
  if (policy.deny.length > 0) {
    lines.push('')
    lines.push('**明确禁用**（`deps({ deny })`）：')
    lines.push('')
    lines.push(policy.deny.map((name) => `- ${code(name)}`).join('\n'))
  }
  return lines.join('\n')
}

const renderThresholds: DocBlockRenderer = (config) =>
  table(
    ['阈值', '值', '被判的规则'],
    [
      ['文件代码行', String(config.thresholds.fileLines), 'S16'],
      ['页面代码行', String(config.thresholds.viewLines), 'S16'],
      ['函数行数', String(config.thresholds.functionLines), 'S16'],
      ['单文件导出值', String(config.thresholds.exportsPerFile), 'S19'],
      ['单文件组件数', String(config.thresholds.componentsPerFile), 'S19'],
    ],
  )

const renderLayout: DocBlockRenderer = (config) =>
  table(
    ['项', '值'],
    [
      ['源码根 `srcRoot`', code(config.srcRoot)],
      ['装配层 `app`', code(config.layout.app)],
      [
        '业务域 `modules`',
        config.layout.modules === '' ? '（本范式没有这一层）' : code(config.layout.modules),
      ],
      [
        '共享层 `shared`',
        config.layout.shared === '' ? '（本范式没有这一层）' : code(config.layout.shared),
      ],
      ['可达性入口', config.entries.length > 0 ? config.entries.map(code).join(' · ') : '（无）'],
      ['元框架 / 源码形态', code(config.sourceForm)],
    ],
  )

const renderStructure: DocBlockRenderer = (config) =>
  table(
    ['声明', '含义', '规则'],
    [
      ['`order`', config.structure.order ? '开启：只许依赖层号 ≤ 自己的文件' : '关闭', 'S21'],
      [
        '`isolate`',
        config.structure.isolate.length > 0
          ? `组维度：${config.structure.isolate.map(code).join(' · ')}（同层不同组不许互引）`
          : '（未声明）',
        'S22',
      ],
      [
        '`publicApi`',
        config.structure.publicApi.length > 0
          ? `组维度：${config.structure.publicApi.map(code).join(' · ')}（组必须有入口）`
          : '（未声明）',
        'S23',
      ],
    ],
  )

const renderScanScope: DocBlockRenderer = (config) => {
  const lines: string[] = []
  lines.push('**契约扫描域 `include`**（只有命中的 ts/css 参与角色判定；域外仍进依赖图）：')
  lines.push('')
  lines.push(
    config.include.length > 0
      ? config.include.map((glob) => `- ${code(glob)}`).join('\n')
      : '- （不限）',
  )
  lines.push('')
  lines.push('**`ignore`（别碰：不进文件集、不解析、不进图）**：')
  lines.push('')
  lines.push(
    config.ignore.length > 0
      ? config.ignore.map((glob) => `- ${code(glob)}`).join('\n')
      : '- （无）',
  )
  return lines.join('\n')
}

const renderRoles: DocBlockRenderer = (config) =>
  table(
    ['角色', '路径 glob', '层号', '槽位', '组', '公开面'],
    config.roles.map((role) => [
      code(role.id),
      code(role.pattern),
      String(role.layer),
      role.slot ? code(role.slot) : '—',
      role.group ? code(role.group) : '—',
      role.entry === true ? '✔' : '—',
    ]),
  )

const renderParams: DocBlockRenderer = (config) => {
  const keys = [
    'styleDir',
    'tokenDir',
    'vendorDir',
    'paletteFile',
    'themeFile',
    'storageFile',
    'i18nDir',
  ]
  const rows = keys
    .map((key) => [key, config.params[key]])
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].length > 0)
  return rows.length > 0
    ? table(
        ['路径参数（落点）', '值'],
        rows.map(([key, value]) => [code(key), code(value)]),
      )
    : '（本项目没有声明任何落点参数）'
}

const renderExceptions: DocBlockRenderer = (config) =>
  config.exceptions.length > 0
    ? table(
        ['规则', '路径 glob', '理由', '到期'],
        config.exceptions.map((entry) => [
          code(entry.rule),
          code(entry.glob),
          entry.reason,
          entry.expires ? code(entry.expires) : '—',
        ]),
      )
    : '（本项目没有任何规则级例外）'

/**
 * **配置键的合并语义**（R-144）：这块由 `MERGE_SPEC` **渲染** —— 表即实现即文档，
 * 手抄一份迟早会与代码漂移（`--check-docs` 盯着它）。
 */
const renderMergeSpec: DocBlockRenderer = () => {
  const lines: string[] = []
  lines.push(
    '每一把键在**两根轴**上各是什么语义（`single` 单值替换 / `fields` 逐键 / `union` 并集 /',
  )
  lines.push('`concat` 拼接 / `special` 有专属合并器 / `—` 这一层不许写）：')
  lines.push('')
  lines.push(
    table(
      ['键', '预设之间', '项目层', '说明'],
      Object.entries(MERGE_SPEC).map(([key, spec]) => [
        code(key),
        spec.presets === 'n/a' ? '—' : code(spec.presets),
        spec.project === 'n/a' ? '—' : code(spec.project),
        spec.note ?? '',
      ]),
    ),
  )
  return lines.join('\n')
}

export const DOC_BLOCKS: Record<string, DocBlockRenderer> = {
  deps: renderDeps,
  thresholds: renderThresholds,
  layout: renderLayout,
  structure: renderStructure,
  'scan-scope': renderScanScope,
  roles: renderRoles,
  params: renderParams,
  exceptions: renderExceptions,
  'merge-spec': renderMergeSpec,
}

export const BLOCK_NAMES = Object.keys(DOC_BLOCKS).sort()

const BEGIN = /^\s*<!--\s*arch-guard:begin\s+([A-Za-z0-9-]+)\s*-->\s*$/
const END = /^\s*<!--\s*arch-guard:end\s+([A-Za-z0-9-]+)\s*-->\s*$/

export interface DocSpan {
  name: string
  /** 0-based：begin / end 行的下标 */
  beginLine: number
  endLine: number
}

/** 找出文档里的管理块（不渲染，只定位） */
export function parseDocBlocks(text: string): { spans: DocSpan[]; errors: string[] } {
  const lines = text.split('\n')
  const spans: DocSpan[] = []
  const errors: string[] = []
  let open: { name: string; line: number } | null = null
  /** 围栏代码块里的内容一律不看 —— 否则"示范标记语法"本身会被当成真块（本仓 README / CHANGELOG 就踩过） */
  /**
   * 围栏要按 **CommonMark 的规则**配对：**同一字符、且长度不短于开启它的那串**才算闭合。
   * 为什么较真：文档里用 ````（四反引号）嵌 ```（三反引号）示例是常规写法 —— 按"首字符"配对会把
   * 内层的 ``` 当成闭合，于是**它后面的管理块整段被当成"围栏内"，静默不渲染也不校验**
   * （实测：DESIGN.md 里 `merge-spec` 块就是这么消失的）。
   */
  let fence: { char: string; length: number } | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1] as string
      const char = marker[0] as string
      if (fence === null) fence = { char, length: marker.length }
      else if (fence.char === char && marker.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const begin = line.match(BEGIN)
    if (begin) {
      const name = begin[1] as string
      if (open) {
        errors.push(
          `第 ${index + 1} 行：块 ${name} 嵌在未闭合的块 ${open.name}（第 ${open.line} 行）里`,
        )
      } else {
        open = { name, line: index + 1 }
      }
      continue
    }
    const end = line.match(END)
    if (!end) continue
    const name = end[1] as string
    if (!open) {
      errors.push(`第 ${index + 1} 行：块 ${name} 的 end 没有对应的 begin`)
      continue
    }
    if (open.name !== name) {
      errors.push(
        `第 ${index + 1} 行：end ${name} 与 begin ${open.name}（第 ${open.line} 行）不配对`,
      )
      open = null
      continue
    }
    spans.push({ name, beginLine: open.line - 1, endLine: index })
    open = null
  }
  if (open) errors.push(`块 ${open.name}（第 ${open.line} 行）没有 end 标记`)
  for (const span of spans) {
    if (DOC_BLOCKS[span.name] === undefined) {
      errors.push(
        `第 ${span.beginLine + 1} 行：未知块名 ${span.name}（可用：${BLOCK_NAMES.join(' / ')}）—— 拼错会静默不同步，所以这里直接报错`,
      )
    }
  }
  return { spans, errors }
}

/**
 * 比较用的归一化：**留白不是事实**。
 *
 * 为什么需要它：`prettier --write` 会把 Markdown 表格按列对齐（中文还按显示宽度算），
 * 于是渲染器的原始输出与文件里的内容逐字节不同 —— 但**单元格内容完全一致**。
 * 把"对齐"判成漂移，只会逼着引擎去复刻 prettier 的排版算法（那是一份新的真相），
 * 所以这里比较的是"归一化后的内容"：行内空白压成一个空格、首尾空行去掉、连续空行压成一个。
 */
const SEPARATOR = /^\|[\s:|-]+\|$/

function normalizeBody(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const flat = line.replace(/\s+/g, ' ').trim()
      // 表格分隔行的**横线长度**也是排版（prettier 会按列宽拉长），不是事实
      return SEPARATOR.test(flat) ? flat.replace(/-{2,}/g, '---') : flat
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

/** 渲染一份文档（不写文件）：返回新文本、变化的块名与错误 */
export function renderDocText(
  text: string,
  config: Config,
): { text: string; changed: string[]; errors: string[] } {
  const { spans, errors } = parseDocBlocks(text)
  if (errors.length > 0) return { text, changed: [], errors }
  if (spans.length === 0) return { text, changed: [], errors: [] }

  const lines = text.split('\n')
  const next: string[] = []
  const changed: string[] = []
  let cursor = 0
  for (const span of spans) {
    next.push(...lines.slice(cursor, span.beginLine + 1))
    const body = DOC_BLOCKS[span.name]?.(config) ?? ''
    const current = lines.slice(span.beginLine + 1, span.endLine)
    // 空白不计入漂移（prettier 会把表格对齐）；内容一变就必须报
    if (normalizeBody(current.join('\n')) !== normalizeBody(body)) changed.push(span.name)
    if (body !== '') next.push(...body.split('\n'))
    next.push(lines[span.endLine] as string)
    cursor = span.endLine + 1
  }
  next.push(...lines.slice(cursor))
  return { text: next.join('\n'), changed, errors: [] }
}

/** 文档候选文件：仓库里的 Markdown（跳过构建产物与依赖） */
export function discoverDocFiles(root: string): string[] {
  return walk(root, {
    skip: new Set(['node_modules', '.git', 'es', 'lib', 'dist', 'coverage', '.arch-guard-cache']),
    extensions: ['.md'],
  })
    .map((file) => relOf(root, file))
    .sort()
}

export interface DocSyncResult {
  file: string
  changed: string[]
  rendered: string
}

/** 扫描全部文档：哪些文件的管理块与 config 不一致（`--check-docs` 与 `--render-docs` 共用） */
export function collectDocDiffs(
  root: string,
  config: Config,
): { diffs: DocSyncResult[]; errors: string[]; filesWithBlocks: number } {
  const diffs: DocSyncResult[] = []
  const errors: string[] = []
  let filesWithBlocks = 0
  for (const rel of discoverDocFiles(root)) {
    const text = readText(join(root, rel))
    if (!text.includes('arch-guard:begin')) continue
    filesWithBlocks += 1
    const rendered = renderDocText(text, config)
    for (const error of rendered.errors) errors.push(`${rel} ${error}`)
    if (rendered.errors.length === 0 && rendered.changed.length > 0) {
      diffs.push({ file: rel, changed: rendered.changed, rendered: rendered.text })
    }
  }
  return { diffs, errors, filesWithBlocks }
}
