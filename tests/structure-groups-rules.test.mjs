import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coreRules } from '../es/index.js'

/** 只填这几条规则会读的字段；`edges` 用来测图规则（S28） */
function context({ records, structure = {}, roles = [], edges = [], importers = [] }) {
  return {
    config: {
      root: '/tmp/structure-groups',
      srcRoot: 'src',
      params: {},
      adapters: {},
      naming: { hookPrefix: 'use', viewSuffix: 'Page' },
      thresholds: {
        fileLines: 500,
        viewLines: 500,
        functionLines: 150,
        exportsPerFile: 6,
        componentsPerFile: 3,
      },
      layout: { app: '', modules: '', shared: '' },
      roles,
      structure: {
        order: false,
        isolate: [],
        publicApi: [],
        publicApiUnits: [],
        segmentedGroups: [],
        reservedNames: [],
        groupCountLimits: [],
        directoryItemLimits: [],
        groupInDegree: [],
        nameCollisions: [],
        repetitiveNaming: [],
        pluralConsistency: [],
        degreeLimits: [],
        importLocality: [],
        ...structure,
      },
      entries: [],
      ignore: [],
      aliases: {},
    },
    records,
    facts: new Map(),
    graph: {
      edges: new Map(edges),
      importers: new Map(importers),
      externals: new Map(),
      unresolved: new Map(),
      reachable: new Set(),
      orphaned: [],
      cycles: [],
    },
    scan: {
      records: [],
      files: [],
      missing: [],
      ambiguous: [],
      exempted: [],
      outside: [],
      foreign: [],
    },
    deps: { hasManifest: false, runtime: [], dev: [], peer: [], declared: new Set() },
    policy: { allow: [], deny: [], capabilities: {} },
    files: records.map((record) => record.rel),
    sourceOf: () => undefined,
  }
}

const record = (
  rel,
  { layer = 1, role = 'x', group = null, groupName = null, captures = {} } = {},
) => ({
  rel,
  abs: `/tmp/structure-groups/${rel}`,
  role,
  layer,
  domain: null,
  slot: null,
  captures,
  group,
  groupName,
  kind: 'ts',
})

const run = (id, ctx) => {
  const rule = coreRules.find((item) => item.id === id)
  assert.ok(rule, `规则 ${id} 不存在`)
  return rule.run(ctx)
}

/** 分组切片：角色声明的是 `group: 'slice'`，所以 `group` 是**叶子名**，父桶在 captures 里 */
const grouped = (bucket, leaf) => ({
  group: leaf,
  groupName: 'slice',
  captures: { group: bucket, slice: leaf },
})

test('S35 组必须有片段：只有入口的组报，有内容的组不报；没声明就不参与', () => {
  const records = [
    record('src/pages/empty/index.ts', {
      layer: 5,
      role: 'entry',
      group: 'empty',
      groupName: 'slice',
    }),
    record('src/pages/crews/index.ts', {
      layer: 5,
      role: 'entry',
      group: 'crews',
      groupName: 'slice',
    }),
    record('src/pages/crews/ui/CrewsPage.tsx', {
      layer: 5,
      role: 'ui',
      group: 'crews',
      groupName: 'slice',
    }),
  ]
  const roles = [
    { id: 'entry', pattern: 'src/pages/{slice}/index.ts', layer: 5, group: 'slice', entry: true },
    { id: 'ui', pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' },
  ]
  assert.deepEqual(
    run('S35', context({ records, roles })),
    [],
    '没声明 segmentedGroups → 不参与判定',
  )
  const findings = run(
    'S35',
    context({ records, roles, structure: { segmentedGroups: ['slice'] } }),
  )
  assert.deepEqual(
    findings.map((finding) => finding.file),
    ['src/pages/empty/index.ts'],
  )
})

test('S25 保留名目录：只看超出角色 pattern 的目录；没声明就不参与', () => {
  const roles = [{ id: 'ui', pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' }]
  const records = [
    record('src/pages/crews/ui/CrewsPage.tsx', {
      layer: 5,
      role: 'ui',
      group: 'crews',
      groupName: 'slice',
    }),
    record('src/pages/crews/ui/lib/thing.ts', {
      layer: 5,
      role: 'ui',
      group: 'crews',
      groupName: 'slice',
    }),
  ]
  assert.deepEqual(run('S25', context({ records, roles })), [], '没声明 reservedNames → 不参与判定')
  const findings = run(
    'S25',
    context({ records, roles, structure: { reservedNames: ['lib', '@x'] } }),
  )
  assert.deepEqual(
    findings.map((finding) => `${finding.file}@${finding.line}`),
    ['src/pages/crews/ui/lib/thing.ts@1'],
    '`ui` 是角色自己的那一段，不算"片段内的保留名"',
  )
})

test('S26 组数量：按「层 + 父组桶」分桶，未分组的共用一个桶', () => {
  const records = [
    record('src/pages/a/ui/A.tsx', { layer: 5, group: 'a', groupName: 'slice' }),
    record('src/pages/b/ui/B.tsx', { layer: 5, group: 'b', groupName: 'slice' }),
    record('src/pages/admin/a/ui/A.tsx', { layer: 5, ...grouped('admin', 'a') }),
    record('src/pages/admin/b/ui/B.tsx', { layer: 5, ...grouped('admin', 'b') }),
  ]
  const structure = { groupCountLimits: [{ dimension: 'slice', max: 2 }] }
  assert.deepEqual(run('S26', context({ records, structure })), [])
  const findings = run(
    'S26',
    context({ records, structure: { groupCountLimits: [{ dimension: 'slice', max: 1 }] } }),
  )
  assert.deepEqual(
    findings.map((finding) => finding.file).sort(),
    ['src/pages/a/ui/A.tsx', 'src/pages/admin/a/ui/A.tsx'],
    '两个桶各报一条，锚在各自桶内字典序最小的文件上',
  )
})

test('S27 目录子项数：默认数文件 + 子目录，foldersOnly 只数子目录', () => {
  const records = [
    record('src/shared/lib/a/index.ts', { layer: 1, role: 'lib' }),
    record('src/shared/lib/b/index.ts', { layer: 1, role: 'lib' }),
    record('src/shared/lib/loose.ts', { layer: 1, role: 'lib' }),
  ]
  const roles = [{ id: 'lib', pattern: 'src/shared/lib/**', layer: 1 }]
  assert.equal(
    run(
      'S27',
      context({ records, roles, structure: { directoryItemLimits: [{ role: 'lib', max: 2 }] } }),
    ).length,
    1,
  )
  assert.deepEqual(
    run(
      'S27',
      context({
        records,
        roles,
        structure: { directoryItemLimits: [{ role: 'lib', max: 2, foldersOnly: true }] },
      }),
    ),
    [],
    '只数目录时是 2，不超上限',
  )
})

test('S27 目录子项数：角色一条记录都没有时跳过（宁少报不误报）', () => {
  const roles = [{ id: 'r', pattern: 'src/empty/**', layer: 1 }]
  assert.deepEqual(
    run(
      'S27',
      context({
        records: [record('src/other/x.ts', { role: 'r' })],
        roles,
        structure: { directoryItemLimits: [{ role: 'r', max: 0 }] },
      }),
    ),
    [],
  )
})

test('S27 参数化角色按实际目录分别计数，目录级发现项标 global', () => {
  const roles = [
    { id: 'module:components', pattern: 'src/modules/{domain}/components/**', layer: 10 },
  ]
  const records = [
    record('src/modules/crews/components/A.tsx', { layer: 10, role: 'module:components' }),
    record('src/modules/crews/components/B.tsx', { layer: 10, role: 'module:components' }),
    record('src/modules/crews/components/ui/C.tsx', { layer: 10, role: 'module:components' }),
    record('src/modules/orders/components/D.tsx', { layer: 10, role: 'module:components' }),
  ]
  const findings = run(
    'S27',
    context({
      records,
      roles,
      structure: { directoryItemLimits: [{ role: 'module:components', max: 1 }] },
    }),
  )
  assert.equal(findings.length, 1, '只有 crews 超限（ui 子目录算一个一级子项）')
  assert.equal(findings[0].file, 'src/modules/crews/components/A.tsx', '锚在该目录字典序最小的文件')
  assert.match(findings[0].text, /src\/modules\/crews\/components/)
  assert.equal(findings[0].global, true, '目录级谓词必须标 global（增量模式不丢报）')
})

test('S27 默认预算：没人声明的目录也判，测试脚手架不计', () => {
  const roles = [
    { id: 'test', pattern: '**/*.test.ts', layer: 99, exclusive: true },
    { id: 'items', pattern: 'src/items/**', layer: 1 },
    { id: 'mixed', pattern: 'src/mixed/**', layer: 1 },
  ]
  const records = [
    record('src/items/a.ts', { role: 'items' }),
    record('src/items/b.ts', { role: 'items' }),
    record('src/items/c.ts', { role: 'items' }),
    record('src/mixed/a.ts', { role: 'mixed' }),
    record('src/mixed/b.ts', { role: 'mixed' }),
    record('src/mixed/x.test.ts', { role: 'test', layer: 99 }),
    record('src/mixed/y.test.ts', { role: 'test', layer: 99 }),
  ]
  const findings = run('S27', context({ records, roles, structure: { maxItemsPerDir: 2 } }))
  assert.equal(findings.length, 1, 'items 超限；mixed 扣掉测试只剩 2 个，不报')
  assert.equal(findings[0].file, 'src/items/a.ts')
  assert.match(findings[0].text, /默认上限/)
  assert.equal(findings[0].global, true)
})

test('S27 显式角色预算可以比默认更宽', () => {
  const roles = [{ id: 'data', pattern: 'src/data/**', layer: 1 }]
  const records = Array.from({ length: 4 }, (_, index) =>
    record(`src/data/t${index}.ts`, { role: 'data' }),
  )
  const findings = run(
    'S27',
    context({
      records,
      roles,
      structure: { maxItemsPerDir: 2, directoryItemLimits: [{ role: 'data', max: 5 }] },
    }),
  )
  assert.deepEqual(findings, [], '显式预算 5 覆盖默认 2')
})

test('S47 组级依赖环：A ↔ B 报一次（global），单向不报，测试不计', () => {
  const records = [
    record('src/features/a/model/x.ts', { layer: 12, group: 'a', groupName: 'slice' }),
    record('src/features/b/model/x.ts', { layer: 12, group: 'b', groupName: 'slice' }),
    record('src/features/a/model/x.test.ts', {
      layer: 99,
      role: 'test',
      group: null,
      groupName: null,
    }),
  ]
  const both = new Map([
    ['src/features/a/model/x.ts', new Set(['src/features/b/model/x.ts'])],
    ['src/features/b/model/x.ts', new Set(['src/features/a/model/x.ts'])],
  ])
  const findings = run('S47', context({ records, edges: both }))
  assert.equal(findings.length, 1, '同一个环只报一次')
  assert.equal(findings[0].file, 'src/features/a/model/x.ts')
  assert.match(findings[0].text, /组级依赖环：slice a → slice b → slice a/)
  assert.equal(findings[0].global, true, '组级谓词标 global（增量模式不丢报）')
  const oneWay = new Map([['src/features/a/model/x.ts', new Set(['src/features/b/model/x.ts'])]])
  assert.deepEqual(run('S47', context({ records, edges: oneWay })), [], '单向依赖不是环')
})

test('S28 外部引用下限：0 个必报、只被 app 引用放过、pages 层整层跳过、同层引用不计', () => {
  const records = [
    record('src/features/dead/index.ts', {
      layer: 3,
      role: 'entry',
      group: 'dead',
      groupName: 'slice',
    }),
    record('src/features/dead/ui/Dead.tsx', { layer: 3, group: 'dead', groupName: 'slice' }),
    record('src/features/used/index.ts', {
      layer: 3,
      role: 'entry',
      group: 'used',
      groupName: 'slice',
    }),
    record('src/features/used/ui/Used.tsx', { layer: 3, group: 'used', groupName: 'slice' }),
    record('src/features/apponly/index.ts', {
      layer: 3,
      role: 'entry',
      group: 'apponly',
      groupName: 'slice',
    }),
    record('src/pages/never/index.ts', {
      layer: 5,
      role: 'entry',
      group: 'never',
      groupName: 'slice',
    }),
    record('src/pages/crews/ui/CrewsPage.tsx', {
      layer: 5,
      role: 'page',
      group: 'crews',
      groupName: 'slice',
    }),
    record('src/app/router/index.tsx', { layer: 6, role: 'app' }),
  ]
  const roles = [
    { id: 'entry', pattern: 'src/**/index.ts', layer: 1, entry: true },
    { id: 'app', pattern: 'src/app/**', layer: 6 },
  ]
  const structure = {
    groupInDegree: [{ dimension: 'slice', min: 1, exceptLayers: [5], singleFromLayers: [6] }],
  }
  const edges = [
    ['src/pages/crews/ui/CrewsPage.tsx', new Set(['src/features/used/index.ts'])],
    ['src/app/router/index.tsx', new Set(['src/features/apponly/index.ts'])],
  ]
  const importers = [
    ['src/features/used/index.ts', new Set(['src/pages/crews/ui/CrewsPage.tsx'])],
    ['src/features/apponly/index.ts', new Set(['src/app/router/index.tsx'])],
  ]
  assert.deepEqual(
    run('S28', context({ records, roles, structure })).map((finding) => finding.file),
    [
      'src/features/dead/ui/Dead.tsx',
      'src/features/used/ui/Used.tsx',
      'src/features/apponly/index.ts',
    ],
    '没给图（无引用）时：dead / used / apponly 都算零引用，pages 层跳过',
  )
  assert.deepEqual(
    run('S28', context({ records, roles, structure, edges, importers })).map((f) => f.file),
    ['src/features/dead/ui/Dead.tsx'],
    '有引用后：used 有跨层引用不报；apponly 只被 app 引用 → 放过；dead 零引用照报',
  )
  assert.deepEqual(run('S28', context({ records, roles })), [], '没声明 groupInDegree → 不参与判定')
})

test('S28 同层引用不计：同层跨组引用不算外部引用', () => {
  const records = [
    record('src/features/a/index.ts', { layer: 3, role: 'entry', group: 'a', groupName: 'slice' }),
    record('src/features/b/index.ts', { layer: 3, role: 'entry', group: 'b', groupName: 'slice' }),
  ]
  const roles = [{ id: 'entry', pattern: 'src/**/index.ts', layer: 1, entry: true }]
  const structure = { groupInDegree: [{ dimension: 'slice', min: 1 }] }
  const findings = run(
    'S28',
    context({
      records,
      roles,
      structure,
      edges: [['src/features/a/index.ts', new Set(['src/features/b/index.ts'])]],
    }),
  )
  assert.deepEqual(
    findings.map((finding) => finding.file).sort(),
    ['src/features/a/index.ts', 'src/features/b/index.ts'],
    '同层引用互相都不算外部引用 → 两条都报',
  )
})

test('S28 min > 1：只有一个外部引用者时报，唯一引用者是 app 时放过', () => {
  const records = [
    record('src/features/used/index.ts', {
      layer: 3,
      role: 'entry',
      group: 'used',
      groupName: 'slice',
    }),
    record('src/features/lonely/index.ts', {
      layer: 3,
      role: 'entry',
      group: 'lonely',
      groupName: 'slice',
    }),
    record('src/features/dead/index.ts', {
      layer: 3,
      role: 'entry',
      group: 'dead',
      groupName: 'slice',
    }),
    record('src/app/router/index.tsx', { layer: 6, role: 'app' }),
    record('src/pages/home/ui/Home.tsx', {
      layer: 5,
      role: 'page',
      group: 'home',
      groupName: 'slice',
    }),
  ]
  const roles = [{ id: 'entry', pattern: 'src/**/index.ts', layer: 1, entry: true }]
  const structure = {
    groupInDegree: [{ dimension: 'slice', min: 2, exceptLayers: [5], singleFromLayers: [6] }],
  }
  const findings = run(
    'S28',
    context({
      records,
      roles,
      structure,
      edges: [
        ['src/app/router/index.tsx', new Set(['src/features/used/index.ts'])],
        ['src/pages/home/ui/Home.tsx', new Set(['src/features/lonely/index.ts'])],
      ],
    }),
  )
  assert.deepEqual(
    findings.map((finding) => finding.file).sort(),
    ['src/features/dead/index.ts', 'src/features/lonely/index.ts'],
    'used 的唯一引用者是 app → 放过；lonely 来源不是 app → 报；dead 零引用 → 报',
  )
})

test('S29 组名撞单元名：词汇表只收真实存在的角色目录', () => {
  const records = [
    record('src/pages/config/index.ts', {
      layer: 5,
      role: 'pages:index',
      group: 'config',
      groupName: 'slice',
    }),
    record('src/shared/config/index.ts', { layer: 1, role: 'fsd:shared:config' }),
  ]
  const roles = [
    {
      id: 'pages:index',
      pattern: 'src/pages/{slice}/index.ts',
      layer: 5,
      group: 'slice',
      entry: true,
    },
    { id: 'fsd:shared:config', pattern: 'src/shared/config/**', layer: 1 },
    { id: 'fsd:shared:api', pattern: 'src/shared/api/**', layer: 1 },
  ]
  const structure = {
    nameCollisions: [
      { dimension: 'slice', vocabularyRoles: ['fsd:shared:config', 'fsd:shared:api'] },
    ],
  }
  const findings = run('S29', context({ records, roles, structure }))
  assert.deepEqual(
    findings.map((finding) => finding.file),
    ['src/pages/config/index.ts'],
  )
  // 词汇角色一个文件都没有（shared/api 不存在）→ 进"config"这个切片的词表只剩 config
  const noConfig = context({
    records: [
      records[0],
      record('src/shared/api/contract.ts', { layer: 1, role: 'fsd:shared:api' }),
    ],
    roles,
    structure,
  })
  assert.deepEqual(run('S29', noConfig), [], 'shared/config 不存在时不该报 config 这个切片名')
})

test('S30 重复词：桶内 > 2 个名字且每个都带同一个词才报', () => {
  const three = [
    record('src/widgets/a-widget/index.ts', { layer: 4, group: 'a-widget', groupName: 'slice' }),
    record('src/widgets/b-widget/index.ts', { layer: 4, group: 'b-widget', groupName: 'slice' }),
    record('src/widgets/c-widget/index.ts', { layer: 4, group: 'c-widget', groupName: 'slice' }),
  ]
  const structure = { repetitiveNaming: ['slice'] }
  assert.equal(run('S30', context({ records: three, structure })).length, 1)
  assert.deepEqual(
    run('S30', context({ records: three.slice(0, 2), structure })),
    [],
    '只有两个名字不算重复（社区口径：> 2）',
  )
})

test('S31 单复数一致性：中性词不参与、两类都出现才报、按多数派给建议', () => {
  const structure = { pluralConsistency: [{ dimension: 'slice', layers: [2] }] }
  const mixed = [
    record('src/entities/user/index.ts', { layer: 2, group: 'user', groupName: 'slice' }),
    record('src/entities/order/index.ts', { layer: 2, group: 'order', groupName: 'slice' }),
    record('src/entities/notifications/index.ts', {
      layer: 2,
      group: 'notifications',
      groupName: 'slice',
    }),
  ]
  const findings = run('S31', context({ records: mixed, structure }))
  assert.equal(findings.length, 1)
  assert.match(findings[0].text, /统一成单数/)
  assert.match(findings[0].text, /notifications 改成 notification/)

  const allPlural = [
    record('src/entities/users/index.ts', { layer: 2, group: 'users', groupName: 'slice' }),
    record('src/entities/orders/index.ts', { layer: 2, group: 'orders', groupName: 'slice' }),
    record('src/entities/media/index.ts', { layer: 2, group: 'media', groupName: 'slice' }),
  ]
  assert.deepEqual(
    run('S31', context({ records: allPlural, structure })),
    [],
    '全复数 + 中性词 → 不报',
  )
  // 只查声明的层：别的层混用不管
  const otherLayer = mixed.map((item) => ({ ...item, layer: 3 }))
  assert.deepEqual(run('S31', context({ records: otherLayer, structure })), [])
})
