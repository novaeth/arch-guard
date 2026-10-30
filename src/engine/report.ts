import { recipeFor } from '../data/capability-recipes.js'
import { out } from './output.js'
import type { Diagnostic, SkippedRule } from './codes.js'
import type { Config, Domain, Finding, Level, Rule, Severity } from './types.js'
import { color } from './util.js'

/** 输出格式（CLI 与 explain 共用同一份取值） */
export type ReportFormat = 'pretty' | 'json' | 'github'

export interface ReportInput {
  config: Config
  ruleIndex: Map<string, Rule>
  findings: Finding[]
  /**
   * 因能力未声明而停用的规则。**每条尽可能带 `recipe`**：可以直接粘进配置的那一行
   * （与 pretty 输出用的是同一份 `capability-recipes`，单一出处）。
   *
   * 为什么必须有：读 JSON 的编码 agent 以前只知道"缺 `structure.slots`"，
   * **不知道要写什么** —— 只能再跑一次 pretty 或去翻文档，闭环断在最后一步。
   */
  skipped: (SkippedRule & { recipe?: string })[]
  unknownEnabled: string[]
  /** 机读自述（带稳定 code）—— 人读与机读看到的是同一份 */
  notices: Diagnostic[]
  /** `--paths` 的实际命中情况（null = 没给 `--paths`） */
  paths: { requested: string[]; matched: number } | null
  scope: string
  scopeFiles: number
  globalFindings: number
  /** 因 `--local-only` 被跳过的不可归属全局违规条数（0 = 没跳过任何东西） */
  skippedGlobals: number
  /** 因 `--severity` 被过滤掉的 finding 条数（0 = 没过滤；过滤必须可见） */
  filteredBySeverity: number
  durationMs: number
  rulesEnabled: number
  rulesTotal: number
  /**
   * 规则级例外：声明了什么、各自命中几处。**必须可见** ——
   * 未命中的也要点名（那说明它已经可以删掉了），否则例外会慢慢积成隐形门禁关闭。
   */
  exceptions: ExceptionReport[]
  /** 契约扫描域（空 = 全树） */
  contractScope: string[]
  /** `--brief`：附录折叠成一行摘要（信息不删：说清各有几条、怎么展开） */
  brief?: boolean
  /** 扫描域之外、不参与目录契约判定的 ts/css 文件数 */
  outsideContract: number
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  structure: '结构',
  design: '设计系统',
  copy: '文案',
  deps: '依赖',
  hygiene: '反退化',
  metrics: '度量',
}

export function severityOf(finding: Finding, ruleIndex: Map<string, Rule>): Severity {
  // 发现项可以覆盖规则声明的严重度（如 P06 对 `allowOwn` 能力降级为 warn）——
  // **唯一读取点**，所以报告 / 统计 / `--severity` 过滤不会各自为政
  return finding.severity ?? ruleIndex.get(finding.rule)?.severity ?? 'error'
}

export function summarize(
  findings: Finding[],
  ruleIndex: Map<string, Rule>,
): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const finding of findings) {
    if (severityOf(finding, ruleIndex) === 'warn') warnings += 1
    else errors += 1
  }
  return { errors, warnings }
}

/**
 * **`--paths` 一个文件都没匹配上 = 请求无法满足，不是"通过"**。
 *
 * 退出码已经是 2（`run.ts`），但人读输出的第一行以前仍是绿色的「✔ 架构守卫通过」——
 * 编辑器 hook / CI 日志摘录只看到那一行就会当成通过（真实用户实测踩过）。
 * 所以结论行要与退出码一致，并把 `paths-no-match` 自述**前置**到结论后面，而不是埋在附录末尾。
 */
const nothingJudged = (input: ReportInput): boolean =>
  input.paths !== null && input.paths.matched === 0

/**
 * **结论前置**（UX）：人读输出时第一眼该看到"过没过"，而不是先翻十行元信息。
 * 元信息（范围 / 自述 / 例外）全部归到末尾的附录（`renderSummary`），退出码语义不变。
 */
export function renderHeader(input: ReportInput): void {
  const { errors, warnings } = summarize(input.findings, input.ruleIndex)
  const meta = [
    `规则 ${input.rulesEnabled}/${input.rulesTotal}`,
    input.scopeFiles > 0 ? `${input.scopeFiles} 个文件` : null,
    `${input.durationMs}ms`,
  ]
    .filter(Boolean)
    .join(' · ')
  if (nothingJudged(input)) {
    // `--paths` 零命中：没有违规可报，但"没判定"必须一眼可见（✖ 与退出码 2 同义）
    out(color.red(`✖ 架构守卫失败：--paths 一个文件都没匹配到（本次 0 个文件被判定） · ${meta}`))
    const notice = input.notices.find((entry) => entry.code === 'paths-no-match')
    if (notice) out(color.red(`  ${notice.text}`))
    return
  }
  if (errors > 0) {
    out(color.red(`✖ 架构守卫失败：${errors} 个 error、${warnings} 个 warn · ${meta}`))
  } else {
    out(color.green(`✔ 架构守卫通过${warnings > 0 ? `（${warnings} 个 warn）` : ''} · ${meta}`))
  }
  // 空行只在"下面还有正文（违规）"时给，免得通过态出现两行空行
  if (input.findings.length > 0) out('')
}

export function renderReport(input: ReportInput): void {
  const { findings, ruleIndex } = input
  const byDomain = new Map<Domain, Finding[]>()
  for (const finding of findings) {
    const domain = ruleIndex.get(finding.rule)?.domain ?? 'structure'
    const list = byDomain.get(domain) ?? []
    list.push(finding)
    byDomain.set(domain, list)
  }

  for (const [domain, list] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out(color.bold(`${DOMAIN_LABEL[domain] ?? domain}（${list.length}）`))
    const ordered = [...list].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    for (const finding of ordered) {
      const severity = severityOf(finding, ruleIndex)
      const badge = severity === 'warn' ? color.yellow('warn ') : color.red('error')
      const mark = finding.global ? color.dim('（全局）') : ''
      out(
        `  ${badge} ${finding.file}:${finding.line}${finding.column !== undefined ? `:${finding.column}` : ''} ${color.cyan(`[${finding.rule}]`)} ${finding.text}${mark}`,
      )
      if (finding.hint) out(color.dim(`        → ${finding.hint}`))
    }
  }
}

export function renderSummary(input: ReportInput): void {
  out('')
  const parts = [
    `范围 ${input.scope}`,
    input.globalFindings > 0 ? `全局违规 ${input.globalFindings}` : null,
    input.skippedGlobals > 0 ? `--local-only 跳过全局违规 ${input.skippedGlobals}` : null,
    input.filteredBySeverity > 0 ? `--severity 过滤 ${input.filteredBySeverity} 条` : null,
    input.exceptions.length > 0
      ? `例外 ${input.exceptions.reduce((sum, entry) => sum + entry.hits, 0)} 处 / ${input.exceptions.length} 条声明`
      : null,
    input.contractScope.length > 0
      ? `扫描域 ${input.contractScope.join(',')}（域外 ${input.outsideContract} 个文件不判契约）`
      : null,
  ].filter(Boolean)
  out(color.dim(parts.join(' | ')))

  /**
   * **三类"没跑"分开说**（R-142）：能力未声明 / 不在启用名单 / 被过滤器收窄。
   * 以前只有第一类有自述，后两类落在所有桶之外 —— 报告只印 `规则 70/112`，读者算不出那 42 条去哪了。
   */
  const capabilityMissing = input.skipped.filter((entry) => entry.code === 'capability-missing')
  const notEnabled = input.skipped.filter((entry) => entry.code === 'not-enabled')
  const filteredOut = input.skipped.filter((entry) => entry.code === 'filtered')

  if (input.brief === true) {
    // 折叠**不删信息**：说清各有几条、怎么看全（静默是这套机制最该防的）
    const counted = [
      input.notices.length > 0 ? `自述 ${input.notices.length} 条` : null,
      input.skipped.length > 0
        ? `没跑 ${input.skipped.length} 条（${[
            capabilityMissing.length > 0 ? `能力 ${capabilityMissing.length}` : null,
            notEnabled.length > 0 ? `未启用 ${notEnabled.length}` : null,
            filteredOut.length > 0 ? `收窄 ${filteredOut.length}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}）`
        : null,
      input.exceptions.length > 0 ? `例外 ${input.exceptions.length} 条声明` : null,
      input.unknownEnabled.length > 0 ? `未知规则 ${input.unknownEnabled.length} 条` : null,
    ].filter(Boolean)
    if (counted.length > 0) {
      out(color.dim(`· ${counted.join(' · ')}（去掉 --brief 展开）`))
    }
    return
  }

  if (input.exceptions.length > 0) {
    const hits = input.exceptions.reduce((sum, entry) => sum + entry.hits, 0)
    out(color.dim(`\n例外（规则级）：命中 ${hits} 处 / ${input.exceptions.length} 条声明`))
    for (const entry of input.exceptions) {
      out(
        color.dim(
          `  · ${entry.rule} × ${entry.glob} —— ${entry.hits > 0 ? `命中 ${entry.hits} 处` : '未命中（可能可以删掉）'}；理由：${entry.reason}${entry.expires ? `；到期 ${entry.expires}` : ''}`,
        ),
      )
    }
  }
  /**
   * **三类"没跑"分开说**（R-142）：能力未声明 / 不在启用名单 / 被过滤器收窄。
   * 以前只有第一类有自述，后两类落在所有桶之外 —— 报告只印 `规则 70/112`，读者算不出那 42 条去哪了。
   */
  if (capabilityMissing.length > 0) {
    out(
      color.dim(
        `\n因能力未声明而停用 ${capabilityMissing.length} 条规则：${capabilityMissing.map((entry) => entry.rule).join(' / ')}`,
      ),
    )
    /**
     * **补什么 + 可复制片段**（R-106）：以前只说"少了能力"，用户还得翻文档全表才知道写哪一行。
     * 按"补法"归组，一行一条可以直接粘进配置的调用。
     */
    const byRecipe = new Map<string, string[]>()
    for (const entry of capabilityMissing) {
      const recipe = recipeFor(entry.missing)
      if (!recipe) continue
      byRecipe.set(recipe, [...(byRecipe.get(recipe) ?? []), entry.rule])
    }
    for (const [recipe, rules] of byRecipe) {
      out(color.dim(`    · ${rules.join(' ')} 想要就跑 → `) + color.cyan(recipe))
    }
  }
  if (notEnabled.length > 0) {
    out(
      color.dim(
        `\n未启用 ${notEnabled.length} 条规则（不在配置的 \`enable\` 名单里）：${notEnabled.map((entry) => entry.rule).join(' / ')}`,
      ),
    )
    out(
      color.dim(
        '    · 不配 = 不跑，不是通过：要跑就把它们加进 `arch.config.mjs` 的 `enable`，或换一个范式预设' +
          '（`--explain <规则 id>` 讲它要什么、`--list-rules` 列全表）',
      ),
    )
  }
  if (filteredOut.length > 0) {
    // 收窄是**用户自己敲的**，所以只报条数、不刷 id（106 个 id 对 `--only S45` 毫无信息量）
    out(
      color.dim(
        `\n被本次运行的过滤器收窄 ${filteredOut.length} 条规则（--only / --domain / --min-level）—— 不是它们没跑，是这次没让它们跑`,
      ),
    )
  }
  if (input.unknownEnabled.length > 0) {
    out(color.yellow(`⚠ 配置里启用了不存在的规则：${input.unknownEnabled.join(', ')}`))
  }
  for (const notice of input.notices) {
    // `paths-no-match` 已经在结论行后面**前置**过（见 renderHeader），附录不重复
    if (nothingJudged(input) && notice.code === 'paths-no-match') continue
    out(color.dim(`· ${notice.text}`))
  }
}

/** 报告里的一条例外（规则级） */
export interface ExceptionReport {
  rule: string
  glob: string
  reason: string
  expires?: string
  /** 本次被它摘掉的发现项条数（0 = 声明了但没命中） */
  hits: number
}

/**
 * **JSON 报告的契约版本**（消费方启动时断言自己认识的版本；不认识就明说"不认识这版报告"，
 * 而不是少读几个字段继续装绿）。
 *
 * 版本史：
 *   - **v1**：首个带版本的报告（coded notices / `paths` / 补齐人读里的数字）。
 *   - **v2**：**`ok` 语义收窄**（破坏性）—— 从"判过的东西没有 error"改成
 *     "**判过的东西没有 error，而且确实判了**"（`--paths` 零匹配、或全量下 0 个文件被判定时为 `false`）。
 *     起因：`--paths` 零匹配时退出码是 2、而 `ok` 还是 `true`，只读 stdout JSON 的消费方会把
 *     "请求没被满足"当成通过 —— 同一个「静默假绿」在新字段上复发了一次。
 *
 * 规矩（见 docs/DESIGN.md §6.9）：**增删顶层字段、增删 `notices[].code`、改字段含义 → 必须动这个号**；
 * 而"必须动"由 `tests/report-contract.test.mjs` 的**冻结测试**保证 —— 否则版本号只是个装饰
 * （本仓刚在 `exempt` 上踩过"装饰性配置"：写了但没人读）。
 */
export const REPORT_API_VERSION = 3

export interface JsonReport {
  /** 报告契约版本（`REPORT_API_VERSION`） */
  apiVersion: number
  ok: boolean
  errors: number
  warnings: number
  scope: string
  findings: (Finding & { domain?: Domain; level?: Level; severity: Severity })[]
  skipped: SkippedRule[]
  /** 因 `--local-only` 跳过的全局违规条数（机读侧同样不许静默丢弃） */
  skippedGlobals: number
  /** 因 `--severity` 过滤掉的 finding 条数（过滤改了报告，机读侧必须看得见） */
  filteredBySeverity: number
  /**
   * 全部自述性提示（扫描域 / 降级 / 缓存 / 过滤 / 退回工作区…）—— **带稳定 `code`**。
   *
   * 消费方按 `code` 判（`paths-no-match` / `severity-filtered` / `facts-cache`…），**不要匹配文案**：
   * 文案是本仓随时可以改的内部细节，把它当契约就是第二处真相。
   */
  notices: { code: Diagnostic['code']; text?: string }[]
  /** 本次判定了多少个文件（人读摘要里一直有，机读侧以前**没有** → 「机读 ⊂ 人读」是同一类假绿） */
  scopeFiles: number
  /** 不可归属的全局（架构级）违规条数 */
  globalFindings: number
  /** 跑起来的规则数 / 总规则数（`enabled/total`；差值 = `skipped` 条数） */
  rulesEnabled: number
  rulesTotal: number
  /**
   * `--paths` 的实际命中情况；没给 `--paths` 时为 null。
   * `matched: 0` = **什么都没判**（退出码为 2，别再当成"通过"）。
   */
  paths: { requested: string[]; matched: number } | null
  /** 规则级例外（声明 + 命中数），机读侧同样可见 */
  exceptions: ExceptionReport[]
  /** 契约扫描域（空 = 全树），以及域外不判契约的文件数 */
  contractScope: string[]
  outsideContract: number
  durationMs: number
}

export function toJsonReport(input: ReportInput): JsonReport {
  const { errors, warnings } = summarize(input.findings, input.ruleIndex)
  return {
    apiVersion: REPORT_API_VERSION,
    /**
     * `ok` 回答「**判下来的结论是不是通过**」，**不是**「要不要拦」——后者是退出码的事，两者故意不同：
     *
     * | 通道 | 回答 | 反例（两者不一致是**设计**） |
     * | --- | --- | --- |
     * | 退出码 | 要不要拦 | `--report-only`（有 error 也退 0）、`--local-only`（跳过了全局违规仍退 0） |
     * | `ok` | 结论是否通过 | `--paths` 零匹配（退出 2，但这里必须是 `false`：**请求没被满足**） |
     *
     * 所以判据是两条：**判过的东西没有 error**，**而且确实判了**。
     * 缺后半句的后果实测过：`ok: true` + 退出 2 并存，只读 stdout JSON、拿不到退出码的
     * CI 脚本 / PR bot 会把"你要求判的东西一件都没判"读成通过。
     */
    ok: errors === 0 && (input.paths === null || input.paths.matched > 0) && input.scopeFiles > 0,
    errors,
    warnings,
    scope: input.scope,
    findings: input.findings.map((finding) => {
      const rule = input.ruleIndex.get(finding.rule)
      return {
        ...finding,
        domain: rule?.domain,
        level: rule?.level,
        // 走 severityOf（不是直接读规则的严重度）：`allowOwn` 之类**逐条覆盖**的降级
        // 必须同时体现在 counts、退出码、pretty、github 与 JSON —— 否则机读侧与人读侧对不上
        severity: severityOf(finding, input.ruleIndex),
      }
    }),
    skipped: input.skipped.map((entry) => {
      const recipe = recipeFor(entry.missing)
      return recipe ? { ...entry, recipe } : entry
    }),
    exceptions: input.exceptions,
    skippedGlobals: input.skippedGlobals,
    filteredBySeverity: input.filteredBySeverity,
    /**
     * `--brief` 下**只给 `code`**（省掉 `text`）——这不是丢信息：按本仓的契约，
     * 消费方就该**按 `code` 判**、文案是随时可改的内部细节（见 docs/DESIGN.md §6.9）。
     * 编码 agent 每次编辑后跑的那一轮，省下的是这几千字节的上下文。
     */
    notices:
      input.brief === true ? input.notices.map((notice) => ({ code: notice.code })) : input.notices,
    scopeFiles: input.scopeFiles,
    globalFindings: input.globalFindings,
    rulesEnabled: input.rulesEnabled,
    rulesTotal: input.rulesTotal,
    paths: input.paths,
    contractScope: input.contractScope,
    outsideContract: input.outsideContract,
    durationMs: input.durationMs,
  }
}

/** GitHub Actions 注解：每条违规一行 `::error file=…,line=…::text`（reviewdog 风格） */
export function renderGithubAnnotations(input: ReportInput): string {
  const lines: string[] = []
  for (const finding of input.findings) {
    const severity = severityOf(finding, input.ruleIndex) === 'warn' ? 'warning' : 'error'
    const title = `${finding.rule} ${finding.text}`.replace(/[\r\n]+/g, ' ')
    const col = finding.column !== undefined ? `,col=${finding.column}` : ''
    lines.push(
      `::${severity} file=${finding.file},line=${finding.line}${col},title=${title}::${title}`,
    )
  }
  return lines.join('\n')
}

/** 规则耗时与命中统计（--stats）：用来回答「为什么这次跑了 3 秒」 */
export function renderStats(
  _input: ReportInput,
  stats: { rule: string; domain: string; ms: number; hits: number }[],
): string {
  const rows = [...stats].sort((a, b) => b.ms - a.ms)
  const total = stats.reduce((sum, item) => sum + item.ms, 0)
  const width = Math.max(...rows.map((row) => row.rule.length), 4)
  const lines = rows.map(
    (row) =>
      `  ${row.rule.padEnd(width)}  ${row.domain.padEnd(9)}  ${row.ms.toFixed(2).padStart(8)}ms  ${String(row.hits).padStart(3)} 命中`,
  )
  lines.push(`  合计 ${total.toFixed(2)}ms / ${rows.length} 条规则（扫描之外的时间：解析与图构建）`)
  return lines.join('\n')
}
