import { writeFileSync } from 'node:fs'
import { aggregate, readCoverageReport, type CoverageReport } from './coverage.js'
import { join } from 'node:path'

import { loadConfig } from './config.js'
import { depsPolicyFrom, policyConflicts, readProjectDeps } from './deps.js'
import { wheelFingerprints } from '../data/wheel-fingerprints.js'
import { collectSources } from './collect.js'
import { buildGraph } from './graph.js'
import {
  pushAdapterNotice,
  pushCopyListNotice,
  pushDeclarationNotices,
  pushDisabledRulesNotice,
  pushScanNotices,
} from './notices.js'
import { pushAdviceNotices } from './advice.js'
import { collectI18n } from './i18n.js'
import { err, json, out } from './output.js'
import { createRegistry } from './registry.js'
import {
  renderGithubAnnotations,
  renderHeader,
  renderReport,
  renderStats,
  renderSummary,
  severityOf,
  toJsonReport,
  type ExceptionReport,
  type ReportInput,
} from './report.js'
import { scanProject } from './scan.js'
import type { Diagnostic } from './codes.js'
import type { SourceFormBinding } from './source-form.js'
import type { Config, Domain, Finding, Level, Rule, RuleContext, Severity } from './types.js'
import { applyReportFilters } from './filters.js'
import { gitChangedFiles, gitHeadTimeMs, gitIgnoredPaths, stagedContentsOf } from './git.js'
import { exists, globToRegExp } from './util.js'
import { applySeverity } from './config-policy.js'
import { shouldJudge } from './rule-scope.js'

export type ScopeMode = 'full' | 'changed' | 'staged' | `since:${string}`

export interface RunOptions {
  /** `--brief`：附录只给一行摘要（信息不删，只折叠） */
  brief?: boolean
  cwd: string
  configPath?: string
  scope?: string
  paths?: string[]
  domain?: Domain[]
  only?: string[]
  minLevel?: Level
  severity?: Severity
  /** 只刷新覆盖率棘轮快照（M04）；与「豁免违规」无关 —— 违规没有豁免渠道 */
  updateCoverage?: boolean
  reportOnly?: boolean
  localOnly?: boolean
  format?: 'pretty' | 'json' | 'github'
  /** 打印每条规则的耗时与命中（排查「为什么这么慢」） */
  stats?: boolean
  /** 覆盖率产物路径（覆盖 metrics 适配器里的配置；门禁只读它，不跑测试） */
  coverageReport?: string
  /**
   * **完整规则集**（R-143 起叫 `ruleSet`）：给了就**替代**配置里那份（程序化调用 / 单测用）。
   * 要**追加**规则请在配置里写 `overrides.customRules` —— 两者语义不同，名字也不同。
   */
  ruleSet?: Rule[]
  /** 调用方（CLI）注入的源码形态实现（`rules` + `adapters`）；宿主不写这个 */
  sourceForms?: SourceFormBinding[]
  /** facts 持久缓存（默认开）；`false` = 每轮全量解析 */
  cache?: boolean
  quiet?: boolean
}

/** 单条规则的执行统计（--stats 用） */
export interface RuleStat {
  rule: string
  domain: string
  ms: number
  hits: number
}

export interface RunResult {
  exitCode: number
  /** facts 缓存命中情况（`cache: false` 时恒为 0/文件数） */
  cache: { hits: number; misses: number }
  config: Config
  all: Finding[]
  active: Finding[]
  scope: string
  scopeFiles: string[]
  /** `--local-only` 跳过的全局违规条数（0 = 没跳过；程序化调用方也拿得到这个事实） */
  skippedGlobals: number
  /** `--severity` 过滤掉的 finding 条数（0 = 没过滤；同理不许静默） */
  filteredBySeverity: number
  /** `--paths` 实际匹配到的文件数（null = 没给 --paths；0 = 什么都没判，退出码为 2） */
  pathsMatched: number | null
  /** 全部机读自述（带稳定 code）—— 程序化调用方与 JSON 看到的是同一份 */
  notices: Diagnostic[]
  durationMs: number
  stats: RuleStat[]
}

/** 覆盖率总览（棘轮快照写的就是这三个数） */
function coverageTotals(report: CoverageReport): {
  lines: number
  branches: number
  functions: number
} {
  const stats = aggregate(report, () => true)
  return {
    lines: stats?.lines ?? 0,
    branches: stats?.branches ?? 0,
    functions: stats?.functions ?? 0,
  }
}

export async function runGuard(options: RunOptions): Promise<RunResult> {
  const started = Date.now()
  const quiet = options.quiet === true
  const notices: Diagnostic[] = []

  const { config, notices: configNotices } = await loadConfig({
    root: options.cwd,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.sourceForms ? { sourceForms: options.sourceForms } : {}),
    // 调用方给的完整规则集要**在解析期**就参与合并（`overrides.customRules` 仍会追加）
    ...(options.ruleSet ? { ruleSet: options.ruleSet } : {}),
  })
  notices.push(...configNotices)

  pushDisabledRulesNotice(config, notices)

  /**
   * 规则集：**配置解析期已算定**（内置集 + `overrides.customRules`），这里只处理"调用方整体替换"。
   * 见 ADR-0009 —— 以前 `run.ts` 与 CLI 各推一遍，现在读同一份 `config.rules`。
   */
  const rules = applySeverity(config.rules, config.severity ?? {})
  if (rules.length === 0) {
    throw new Error(
      '没有任何可跑的规则：调用方既没注入源码形态实现（sourceForms），也没给 ruleSet\n' +
        '（CLI 会自动注入内置实现；程序化调用请传 sourceForms 或 ruleSet；' +
        '给项目加规则写在 arch.config.mjs 的 overrides.customRules 里）',
    )
  }

  // git 判定「不在仓库里」的路径（.gitignore / info/exclude / 全局）：
  // **作为基础**叠加在宿主显式 `ignore` 之上，只作用于契约域外；取不到 git 就整层降级关闭。
  const vcsIgnored = gitIgnoredPaths(config.root)
  const scan = scanProject(config, vcsIgnored ? { vcsIgnored } : {})
  // 收窄扫描域是行为变更（域外文件不再报 S01），必须自述 —— 不许静默
  /* ---- scope 提前算：`staged` 要影响**读哪份内容**（index blob vs 工作区），所以必须在解析之前 ---- */
  const scope = options.scope ?? 'full'
  const changed = scope === 'full' ? null : gitChangedFiles(config.root, scope)
  const scanned = new Set([...scan.records, ...scan.outside].map((record) => record.rel))
  const staged =
    scope === 'staged' && changed !== null
      ? // 只向 git 要会被解析的文件：变更集里可能有图片等非源码，读它们的 blob 没意义
        stagedContentsOf(
          config.root,
          changed.files.filter((rel) => scanned.has(rel)),
        )
      : null
  // 扫描域 / 边界 / 阈值的自述（函数化：runGuard 有函数长度上限，且这是内聚的一步）
  pushScanNotices(config, scan, notices)
  pushAdapterNotice(config, notices)

  if (staged && staged.missing.length > 0) {
    notices.push({
      code: 'staged-fallback',
      text: `staged：${staged.missing.length} 个文件取不到 index 内容（staged 删除或 git 报错），已退回工作区内容：${staged.missing.slice(0, 5).join(' , ')}${staged.missing.length > 5 ? ' …' : ''}`,
    })
  }

  // 读源码 → 提事实 → 缓存（见 collect.ts：契约域内 + 域外都要解析，staged 取 index 内容）
  const collected = collectSources({
    config,
    records: scan.records,
    outside: scan.outside,
    staged: staged ? staged.contents : null,
    useCache: options.cache !== false,
    notice: (diagnostic) => notices.push(diagnostic),
  })
  const { texts, facts, cssTexts } = collected
  // "声明配了却 0 命中"的自述要读**调用 / 读取事实**（方案面的 apis 清单），所以放在提事实之后
  pushDeclarationNotices(config, scan.records, scan.files, notices, facts)

  const graph = buildGraph({ config, files: scan.files, facts, cssTexts })
  // 架构建议（R-118）：从已有事实算信号 + 处方，永不阻断
  pushAdviceNotices({ config, records: scan.records, facts, graph, files: scan.files }, notices)
  const sourceOf = (rel: string): string | undefined => texts.get(rel)

  // 依赖策略：自相矛盾必须报错（不许默默按某一侧生效）
  const policy = depsPolicyFrom(config.params)
  const platformCapabilities = wheelFingerprints
    .filter((entry) => entry.platform === true)
    .map((entry) => entry.capability)
  const conflicts = policyConflicts(policy, platformCapabilities)
  if (conflicts.length > 0) {
    throw new Error(`依赖策略自相矛盾：\n  - ${conflicts.join('\n  - ')}`)
  }
  // 能力表不再隐式开启 P01：把这条语义显式说出来，避免用户以为还处在「未登记即拒」模式
  if (policy.allow.length === 0 && Object.keys(policy.capabilities).length > 0) {
    notices.push({
      code: 'deps-allow-not-enabled',
      text: '能力表只驱动 P06（手搓指纹），本次未开启 P01 依赖白名单；要「未登记即拒」请显式写 deps({ allow: [...] })',
    })
  }
  const deps = readProjectDeps(config.root, graph.externals.keys())

  const registry = createRegistry(rules, config, {
    ...(options.only ? { only: options.only } : {}),
    ...(options.domain ? { domain: options.domain } : {}),
    ...(options.minLevel ? { minLevel: options.minLevel } : {}),
  })

  // C01 的名单来源要自述（换库会让那一半静默关掉）—— 放在 registry 之后，因为它只在 C01 真的跑时才说
  pushCopyListNotice(config, registry, notices)

  const i18n = collectI18n({
    records: scan.records,
    sourceOf,
    resourceDir: String(
      (config.adapters.i18n as { resourceDir?: string } | undefined)?.resourceDir ?? '',
    ),
  })

  /* ---- 度量产物：门禁只读，不跑测试；读不到就交给 M06 fail-closed ---- */
  const metricsAdapter = config.adapters.metrics as
    | {
        coverage?: {
          report?: string
          ratchet?: boolean
          baselineFile?: string
          pathRewrite?: [string, string][]
        }
      }
    | undefined
  const reportPath = options.coverageReport ?? metricsAdapter?.coverage?.report
  let metricsInfo: RuleContext['metrics']
  if (reportPath) {
    const abs = join(config.root, reportPath)
    try {
      const report = readCoverageReport(abs, config.root)
      for (const [pattern, replacement] of metricsAdapter?.coverage?.pathRewrite ?? []) {
        const matcher = new RegExp(pattern)
        for (const file of report.files) file.rel = file.rel.replace(matcher, replacement)
      }
      metricsInfo = { reportPath, report }
    } catch (error) {
      metricsInfo = { reportPath, report: null, error: (error as Error).message }
    }
  }

  const ctx: RuleContext = {
    config,
    records: scan.records,
    facts,
    i18n,
    ...(metricsInfo ? { metrics: metricsInfo } : {}),
    git: {
      changedFiles: changed?.files ?? null,
      // 只有 metrics 域（M06 判覆盖率产物是否过期）会读 headTimeMs。
      // 没有 metrics 适配器时就不该起 git 子进程：省一次 spawn，也避免在没有 git 的目录里
      // 把 git 自己的「致命错误」打到用户的 stderr 上（execFileSync 的 stderr 默认透传）。
      headTimeMs: metricsInfo ? gitHeadTimeMs(config.root) : null,
    },
    graph,
    scan,
    deps,
    policy,
    files: scan.files,
    sourceOf,
  }

  const recordByRel = new Map(scan.records.map((record) => [record.rel, record]))
  const all: Finding[] = []
  const stats: RuleStat[] = []
  for (const rule of registry.enabled) {
    const startedAt = performance.now()
    try {
      let hits = 0
      for (const finding of rule.run(ctx)) {
        // 规则照跑（别的文件还要判）；`appliesTo: 'product'` 只是让测试脚手架不产生发现项
        if (!shouldJudge(rule, finding, recordByRel)) continue
        all.push(finding)
        hits += 1
      }
      stats.push({ rule: rule.id, domain: rule.domain, ms: performance.now() - startedAt, hits })
    } catch (error) {
      // fail closed：规则自身异常绝不能静默通过
      all.push({
        rule: rule.id,
        file: '(engine)',
        line: 1,
        text: `规则执行异常：${(error as Error).message}`,
        hint: '这是引擎缺陷或规则实现问题，不是项目代码问题',
        global: true,
      })
      stats.push({ rule: rule.id, domain: rule.domain, ms: performance.now() - startedAt, hits: 1 })
    }
  }
  const ruleIndex = new Map(rules.map((rule) => [rule.id, rule]))
  all.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule),
  )

  /* ---- 规则级例外：只摘掉「指名的那条规则 × 那些文件」的发现项 ---- */
  // 关键：这是对**发现项**的后置过滤，不是扫描期的整文件跳过 ——
  // 文件照常有角色、进依赖图、被其它规则判定（曾经的文件级 exempt 会让整个文件失能）。
  const exceptionHits = config.exceptions.map(() => 0)
  if (config.exceptions.length > 0) {
    const knownRules = new Set(rules.map((rule) => rule.id))
    const today = new Date().toISOString().slice(0, 10)
    for (const entry of config.exceptions) {
      // fail-closed：拼错的规则 id 等于例外根本没生效（假绿），必须当场报
      if (!knownRules.has(entry.rule)) {
        throw new Error(
          `exceptions 引用了不存在的规则：${entry.rule}（${entry.glob}）—— 拼错等于没写，必须报出来`,
        )
      }
      if (entry.expires !== undefined && entry.expires < today) {
        throw new Error(
          `exceptions 已过期：${entry.rule} × ${entry.glob}（expires ${entry.expires}，今天 ${today}）—— 续期或删掉它`,
        )
      }
    }
    // 建议的例外同样"写了到期就必过期"（R-121，与 exceptions 同一纪律）
    for (const item of config.adviceAllow) {
      if (item.expires !== undefined && item.expires < today) {
        throw new Error(
          `adviceAllow 已过期：${item.signal} × ${item.glob}（expires ${item.expires}，今天 ${today}）—— 续期或删掉它`,
        )
      }
    }
    const matchers = config.exceptions.map((entry) => globToRegExp(entry.glob))
    const kept: Finding[] = []
    for (const finding of all) {
      const hit = config.exceptions.findIndex(
        (entry, index) =>
          entry.rule === finding.rule && (matchers[index] as RegExp).test(finding.file),
      )
      if (hit >= 0) {
        exceptionHits[hit] = (exceptionHits[hit] ?? 0) + 1
        continue
      }
      kept.push(finding)
    }
    all.splice(0, all.length, ...kept)
  }
  const exceptions: ExceptionReport[] = config.exceptions.map((entry, index) => ({
    ...entry,
    hits: exceptionHits[index] ?? 0,
  }))

  /* ---- 违规**没有**存量豁免：全量违规直接进报告，active 就是全部 ---- */
  let active: Finding[] = all

  // 覆盖率棘轮快照（M04 用）：这是"覆盖率不许倒退"的基线，与"豁免违规"是两件事
  if (options.updateCoverage) {
    const coverage = metricsAdapter?.coverage
    if (coverage?.ratchet === true && metricsInfo?.report) {
      const totals = coverageTotals(metricsInfo.report)
      writeFileSync(
        join(config.root, coverage.baselineFile ?? 'arch.coverage.json'),
        `${JSON.stringify({ specVersion: '1', files: metricsInfo.report.files.length, ...totals }, null, 2)}\n`,
        'utf8',
      )
      notices.push({
        code: 'coverage-updated',
        text: `已写入覆盖率快照：行 ${totals.lines.toFixed(2)}% / 分支 ${totals.branches.toFixed(2)}%`,
      })
    } else {
      notices.push({
        code: 'coverage-update-skipped',
        text: '--update-coverage：没启用覆盖率棘轮（metrics 的 coverage.ratchet）或覆盖率产物读不到，未写快照',
      })
    }
  }

  // 旧机制留下的文件：不再豁免任何东西 —— 明说，免得以为存量债还挂着
  if (exists(join(config.root, 'arch.baseline.json'))) {
    notices.push({
      code: 'legacy-baseline',
      text: '检测到 arch.baseline.json：违规基线机制已移除，存量违规不再被豁免（请删除该文件）',
    })
  }

  /* ---- 报告过滤（scope / --paths / --severity）：集中在一处，规矩是"只过滤报告且必须自述" ---- */
  const filtered = applyReportFilters({
    active,
    changed,
    scope,
    scanned,
    root: config.root,
    ruleIndex,
    notices,
    ...(options.paths ? { paths: options.paths } : {}),
    ...(options.severity ? { severity: options.severity } : {}),
    ...(options.localOnly ? { localOnly: true } : {}),
  })
  active = filtered.active
  const { scopeFiles, skippedGlobals, filteredBySeverity } = filtered
  /**
   * 「本次判定了多少个文件」：full 模式下 `filtered.scopeFiles` 是空的（那是"变更集"的概念），
   * 而机读侧要的正是这个数 —— 给 0 会让消费方以为"一个文件都没判"（人读摘要因为 `>0` 才打印，看不出来）。
   * 所以 full 用**契约域内有角色的文件数**（域外文件会被解析但不判定，不算在内）。
   */
  const judgedFiles = scopeFiles.length > 0 ? scopeFiles : scan.records.map((record) => record.rel)
  const globalFindings = active.filter((finding) => finding.global).length

  const reportInput: ReportInput = {
    config,
    ruleIndex,
    findings: active,
    skipped: registry.skipped,
    unknownEnabled: registry.unknownEnabled,
    notices,
    scope,
    scopeFiles: judgedFiles.length,
    globalFindings,
    skippedGlobals,
    filteredBySeverity,
    durationMs: Date.now() - started,
    rulesEnabled: registry.enabled.length,
    rulesTotal: rules.length,
    paths:
      options.paths && options.paths.length > 0
        ? { requested: options.paths, matched: filtered.pathsMatched ?? 0 }
        : null,
    exceptions,
    brief: options.brief === true,
    contractScope: config.include,
    outsideContract: scan.outside.length,
  }

  if (!quiet) {
    if (options.format === 'json') {
      json(toJsonReport(reportInput))
    } else if (options.format === 'github') {
      // 注解交给 CI 渲染；摘要仍走 stdout 便于人看
      const annotations = renderGithubAnnotations(reportInput)
      if (annotations) out(annotations)
      renderHeader(reportInput)
      renderSummary(reportInput)
    } else {
      renderHeader(reportInput)
      renderReport(reportInput)
      renderSummary(reportInput)
    }
    if (options.stats) {
      /**
       * **机读出口的 stdout 必须干净**：`--format=json` 产出的是一个完整 JSON 文档，
       * 后面再追一张表会让**任何**解析器炸（实测 `Extra data: line 65`）——
       * 编码 agent / CI bot 正是这么读的。所以机读格式下把统计表送去 stderr（人还看得见 ✓）。
       */
      const statsText = renderStats(reportInput, stats)
      if (options.format === 'json' || options.format === 'github') err(statsText)
      else out(statsText)
    }
  }

  const errors = active.filter((finding) => severityOf(finding, ruleIndex) !== 'warn').length
  /**
   * `--paths` 一个文件都没匹配上 = **你要求判的东西一件都没判** —— 这不是"通过"，是"请求无法满足"。
   * 退出 **2**（与"引擎/配置/参数问题"同类，fail-closed）：CI 里路径打错不会静默变绿，
   * 消费方靠 JSON 的 `paths.matched === 0` / `notices[].code === 'paths-no-match'` 判定，
   * 不需要去匹配中文文案。`--report-only` 仍然恒 0（它是显式的"只看不拦"）。
   */
  const nothingMatched = filtered.pathsMatched === 0
  const exitCode = options.reportOnly === true ? 0 : errors > 0 ? 1 : nothingMatched ? 2 : 0

  return {
    exitCode,
    config,
    cache: { hits: collected.cacheHits, misses: collected.cacheMisses },
    all,
    active,
    scope,
    scopeFiles,
    skippedGlobals,
    filteredBySeverity,
    pathsMatched: filtered.pathsMatched,
    notices,
    durationMs: Date.now() - started,
    stats,
  }
}
