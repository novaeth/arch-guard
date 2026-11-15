import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  createRegistry,
  hasCapability,
  loadConfig,
  noneI18nKit,
  coreRules,
  stack,
} from '../es/index.js'

/**
 * **组合方案**（`stack()`）：把各域预设按需装配起来，同时**不含任何硬编码** ——
 * 不猜组件库、不猜语言、不猜白名单、不写落点。这里钉住四条：
 *   1. 默认是"声明空能力"（对应规则明列停用，不静默失能）；
 *   2. 一切都由选项传入，且**落点仍由范式声明**（换范式就跟着换）；
 *   3. 组合出来的规则集 = 各域的并集（不多不少）；
 *   4. `stack()` 只是糖：不用它、手写那几个预设，结果一模一样。
 */

const ES = new URL('../es/index.js', import.meta.url).href

function project(presetsExpr) {
  const dir = mkdtempSync(join(tmpdir(), 'ag-stack-'))
  writeFileSync(
    join(dir, 'arch.config.mjs'),
    `import { antdKit, canonical, copy, deps, designSystem, fsd, hygiene, i18n, i18nextKit, library, noneI18nKit, stack, uiKit } from '${ES}'\n` +
      `import { builtinSourceForms } from '${ES}'\n` +
      `export default { sourceForm: 'react', presets: [${presetsExpr}] }\n`,
  )
  return dir
}

const load = (expr) => loadConfig({ root: project(expr) }).then((r) => r.config)
const enabledIds = (config) => createRegistry(coreRules, config).enabled.map((rule) => rule.id)
const skippedIds = (config) => createRegistry(coreRules, config).skipped.map((item) => item.rule)
const stackWith = (expr) => `...stack(${expr})`

test('stack()：默认声明空能力（组件库 / i18n 都不替项目选型），对应规则明列停用', () => {
  const presets = stack()
  const byFacet = Object.fromEntries(presets.map((p) => [Object.keys(p.adapters ?? {})[0], p]))
  assert.equal(byFacet['ui-kit']?.adapters?.['ui-kit']?.id, 'none')
  assert.equal(byFacet.i18n?.adapters?.i18n?.id, 'none')
  // 不含硬编码落点：designSystem() 不带选项 → 参数里没有 styleDir
  assert.equal(presets[0]?.params?.styleDir, undefined, 'stack() 不猜落点')
  assert.equal(presets[0]?.params?.languages, undefined, 'stack() 不猜语言')
})

test('stack()：一切都由选项传入；落点仍由范式声明（换范式即换落点）', async () => {
  const kit = stackWith(
    "{ i18n: i18nextKit({ languages: ['zh-CN', 'en'] }), uiKit: antdKit(), deps: { allow: ['react', 'antd'] } }",
  )
  const canon = await load(`canonical(), ${kit}`)
  assert.equal(canon.adapters.i18n?.id, 'i18next')
  assert.equal(canon.adapters['ui-kit']?.id, 'antd')
  assert.equal(canon.adapters.i18n?.resourceDir, 'src/shared/i18n/locales', '范式的落点补上')
  assert.equal(canon.params.styleDir, 'src/shared/styles')

  const fsdConfig = await load(`fsd(), ${kit}`)
  assert.equal(fsdConfig.adapters.i18n?.resourceDir, 'src/shared/i18n/locales')
  assert.equal(fsdConfig.params.styleDir, 'src/app/styles', 'FSD 自己的落点（全局样式）')
})

test('stack()：组合出来的规则集 = 各域的并集；能力齐了就只剩「默认关闭」的 H14 停用', async () => {
  const config = await load(
    `canonical(), ${stackWith(
      "{ i18n: i18nextKit({ languages: ['zh-CN', 'en'] }), uiKit: antdKit(), deps: { allow: ['react', 'antd'] }, metrics: { coverage: { path: 'coverage/coverage-final.json', format: 'istanbul-json' } } }",
    )}`,
  )
  const ids = enabledIds(config)
  for (const id of ['C02', 'C03', 'C07', 'D10', 'D10b', 'D17', 'P01', 'P11', 'H06']) {
    assert.ok(ids.includes(id), `${id} 应该在组合里启用`)
  }
  // i18n 与组件库的能力都声明了 → 不因能力缺失而停用
  assert.ok(hasCapability(config, 'i18n.resourceDir'))
  assert.ok(hasCapability(config, 'uiKit.vendorSelectors'))
  // `stack()` 里没有 router / data-layer / 端点面 / 副作用面、也没声明 lazyViews → 那几组落点能力缺失，
  // D02 / D18（静态令牌前缀）· D20（策略数字的家）· D22 / D23 / D24 / D25 / D26
  // （缓存键 · 路由 · 事件名 · 端点 · 键形状）· D27（对比度组合，没人声明 contrastPairs）· D29（没人声明 permissions 面）· D30（没人声明 errorPolicy 面）·
  // S36 / S37 / S38 / S46 **明列停用**（不是静默通过）；
  // 注意 D28（样式入口）**在跑**：`styleDir` 由范式给，只是这个 fixture 里没有 CSS 文件可判。
  // 另外两条需要更具体的项目声明（M08 tests.requireTestsFor / M09 checkChain / M10 tests.homes）；
  // H14「禁止注释」是**默认关闭**（R-172），要 params.noComments 才跑。
  assert.deepEqual(skippedIds(config).sort(), [
    'D02',
    'D18',
    'D20',
    'D22',
    'D23',
    'D24',
    'D25',
    'D26',
    'D27',
    'D29',
    'D30',
    'H14',
    'M08',
    'M09',
    'M10',
    'S36',
    'S37',
    'S38',
    'S44',
    'S46',
  ])
})

test('stack()：默认 i18n（none kit）时 C 域**明列停用**，不是静默通过', async () => {
  const config = await load(`canonical(), ${stackWith('{}')}`)
  const skipped = skippedIds(config)
  for (const id of ['C02', 'C03', 'C06', 'C07']) {
    assert.ok(skipped.includes(id), `${id} 应因 i18n 能力未声明而停用`)
  }
  assert.equal(
    hasCapability(config, 'i18n.resourceDir'),
    false,
    'none kit 不声明库 → 不该被范式补落点',
  )
  assert.equal(
    config.adapters.i18n?.resourceDir,
    undefined,
    'none kit 没有落点（否则 C07 会误报零资源）',
  )
})

test('stack()：库范式不声明落点 → 明列停用；去掉 hygiene / 加 metrics 都按选项生效', async () => {
  const lib = await load(
    `library({ entry: [] }), ${stackWith("{ i18n: i18nextKit({ languages: ['zh-CN'] }) }")}`,
  )
  assert.equal(lib.adapters.i18n?.resourceDir, undefined, '库范式不猜 i18n 落点')
  assert.equal(hasCapability(lib, 'i18n.resourceDir'), false, '没落点 = 没能力（可见）')

  const noHygiene = await load(`canonical(), ${stackWith('{ hygiene: false }')}`)
  assert.equal(enabledIds(noHygiene).includes('H06'), false, 'hygiene: false 时不加 H 域')

  const withMetrics = stack({
    metrics: { coverage: { path: 'coverage/coverage-final.json', format: 'istanbul-json' } },
  })
  assert.ok(
    withMetrics.some((preset) => preset.adapters?.metrics),
    '给了 metrics 才装它',
  )
})

test('stack() 只是糖：不用它、手写那几个预设，结果一致', async () => {
  const sugar = await load(
    `canonical(), ${stackWith("{ i18n: i18nextKit({ languages: ['zh-CN', 'en'] }), uiKit: antdKit() }")}`,
  )
  const manual = await load(
    "canonical(), designSystem(), copy(), deps(), hygiene(), i18n(i18nextKit({ languages: ['zh-CN', 'en'] })), uiKit(antdKit())",
  )
  assert.deepEqual(enabledIds(sugar).sort(), enabledIds(manual).sort(), '规则集一致')
  assert.equal(sugar.params.styleDir, manual.params.styleDir)
  assert.equal(sugar.adapters.i18n?.id, manual.adapters.i18n?.id)
  assert.equal(noneI18nKit().id, 'none')
})
