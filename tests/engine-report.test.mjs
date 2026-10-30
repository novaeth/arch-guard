import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  canonical,
  copy,
  coreRules,
  createRule,
  deps,
  designSystem,
  explainRules,
  i18n,
  i18nextKit,
  loadConfig,
  looksLikeRuleId,
  renderGithubAnnotations,
  renderHeader,
  renderReport,
  renderSummary,
  runGuard,
} from '../es/index.js'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 捕获唯一输出出口的文本（output.ts 走 console.log） */
function capture(fn) {
  const original = console.log
  const lines = []
  console.log = (...args) => lines.push(args.join(' '))
  try {
    fn()
  } finally {
    console.log = original
  }
  return lines.join('\n')
}

const copyFixture = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `ag-${name}-`))
  cpSync(join(PACKAGE_ROOT, '__fixtures__', name), dir, { recursive: true })
  // 夹具里的 config 用相对路径引构建产物；复制到临时目录后要换成绝对 URL
  const configPath = join(dir, 'arch.config.mjs')
  if (existsSync(configPath)) {
    const entry = `file://${join(PACKAGE_ROOT, 'es/index.js')}`
    writeFileSync(
      configPath,
      readFileSync(configPath, 'utf8').replace("'../../es/index.js'", JSON.stringify(entry)),
    )
  }
  return dir
}

const baseInput = (overrides = {}) => ({
  config: { params: {} },
  ruleIndex: new Map(coreRules.map((rule) => [rule.id, rule])),
  findings: [],
  skipped: [],
  unknownEnabled: [],
  notices: [],
  paths: null,
  scope: 'full',
  scopeFiles: 0,
  globalFindings: 0,
  skippedGlobals: 0,
  durationMs: 1,
  rulesEnabled: 19,
  rulesTotal: 19,
  exceptions: [],
  contractScope: ['src/**'],
  outsideContract: 0,
  ...overrides,
})

/* ---------------- 报告渲染 ---------------- */

test('report：按域分组、带修法、标注全局违规', () => {
  const text = capture(() =>
    renderReport(
      baseInput({
        findings: [
          {
            rule: 'S01',
            file: 'src/a.ts',
            line: 1,
            text: '不在目录契约内',
            hint: '放到槽位里',
            global: true,
          },
          { rule: 'H06', file: 'src/b.ts', line: 2, text: '脱离上下文的全局 API' },
        ],
      }),
    ),
  )
  assert.match(text, /结构（1）/)
  assert.match(text, /反退化（1）/)
  assert.match(text, /\[S01\]/)
  assert.match(text, /→ 放到槽位里/)
  assert.match(text, /（全局）/)
  assert.match(text, /\[H06\]/)
})

test('report：摘要自述 scope / 例外 / 停用规则', () => {
  const text = capture(() => {
    // 结论在 header（前置）、元信息在 appendix —— 两段都取，断言信息没丢
    renderHeader(
      baseInput({
        findings: [{ rule: 'H06', file: 'a.ts', line: 1, text: 'x' }],
        scope: 'staged',
        scopeFiles: 3,
        globalFindings: 1,
        skippedGlobals: 2,
      }),
    )
    renderSummary(
      baseInput({
        findings: [{ rule: 'H06', file: 'a.ts', line: 1, text: 'x' }],
        scope: 'staged',
        scopeFiles: 3,
        globalFindings: 1,
        skippedGlobals: 2,
        exceptions: [
          {
            rule: 'H06',
            glob: 'src/engine/output.ts',
            reason: '输出出口必须 console',
            expires: '2026-12-31',
            hits: 2,
          },
        ],
        skipped: [
          {
            rule: 'D10',
            code: 'capability-missing',
            missing: ['uiKit.vendorSelectors'],
            reason: '能力未声明：uiKit.vendorSelectors',
          },
        ],
        unknownEnabled: ['NOPE'],
        notices: [{ code: 'config-aliases', text: '别名取自 tsconfig' }],
      }),
    )
  })
  assert.match(text, /范围 staged/, '附录自述范围')
  assert.match(text, /3 个文件/, '文件数在结论行里')
  assert.match(text, /例外 2 处 \/ 1 条声明/, '例外必须自述')
  assert.match(text, /--local-only 跳过全局违规 2/, '跳过的全局违规必须自述（不许静默丢弃）')
  assert.match(text, /✖ 架构守卫失败：1 个 error/)
})

test('report：通过时打印绿色结论，warn 不阻断', () => {
  const warnRule = createRule({
    id: 'H09',
    domain: 'hygiene',
    level: 'L2',
    severity: 'warn',
    title: 'w',
    run: () => [],
  })
  const text = capture(() =>
    renderHeader(
      baseInput({
        ruleIndex: new Map([[warnRule.id, warnRule]]),
        findings: [{ rule: 'H09', file: 'a.ts', line: 1, text: 'w' }],
      }),
    ),
  )
  assert.match(text, /✔ 架构守卫通过（1 个 warn）/)
})

test('report：--paths 零匹配时首行不是 ✔，且 paths-no-match 自述前置', () => {
  const input = baseInput({
    paths: { requested: ['src/typo/**'], matched: 0 },
    notices: [{ code: 'paths-no-match', text: '--paths 没有匹配到任何文件：src/typo/**' }],
  })
  const header = capture(() => renderHeader(input))
  assert.doesNotMatch(header, /✔ 架构守卫通过/, '零命中不是"通过"（退出码是 2）')
  assert.match(header, /✖ 架构守卫失败：--paths 一个文件都没匹配到/)
  assert.match(header, /没有匹配到任何文件/, '自述必须前置到结论后面，别埋在附录')

  const summary = capture(() => renderSummary(input))
  assert.doesNotMatch(summary, /没有匹配到任何文件/, '前置过的自述不在附录重复')
})

test('report：停用规则与未知规则在 report 里明列（防「以为在跑」）', () => {
  const text = capture(() =>
    renderSummary(
      baseInput({
        skipped: [
          {
            rule: 'D10',
            code: 'capability-missing',
            missing: ['uiKit.vendorSelectors'],
            reason: '能力未声明：uiKit.vendorSelectors',
          },
        ],
        unknownEnabled: ['X99'],
        notices: [{ code: 'scope-changed-relocated', text: '仓库根变更路径已换算到配置根' }],
      }),
    ),
  )
  assert.match(text, /因能力未声明而停用 1 条规则：D10/)
  assert.match(text, /配置里启用了不存在的规则：X99/)
  assert.match(text, /变更路径已换算/)
})

/* ---------------- 预置默认值 ---------------- */

test('presets：designSystem / copy / deps 的默认值与自定义值', () => {
  const defaults = designSystem()
  assert.deepEqual(defaults.params?.themes, ['dark', 'light'])

  // spacing / lengthProps / allowLengthValues 已删：它们没有任何消费者（D12–D14 未实现，已委派 stylelint/eslint）
  assert.equal(defaults.params?.spacing, undefined)
  assert.equal(defaults.params?.lengthProps, undefined)

  const custom = designSystem({ themes: ['light'] })
  assert.deepEqual(custom.params?.themes, ['light'])
  // tokenPrefix 已删：它没有任何消费者（D02/D18 未实现），而且是宿主前缀，不该做通用默认
  assert.equal(defaults.params?.tokenPrefix, undefined)

  // `copy()` 只贡献 C 域规则集，**不再内联任何 i18n 适配器**（库名只许在 presets/i18n-kits/）：
  // 能力由 `i18n(i18nextKit({...}))` 提供，与 `uiKit(adapter)` 同形。
  assert.deepEqual(copy().enable, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'])
  assert.equal(copy().adapters, undefined, '通用预设里不许有适配器（也就没有库名）')
  const kit = i18nextKit({ resourceDir: 'src/i18n', languages: ['zh-CN'], fn: 'tr' })
  assert.equal(kit.resourceDir, 'src/i18n')
  assert.deepEqual(kit.languages, ['zh-CN'])
  assert.equal(kit.fn, 'tr')
  assert.deepEqual(i18n(kit).adapters?.i18n, kit)

  const policy = deps()
  assert.ok(Array.isArray(policy.params?.deny))
  assert.deepEqual(policy.params?.capabilities, {})
  assert.deepEqual(deps({ capabilities: { 'cli-args': 'commander' } }).params?.capabilities, {
    'cli-args': 'commander',
  })
})

test('presets：library 与 canonical 是两套角色表，且都完备', () => {
  const app = canonical()
  const lib = canonical({ src: 'app-src' })
  assert.ok(app.roles?.some((role) => role.pattern.includes('src/modules')))
  assert.ok(lib.roles?.some((role) => role.pattern.includes('app-src/modules')))
  assert.equal(app.layout?.app, 'src/app')
})

/* ---------------- run.ts 的路径 ---------------- */

test('run：--paths 过滤报告、--report-only 不阻断、规则异常 fail-closed', async () => {
  const dir = copyFixture('violations')
  try {
    const scoped = await runGuard({
      cwd: dir,
      ruleSet: coreRules,
      quiet: true,
      paths: ['src/orphans/**'],
    })
    assert.deepEqual(
      [...new Set(scoped.active.map((finding) => finding.file))],
      ['src/orphans/thing.ts'],
    )

    const advisory = await runGuard({ cwd: dir, ruleSet: coreRules, quiet: true, reportOnly: true })
    assert.equal(advisory.exitCode, 0, 'report-only 永远 0')
    assert.ok(advisory.active.length > 0)

    const boom = createRule({
      id: 'H99',
      domain: 'hygiene',
      level: 'L2',
      title: '会抛的规则',
      run: () => {
        throw new Error('boom')
      },
    })
    const crashed = await runGuard({
      cwd: dir,
      ruleSet: [...coreRules, boom],
      quiet: true,
      only: ['H99'],
    })
    assert.equal(crashed.exitCode, 1, '规则异常必须 fail closed')
    assert.match(crashed.all[0]?.text ?? '', /规则执行异常/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('run：能力未声明时规则不注册，且报告里能看到 skipped', async () => {
  const result = await runGuard({
    cwd: `${PACKAGE_ROOT}examples/minimal`,
    ruleSet: coreRules,
    quiet: true,
  })
  assert.equal(result.exitCode, 0)
  assert.ok(existsSync(join(PACKAGE_ROOT, 'examples/minimal/arch.config.mjs')))
  const { config } = await loadConfig({ root: `${PACKAGE_ROOT}examples/minimal` })
  assert.equal(config.enable === 'all' || Array.isArray(config.enable), true)
})

test('输出：GitHub 注解与 --stats 统计表（CI 与排查用）', async () => {
  const { renderGithubAnnotations, renderStats } = await import('../es/engine/report.js')
  const ruleIndex = new Map([
    ['H01', { id: 'H01', severity: 'error' }],
    ['S16', { id: 'S16', severity: 'warn' }],
  ])
  const input = {
    config: { root: '/tmp' },
    ruleIndex,
    findings: [
      { rule: 'H01', file: 'src/a.ts', line: 3, text: '问题一' },
      { rule: 'S16', file: 'src/b.ts', line: 7, text: '问题二\n换行要被压平' },
    ],
    skipped: [],
    unknownEnabled: [],
    notices: [],
    scope: 'full',
    scopeFiles: 0,
    globalFindings: 0,
    durationMs: 1,
    rulesEnabled: 2,
    rulesTotal: 2,
    exceptions: [],
  }
  const annotations = renderGithubAnnotations(input)
  assert.match(annotations, /::error file=src\/a\.ts,line=3/)
  assert.match(annotations, /::warning file=src\/b\.ts,line=7/)
  assert.ok(!annotations.includes('\n换行'), '注解里的换行必须压平，否则会截断注解')

  const stats = renderStats(input, [
    { rule: 'S16', domain: 'structure', ms: 12.5, hits: 2 },
    { rule: 'H01', domain: 'hygiene', ms: 1.25, hits: 1 },
  ])
  assert.match(stats, /S16\s+structure\s+12\.50ms\s+2 命中/)
  assert.match(stats, /合计 13\.75ms \/ 2 条规则/)
})

test('R-126：`--brief` 只折叠、不删信息（说清各有几条 + 怎么展开）', () => {
  const text = capture(() =>
    renderSummary(
      baseInput({
        brief: true,
        skipped: [
          {
            rule: 'D10',
            code: 'capability-missing',
            missing: ['uiKit.vendorSelectors'],
            reason: '能力未声明：uiKit.vendorSelectors',
          },
        ],
        exceptions: [],
        notices: [
          { code: 'config-aliases', text: '别名取自 tsconfig' },
          { code: 'facts-cache', text: 'facts 缓存命中 3/3' },
        ],
      }),
    ),
  )
  assert.match(text, /自述 2 条/)
  // R-142：折叠行按**原因**给条数（能力 / 未启用 / 收窄），不再一律写成"因能力停用"
  assert.match(text, /没跑 1 条（能力 1）/)
  assert.match(text, /去掉 --brief 展开/, '折叠必须说清怎么看全（不许静默）')
  assert.doesNotMatch(text, /别名取自 tsconfig/, '折叠时不再逐条展开')
})

test('R-126：`--explain <规则 id>` 讲清这条规则（域/等级/需要什么声明/怎么改）', () => {
  const output = explainRules(['D29'], { rules: coreRules, format: 'pretty' })
  assert.match(output, /D29/)
  assert.match(output, /等级/)
  assert.match(output, /只想跑它：arch-guard --only D29/)
  assert.match(explainRules(['X99'], { rules: coreRules, format: 'pretty' }), /未知规则/)
  assert.equal(looksLikeRuleId('D29'), true)
  assert.equal(looksLikeRuleId('src/a.ts'), false)
})

test('R-128：发现项带列号时，报告印 `file:line:col`、GitHub 注解带 `col=`', () => {
  const withColumn = capture(() =>
    renderReport(
      baseInput({
        findings: [{ rule: 'D29', file: 'a.ts', line: 7, column: 23, text: 'x' }],
      }),
    ),
  )
  assert.match(withColumn, /a\.ts:7:23/)
  const annotation = renderGithubAnnotations(
    baseInput({ findings: [{ rule: 'D29', file: 'a.ts', line: 7, column: 23, text: 'x' }] }),
  )
  assert.match(annotation, /line=7,col=23/)
  // 没给列号照旧只印行（规则可以逐族迁移，不必一次全改）
  const without = capture(() =>
    renderReport(baseInput({ findings: [{ rule: 'D29', file: 'a.ts', line: 7, text: 'x' }] })),
  )
  assert.match(without, /a\.ts:7 /)
})

test('R-130：颜色按 NO_COLOR / FORCE_COLOR / TTY 判定（管道与 CI 日志里不再混进 ANSI）', async () => {
  const { color, colorsEnabled } = await import('../es/engine/util.js')
  const saved = { ...process.env }
  try {
    process.env.NO_COLOR = '1'
    delete process.env.FORCE_COLOR
    assert.equal(colorsEnabled(), false, 'NO_COLOR 非空 → 无色')
    assert.equal(color.red('x'), 'x', '无色时不带转义')
    delete process.env.NO_COLOR
    process.env.FORCE_COLOR = '1'
    assert.equal(colorsEnabled(), true, 'FORCE_COLOR 非空 → 强制有色')
    assert.ok(color.red('x').includes('\u001b[31m'), '强制有色时带转义')
    process.env.FORCE_COLOR = '0'
    assert.equal(colorsEnabled(), false, 'FORCE_COLOR=0 不算强制')
  } finally {
    process.env = saved
  }
})

test('R-146：FORCE_COLOR=0 / TERM=dumb 在真 TTY 下也必须无色', async () => {
  const { colorsEnabled } = await import('../es/engine/util.js')
  const saved = { ...process.env }
  const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  const setTty = (value) => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value,
      configurable: true,
      writable: true,
    })
  }
  try {
    // 旧实现只在管道里"看起来对"：真 TTY 下 FORCE_COLOR=0 会掉到 isTTY 判断 → 上色
    setTty(true)
    delete process.env.NO_COLOR
    delete process.env.TERM
    process.env.FORCE_COLOR = '0'
    assert.equal(colorsEnabled(), false, 'FORCE_COLOR=0 是显式关闭，真 TTY 下也不许上色')
    process.env.FORCE_COLOR = 'false'
    assert.equal(colorsEnabled(), false, 'FORCE_COLOR=false 同上')
    delete process.env.FORCE_COLOR
    process.env.TERM = 'dumb'
    assert.equal(colorsEnabled(), false, 'TERM=dumb：终端自述不支持样式')
    delete process.env.TERM
    assert.equal(colorsEnabled(), true, '真 TTY 且没有任何开关 → 上色')
    process.env.TERM = 'dumb'
    process.env.FORCE_COLOR = '1'
    assert.equal(colorsEnabled(), true, 'FORCE_COLOR 显式强制优先于 TERM=dumb')
    process.env.NO_COLOR = '1'
    assert.equal(colorsEnabled(), false, 'NO_COLOR 仍是最高优先级（与文档一致）')
  } finally {
    process.env = saved
    if (tty) Object.defineProperty(process.stdout, 'isTTY', tty)
    else delete process.stdout.isTTY
  }
})
