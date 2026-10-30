import { existsSync, readFileSync } from 'node:fs'

import { aggregate, type CoverageReport } from '../../../engine/coverage.js'
import type { Finding, Rule } from '../../../engine/types.js'
import { globToRegExp } from '../../../engine/util.js'

import { testHomeContract } from './metrics-test-homes.js'
import { finding } from './finding.js'

/**
 * 度量域（M）：只读数字产物 + 阈值。
 *
 * 一条纪律：**门禁不跑测试、不构建**（零副作用）。产物由宿主的 check 链路先跑出来：
 * `pnpm test && pnpm coverage && arch-guard`。
 *
 * 与生态的分工：总覆盖率阈值 vitest / c8 / jest 自带，所以这里没有「总阈值」规则 ——
 * 用 `perDirMin: { 'src/**': 95 }` 表达同样的事。我们做的是：目录级下限、零覆盖文件、
 * 棘轮、变更文件必须被覆盖、产物缺失/过期 fail-closed、依赖预算。
 */

interface PerDirMinEntry {
  lines?: number
  branches?: number
  functions?: number
}

interface CoverageConfig {
  report?: string
  perDirMin?: Record<string, number | PerDirMinEntry>
  zeroAllow?: { file: string; reason: string }[]
  ratchet?: boolean
  baselineFile?: string
  mustCover?: string[]
  pathRewrite?: [string, string][]
}

interface TestGateConfig {
  requireTestsFor?: string[]
  testGlobs?: string[]
}

interface MetricsConfig {
  coverage?: CoverageConfig
  tests?: TestGateConfig
  checkChain?: { script?: string; require?: string[] }
  depsBudget?: { runtime?: number; dev?: number }
}

/** 度量配置来自 metrics 适配器（数据，不是 params） */
const metricsOf = (ctx: { config: { adapters: Record<string, unknown> } }): MetricsConfig =>
  (ctx.config.adapters.metrics ?? {}) as MetricsConfig

const coverageOf = (ctx: { config: { adapters: Record<string, unknown> } }): CoverageConfig =>
  metricsOf(ctx).coverage ?? {}

/* ---------------- M06 产物存在且新鲜（fail closed） ---------------- */

export const coverageArtifact: Rule = {
  id: 'M06',
  domain: 'metrics',
  level: 'L1',
  severity: 'error',
  title: '覆盖率产物必须存在且新鲜',
  hint: '先跑覆盖率再跑门禁（check 链路里 test → coverage → guard）；报告比最近一次提交还旧说明没重跑',
  requires: ['metrics.coverage'],
  run: (ctx) => {
    const coverage = coverageOf(ctx)
    if (!coverage.report) return []
    const metrics = ctx.metrics
    if (!metrics) return []
    if (metrics.error) {
      return [
        finding(
          'M06',
          metrics.reportPath,
          1,
          `覆盖率产物读不到：${metrics.error}`,
          'missing → 先跑覆盖率；不可解析 → 检查是不是覆盖工具换了格式',
        ),
      ]
    }
    const report = metrics.report
    if (!report) return []
    const headTime = ctx.git?.headTimeMs
    if (typeof headTime === 'number' && report.mtimeMs < headTime) {
      return [
        finding(
          'M06',
          metrics.reportPath,
          1,
          `覆盖率产物比最近一次提交（${new Date(headTime).toISOString()}）还旧`,
          '每次提交前重跑覆盖率，否则数字是过期的',
        ),
      ]
    }
    return []
  },
}

/* ---------------- M02 目录级下限 ---------------- */

export const coveragePerDir: Rule = {
  id: 'M02',
  domain: 'metrics',
  level: 'L2',
  severity: 'error',
  title: '目录级覆盖率下限',
  hint: '总覆盖率高不代表关键目录达标；优先给 engine / shared 这类核心层设下限',
  requires: ['metrics.coverage'],
  run: (ctx) => {
    const limits = coverageOf(ctx).perDirMin ?? {}
    const report = ctx.metrics?.report
    if (!report || Object.keys(limits).length === 0) return []
    // 发现项的文件一律用**配置根相对**的产物路径（与 M06 一致）：`report.path` 是绝对路径，
    // 写进报告与棘轮基线后，换一台机器/CI 就对不上，直接变成假红。
    const reportPath = ctx.metrics?.reportPath ?? report.path
    const out: Finding[] = []
    for (const [pattern, limit] of Object.entries(limits)) {
      const matcher = globToRegExp(pattern)
      const stats = aggregate(report, (rel) => matcher.test(rel))
      if (!stats) {
        out.push(finding('M02', reportPath, 1, `没有文件匹配 ${pattern}（配置写错？）`))
        continue
      }
      const expected: PerDirMinEntry = typeof limit === 'number' ? { lines: limit } : limit
      for (const metric of ['lines', 'branches', 'functions'] as const) {
        const min = expected[metric]
        if (min === undefined) continue
        const actual = stats[metric]
        if (actual + 1e-9 < min) {
          out.push(
            finding(
              'M02',
              reportPath,
              1,
              `${pattern} 的${metric === 'lines' ? '行' : metric === 'branches' ? '分支' : '函数'}覆盖 ${actual.toFixed(2)}% < ${min}%（${stats.files} 个文件）`,
            ),
          )
        }
      }
    }
    return out
  },
}

/* ---------------- M03 零覆盖文件 ---------------- */

export const zeroCoveredFiles: Rule = {
  id: 'M03',
  domain: 'metrics',
  level: 'L2',
  severity: 'error',
  title: '零覆盖文件',
  hint: '被加载但一行都没跑到的文件＝没测；要么补测，要么进白名单并写清理由',
  requires: ['metrics.coverage'],
  run: (ctx) => {
    const report = ctx.metrics?.report
    if (!report) return []
    const allowed = new Set((coverageOf(ctx).zeroAllow ?? []).map((item) => item.file))
    return report.files
      .filter((file) => file.lines <= 0 && !allowed.has(file.rel))
      .map((file) =>
        finding(
          'M03',
          file.rel,
          1,
          `覆盖率 0%：${file.rel}`,
          '补测试，或在 coverageZeroAllow 里写清理由',
        ),
      )
  },
}

/* ---------------- M04 覆盖率棘轮 ---------------- */

interface CoverageSnapshot {
  specVersion?: string
  files?: number
  lines?: number
  branches?: number
  functions?: number
}

const totalsOf = (
  report: CoverageReport,
): { lines: number; branches: number; functions: number } => {
  const stats = aggregate(report, () => true)
  return {
    lines: stats?.lines ?? 0,
    branches: stats?.branches ?? 0,
    functions: stats?.functions ?? 0,
  }
}

export const coverageRatchet: Rule = {
  id: 'M04',
  domain: 'metrics',
  level: 'L2',
  severity: 'error',
  title: '覆盖率不许倒退',
  hint: '棘轮只往上走；确要下调请显式改基线文件（改了就留痕）',
  requires: ['metrics.coverage'],
  run: (ctx) => {
    const coverage = coverageOf(ctx)
    if (coverage.ratchet !== true) return []
    const report = ctx.metrics?.report
    if (!report) return []
    const rel = coverage.baselineFile ?? 'arch.coverage.json'
    const path = `${ctx.config.root}/${rel}`
    if (!existsSync(path)) return []
    let snapshot: CoverageSnapshot
    try {
      snapshot = JSON.parse(readFileSync(path, 'utf8')) as CoverageSnapshot
    } catch {
      return [
        finding('M04', path, 1, '覆盖率棘轮快照无法解析', '删掉它并用 --update-coverage 重新生成'),
      ]
    }
    const current = totalsOf(report)
    const out: Finding[] = []
    for (const metric of ['lines', 'branches', 'functions'] as const) {
      const previous = snapshot[metric]
      if (typeof previous !== 'number') continue
      if (current[metric] + 1e-9 < previous) {
        out.push(
          finding(
            'M04',
            rel,
            1,
            `${metric} 覆盖从 ${previous.toFixed(2)}% 掉到 ${current[metric].toFixed(2)}%`,
            '把丢掉的测试补回来，或显式下调基线',
          ),
        )
      }
    }
    return out
  },
}

/* ---------------- M05 变更文件必须被覆盖 ---------------- */

export const changedFilesCovered: Rule = {
  id: 'M05',
  domain: 'metrics',
  level: 'L3',
  severity: 'error',
  title: '本次改动的文件必须被覆盖',
  hint: '新增/修改的源码没有测试加载过，说明这次改动没有验证；补测试或明确豁免',
  requires: ['metrics.coverage'],
  run: (ctx) => {
    const report = ctx.metrics?.report
    const changed = ctx.git?.changedFiles
    if (!report || !changed || changed.length === 0) return []
    const globs = (coverageOf(ctx).mustCover ?? ['src/**']).map(globToRegExp)
    const covered = new Set(report.files.filter((file) => file.lines > 0).map((file) => file.rel))
    // 变更集相对配置根；报告里的路径可能指向构建产物，两边都做一次归一
    return changed
      .filter((rel) => globs.some((matcher) => matcher.test(rel)))
      .filter((rel) => !covered.has(rel))
      .map((rel) => finding('M05', rel, 1, `本次改动的 ${rel} 没有被任何测试覆盖`))
  },
}

/* ---------------- M07 依赖预算 ---------------- */

export const depsBudget: Rule = {
  id: 'M07',
  domain: 'metrics',
  level: 'L1',
  severity: 'error',
  title: '依赖数量预算',
  hint: '依赖是长期负债：超过预算要么合并能力，要么把预算显式调大并说明理由',
  run: (ctx) => {
    const budget = metricsOf(ctx).depsBudget
    if (!budget) return []
    const deps = ctx.deps
    if (!deps.hasManifest) return []
    const out: Finding[] = []
    if (typeof budget.runtime === 'number' && deps.runtime.length > budget.runtime) {
      out.push(
        finding(
          'M07',
          'package.json',
          1,
          `运行时依赖 ${deps.runtime.length} 个，超过预算 ${budget.runtime}`,
        ),
      )
    }
    if (typeof budget.dev === 'number' && deps.dev.length > budget.dev) {
      out.push(
        finding('M07', 'package.json', 1, `开发依赖 ${deps.dev.length} 个，超过预算 ${budget.dev}`),
      )
    }
    return out
  },
}

/* ---------------- M08 测试↔源配对（该有测试的地方有没有测试） ---------------- */

export const requireTests: Rule = {
  id: 'M08',
  domain: 'metrics',
  level: 'L3',
  severity: 'error',
  title: '该有测试的文件必须有测试',
  hint: '命中 requireTestsFor 的文件要么被某个测试 import，要么存在同名配对的测试文件',
  requires: ['metrics.tests'],
  run: (ctx) => {
    const spec = metricsOf(ctx).tests
    if (!spec?.requireTestsFor || spec.requireTestsFor.length === 0) return []
    const required = spec.requireTestsFor.map(globToRegExp)
    const testGlobs = (
      spec.testGlobs ?? ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', 'tests/**']
    ).map(globToRegExp)
    /**
     * "这是测试文件吗"问**两处**：角色表（`test` 角色是声明出来的）与 `testGlobs`。
     * 只认 glob 会假红：`canonical()` 给了 `**\/__tests__/**` 测试角色，而默认 globs 里没有它 ——
     * Jest 形态的项目里 `src/__tests__/x.ts` 明明有角色、却被当成"没有测试"。
     */
    const roleOf = new Map(ctx.records.map((record) => [record.rel, record.role]))
    const isTest = (rel: string): boolean =>
      roleOf.get(rel) === 'test' || testGlobs.some((matcher) => matcher.test(rel))
    // 测试文件从**完整文件集**里找，而不是 `records`：测试通常放在契约扫描域之外
    // （`tests/`、`e2e/`），它们没有角色、不进 records，但"是否有测试"必须看得见。
    const testFiles = new Set(ctx.files.filter((rel) => isTest(rel)))
    const stemOf = (rel: string): string =>
      (rel.split('/').pop() ?? '').replace(/\.(test|spec)\./, '.')
    const dirOf = (rel: string): string => rel.split('/').slice(0, -1).join('/')
    /** 顶层测试根里的同名文件也算配对（本仓布局：`src/engine/run.ts` ↔ `tests/run.test.mjs`） */
    const ROOT_TEST_DIR = /^(tests|e2e|__tests__|test)\//
    /**
     * 同名配对**必须落在附近**：`mappers` 这种名字在多个域里都有（`modules/<域>/lib/mapper.ts`），
     * 用全局 basename 配对的后果是"删掉其中一个域的测试照样绿" —— 这是 M08 原来的真实漏洞。
     */
    const paired = (target: string): boolean => {
      const dir = dirOf(target)
      const stem = stemOf(target)
      for (const test of testFiles) {
        if (stemOf(test) !== stem) continue
        if (dirOf(test) === dir || ROOT_TEST_DIR.test(test)) return true
      }
      return false
    }
    /**
     * **间接覆盖**：测试 import 的若是**公开面 barrel**（只有再导出、没有自己的声明），
     * 被它再导出的实现同样算"有测试" —— 否则"只测公开面"的写法会被 M08 全量报红，
     * 宿主只能把 `requireTestsFor` 收缩成"每个文件都要直连测试"（那不是更严，是更假）。
     *
     * 只穿**再导出文件**：任意 import 链都算会让"测试 import 了入口"变成"全树都被覆盖"。
     */
    const isBarrel = (rel: string): boolean => {
      const facts = ctx.facts.get(rel)
      if (!facts || facts.exports.length === 0) return false
      return facts.exports.every((entry) => entry.kind === 're-export' || entry.isStar)
    }
    const coveredViaBarrel = (target: string): boolean => {
      const visited = new Set<string>()
      const queue = [...(ctx.graph.importers.get(target) ?? [])]
      while (queue.length > 0) {
        const importer = queue.shift() as string
        if (visited.has(importer)) continue
        visited.add(importer)
        if (testFiles.has(importer)) return true
        if (!isBarrel(importer)) continue
        for (const next of ctx.graph.importers.get(importer) ?? []) queue.push(next)
      }
      return false
    }
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (isTest(record.rel)) continue
      if (!required.some((matcher) => matcher.test(record.rel))) continue
      const imported = [...(ctx.graph.importers.get(record.rel) ?? [])].some((importer) =>
        testFiles.has(importer),
      )
      if (imported || coveredViaBarrel(record.rel) || paired(record.rel)) continue
      out.push(
        finding(
          'M08',
          record.rel,
          1,
          `没有被任何测试引用，也没有同名配对测试：${record.rel}`,
          '补一个测试，或把这份实现移出 requireTestsFor 的范围（并在配置里说明理由）',
        ),
      )
    }
    return out
  },
}

/* ---------------- M09 门禁链路自检（测试必须真的在门禁里跑） ---------------- */

export const checkChain: Rule = {
  id: 'M09',
  domain: 'metrics',
  level: 'L1',
  severity: 'error',
  title: '门禁链路必须真的跑测试与覆盖率',
  hint: '这次会话踩过的坑：覆盖率一直在跑，但统计的是错的进程 —— 这类「门禁漏跑/跑错」只有门禁自己能查',
  requires: ['metrics.checkChain'],
  run: (ctx) => {
    const spec = metricsOf(ctx).checkChain
    if (!spec) return []
    const scriptName = spec.script ?? 'check'
    const requiredCmds = spec.require ?? ['test', 'coverage']
    const path = `${ctx.config.root}/package.json`
    let scripts: Record<string, string>
    try {
      scripts =
        (JSON.parse(readFileSync(path, 'utf8')) as { scripts?: Record<string, string> }).scripts ??
        {}
    } catch {
      return [finding('M09', 'package.json', 1, '读不到 package.json，无法确认门禁链路')]
    }
    const chain = scripts[scriptName]
    if (chain === undefined) {
      return [finding('M09', 'package.json', 1, `没有 ${scriptName} 脚本，无法确认门禁链路`)]
    }
    /**
     * **按脚本名解析，而不是子串匹配**：`"check": "pnpm test:coverage"` 以前同时满足 `test` 与
     * `coverage`（`includes` 的锅），于是"e2e 从没跑过"这件事一声不吭。
     * 现在取 `pnpm X` / `npm run X` / `run-s X Y` 这类引用，做**一跳传递闭包**（`check → test:e2e → …`）。
     */
    const referenced = (cmd: string): string[] => {
      const names = new Set<string>()
      for (const match of cmd.matchAll(/(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?([\w:@./-]+)/g)) {
        if (match[1]) names.add(match[1])
      }
      for (const match of cmd.matchAll(/(?:run-s|run-p|npm-run-all)\s+([^&|;]+)/g)) {
        for (const token of (match[1] ?? '').split(/\s+/)) {
          if (token && !token.startsWith('-')) names.add(token)
        }
      }
      return [...names]
    }
    const closure = new Set<string>()
    const queue = [scriptName]
    while (queue.length > 0) {
      const name = queue.shift() as string
      if (closure.has(name)) continue
      closure.add(name)
      for (const next of referenced(scripts[name] ?? '')) queue.push(next)
    }
    /** 直接写命令（不走脚本名）的等价物：认不出来就放过，宁少报不误伤 */
    const DIRECT: Record<string, RegExp> = {
      test: /node\s+--test|\bvitest\b|\bjest\b|\bplaywright\s+test\b/,
      coverage: /\bc8\b|\bnyc\b|experimental-test-coverage/,
      lint: /\beslint\b/,
      typecheck: /\btsc\b/,
      build: /\btsc\b|\bvite\s+build\b|\brollup\b/,
    }
    const chainText = [...closure].map((name) => scripts[name] ?? '').join(' && ')
    const missing = requiredCmds.filter(
      (cmd) => !closure.has(cmd) && !(DIRECT[cmd]?.test(chainText) ?? false),
    )
    if (missing.length === 0) return []
    return [
      finding(
        'M09',
        'package.json',
        1,
        `${scriptName} 链路里缺少：${missing.join(' / ')}`,
        '把测试与覆盖率接进 check（例如 run-s test coverage 之后再看门禁）',
      ),
    ]
  },
}

export const metricsRules: Rule[] = [
  coverageArtifact,
  coveragePerDir,
  zeroCoveredFiles,
  coverageRatchet,
  changedFilesCovered,
  depsBudget,
  requireTests,
  checkChain,
  testHomeContract,
]
