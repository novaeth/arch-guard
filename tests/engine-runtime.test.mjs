import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkPortability,
  createRegistry,
  createRule,
  depsPolicyFrom,
  loadConfig,
  policyConflicts,
} from '../es/index.js'

const stubRule = (id, requires = []) =>
  createRule({ id: `H${id}`, domain: 'hygiene', level: 'L2', title: id, requires, run: () => [] })

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/* ---------------- 注册表：能力协商 ---------------- */

test('registry：能力未声明的规则不注册，并给出原因', () => {
  const config = { adapters: {}, enable: 'all', params: {} }
  const result = createRegistry([stubRule('01', ['uiKit.vendorSelectors']), stubRule('02')], config)
  assert.deepEqual(
    result.enabled.map((rule) => rule.id),
    ['H02'],
  )
  // 停用原因也是契约：`code` 稳定可判，`missing` 直接给出缺哪个能力，`reason` 只给人看
  assert.deepEqual(result.skipped, [
    {
      rule: 'H01',
      code: 'capability-missing',
      missing: ['uiKit.vendorSelectors'],
      reason: '能力未声明：uiKit.vendorSelectors',
    },
  ])
})

test('registry：启用名单、未知 id、以及 only/domain/level 过滤', () => {
  const config = { adapters: {}, enable: ['H01', 'NOPE'], params: {} }
  const rules = [stubRule('01'), stubRule('02')]
  const result = createRegistry(rules, config)
  assert.deepEqual(
    result.enabled.map((rule) => rule.id),
    ['H01'],
  )
  assert.deepEqual(result.unknownEnabled, ['NOPE'])
  assert.deepEqual(
    createRegistry(rules, { ...config, enable: 'all' }, { only: ['H02'] }).enabled.map((r) => r.id),
    ['H02'],
  )
  assert.deepEqual(
    createRegistry(rules, { ...config, enable: 'all' }, { domain: ['structure'] }).enabled,
    [],
  )
  assert.deepEqual(
    createRegistry(rules, { ...config, enable: 'all' }, { minLevel: 'L1' }).enabled,
    [],
  )
})

/* ---------------- 配置 ---------------- */

test('config：缺文件 / 缺 layout / 缺 roles 都是明确报错（不回退猜测）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ag-config-'))
  await assert.rejects(loadConfig({ root: dir }), /找不到配置文件/)
  writeFileSync(
    join(dir, 'arch.config.mjs'),
    'export default { presets: [{ layout: { app: "a", modules: "m", shared: "s" } }] }',
  )
  await assert.rejects(loadConfig({ root: dir }), /没有角色表/)
  writeFileSync(
    join(dir, 'arch.config.mjs'),
    'export default { presets: [{ roles: [{ id: "x", pattern: "a/**", layer: 1 }] }] }',
  )
  await assert.rejects(loadConfig({ root: dir }), /没有 layout/)
})

test('config：tsconfig 别名与 index.html 入口被自动纳入', async () => {
  const { config } = await loadConfig({ root: `${PACKAGE_ROOT}examples/minimal` })
  assert.equal(config.aliases['@'], 'src')
  assert.ok(config.entries.includes('src/index.ts') || config.entries.includes('src/app/main.tsx'))
})

/* ---------------- 本体自包含：失败分支 ---------------- */

test('portability：P1 非白名单依赖 / P2 宿主字面量 / P3 引擎布局假设都会被抓', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ag-port-'))
  mkdirSync(join(dir, 'src/engine'), { recursive: true })
  writeFileSync(
    join(dir, 'src/engine/a.ts'),
    "import lodash from 'lodash'\nconst host = 'superhive'\nconst p = 'src/app'\n",
  )
  // 另一个文件专门放开发机绝对路径：P2 的绝对路径分支
  writeFileSync(join(dir, 'src/engine/b.ts'), "const p = '/Users/someone/dev/app'\n")
  const result = checkPortability(dir)
  const rules = result.findings.map((finding) => finding.rule).sort()
  assert.deepEqual([...new Set(rules)], ['P1', 'P2', 'P3'])
  assert.ok(
    result.findings.some((finding) => finding.text.includes('绝对路径')),
    '开发机绝对路径必须被单独点名（发布物里会泄漏）',
  )
})

/* ---------------- 依赖策略 ---------------- */

test('deps：策略解析忽略非法值、冲突检测覆盖 deny 与 allow', () => {
  const policy = depsPolicyFrom({
    allow: ['a', 1],
    deny: 'x',
    capabilities: { 'deep-clone': 'structuredClone', bad: 2 },
  })
  assert.deepEqual(policy.allow, ['a'])
  assert.deepEqual(policy.deny, [])
  assert.deepEqual(policy.capabilities, { 'deep-clone': 'structuredClone' })
  assert.match(
    policyConflicts(
      depsPolicyFrom({
        deny: ['structuredClone'],
        capabilities: { 'deep-clone': 'structuredClone' },
      }),
    )[0] ?? '',
    /deny/,
  )
})

/* ---------------- CLI ---------------- */

test('cli：非法取值退出码 2，help/version 退出码 0', async () => {
  const { run } = await import('../es/cli.js')
  assert.equal(await run(['--domain', 'Z']), 2)
  assert.equal(await run(['--min-level', 'L9']), 2)
  assert.equal(await run(['--severity', 'fatal']), 2)
  assert.equal(await run(['--format', 'xml']), 2)
  assert.equal(await run(['--nope']), 2)
  assert.equal(await run(['--help']), 0)
  assert.equal(await run(['--version']), 0)
})

test('cli：commander 注册了全部对外开关（防止重构时丢参数）', async () => {
  const { createProgram } = await import('../es/cli.js')
  const options = createProgram()
    .options.map((option) => option.long)
    .sort()
  assert.deepEqual(options, [
    '--brief',
    '--check-docs',
    '--config',
    '--coverage-report',
    '--domain',
    '--explain',
    '--format',
    '--list-rules',
    '--local-only',
    '--min-level',
    '--no-cache',
    '--only',
    '--paths',
    '--render-docs',
    '--report-only',
    '--scope',
    '--self-check-portability',
    '--self-test',
    '--severity',
    '--stats',
    '--update-coverage',
    '--verify-deps',
    '--version',
  ])
})

test('typescript 版本自检：缺 API 的版本给出可执行报错（而不是 undefined 崩）', async () => {
  const { assertTypeScriptApi, describeTypeScriptProblem } = await import('../es/engine/ts-api.js')
  assert.equal(describeTypeScriptProblem({ createSourceFile: () => {}, ScriptKind: {} }), null)
  assert.match(describeTypeScriptProblem({}) ?? '', /createSourceFile \/ ScriptKind/)
  assert.match(describeTypeScriptProblem({ createSourceFile: () => {} }) ?? '', /ScriptKind/)
  assert.throws(() => assertTypeScriptApi({}), /typescript >=5.4 <7/)
  assert.doesNotThrow(() => assertTypeScriptApi({ createSourceFile: () => {}, ScriptKind: {} }))
})

test('阈值：默认 500 行，且可按项目覆盖', async () => {
  const { config } = await loadConfig({ root: `${PACKAGE_ROOT}examples/minimal` })
  assert.equal(config.thresholds.fileLines, 500)
  assert.equal(config.thresholds.viewLines, 500)
  assert.equal(config.thresholds.functionLines, 150)

  const { config: tight } = await loadConfig({ root: `${PACKAGE_ROOT}__fixtures__/rules` })
  assert.equal(tight.thresholds.fileLines, 40, '夹具覆盖了阈值')
})

test('manifest：运行时依赖清单是审查门（每加一个都要有人看过；漏装即运行时崩溃）', () => {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  // commander：CLI 参数解析。pluralize：S31 的词形判定（手写表在语料上有真 bug，见 data/plural-forms.ts）。
  // picomatch：glob 匹配（R-149 —— 手搓 glob 不支持 `[...]`，`include` 欠匹配就是静默不判）。
  // culori：颜色词法与 WCAG 对比度（R-153 —— 只认 hex 会让 rgb()/hsl() 令牌在 D07/D03 里消失）。
  // postcss-value-parser：CSS 值的词法（R-150 —— `calc()` 里也是值，正则切不出来）。
  // postcss / postcss-scss / postcss-less：CSS 解析（R-145 —— 手搓字符扫描器会静默错解且是 O(n²)，
  // 见 docs/DESIGN.md §6.1.2；后两个是 Sass / Less 语法的托底，否则宿主用了 Sass 就会红）。
  assert.deepEqual(
    Object.keys(pkg.dependencies ?? {}),
    [
      'commander',
      'culori',
      'picomatch',
      'pluralize',
      'postcss',
      'postcss-less',
      'postcss-scss',
      'postcss-value-parser',
    ],
    '运行时依赖清单被改动过？',
  )
  assert.equal(pkg.peerDependencies.typescript, '>=5.4.0 <7', 'peer 范围必须排除 typescript@7')
})

test('R-130：`--help` 里给出退出码表与颜色开关（CI 作者不用翻文档）', () => {
  // 用真跑一次 CLI 的方式断言 —— `helpInformation()` 不含 `addHelpText('after')` 的内容
  const cli = fileURLToPath(new URL('../es/cli.js', import.meta.url))
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }).stdout
  assert.match(help, /退出码/)
  assert.match(help, /0 {2}通过/)
  assert.match(help, /NO_COLOR/)
  assert.match(help, /--explain D29/, '示例里也给出"规则 id 可展开"')
})
