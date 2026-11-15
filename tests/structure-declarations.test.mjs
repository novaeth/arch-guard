import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  mergeStructureSpec,
  resolveStructure,
  StructureDeclarationError,
} from '../es/engine/structure.js'

const roles = [
  {
    id: 'fsd:pages:index',
    pattern: 'src/pages/{slice}/index.ts',
    layer: 5,
    group: 'slice',
    entry: true,
  },
  { id: 'fsd:pages:ui', pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' },
  { id: 'fsd:shared:lib', pattern: 'src/shared/lib/**', layer: 1 },
]

test('结构声明：没声明时每个字段都补齐（数组为空、布尔为 false）', () => {
  const resolved = resolveStructure({ roles })
  assert.equal(resolved.order, false)
  assert.deepEqual(resolved.isolate, [])
  assert.deepEqual(resolved.publicApi, [])
  assert.deepEqual(resolved.publicApiUnits, [])
  assert.deepEqual(resolved.segmentedGroups, [])
  assert.deepEqual(resolved.reservedNames, [])
  assert.deepEqual(resolved.groupCountLimits, [])
  assert.deepEqual(resolved.directoryItemLimits, [])
  assert.equal(resolved.maxItemsPerDir, 20, 'S27 的默认预算：没声明也要有（面向 AI，默认开启）')
  assert.deepEqual(resolved.groupInDegree, [])
  assert.deepEqual(resolved.nameCollisions, [])
  assert.deepEqual(resolved.repetitiveNaming, [])
  assert.deepEqual(resolved.pluralConsistency, [])
  assert.deepEqual(resolved.degreeLimits, [])
  assert.deepEqual(resolved.importLocality, [])
  assert.deepEqual(resolved.couplingLimits, [])
  assert.deepEqual(resolved.migrating, [])
})

test('结构声明：预设与 overrides 是加法（布尔取或、字符串数组取并集、带键数组拼接）', () => {
  const resolved = resolveStructure({
    preset: {
      order: true,
      isolate: ['slice'],
      reservedNames: ['ui'],
      groupCountLimits: [{ dimension: 'slice', max: 20 }],
    },
    overrides: {
      isolate: ['slice', 'segment'],
      reservedNames: ['lib'],
      publicApiUnits: [{ role: 'fsd:shared:lib', children: true }],
    },
    roles: [...roles, { id: 'x', pattern: 'src/x/{segment}/**', layer: 2, group: 'segment' }],
  })
  assert.equal(resolved.order, true)
  assert.deepEqual(resolved.isolate, ['slice', 'segment'])
  assert.deepEqual(resolved.reservedNames, ['ui', 'lib'])
  assert.deepEqual(resolved.groupCountLimits, [{ dimension: 'slice', max: 20 }])
  assert.deepEqual(resolved.publicApiUnits, [{ role: 'fsd:shared:lib', children: true }])
})

test('结构声明：维度名必须真实存在（否则这条声明永远不会生效）', () => {
  assert.throws(
    () =>
      resolveStructure({
        preset: { isolate: ['slice'] },
        roles: [{ id: 'a', pattern: 'src/a/**', layer: 1 }],
      }),
    (error) => {
      assert.ok(error instanceof StructureDeclarationError)
      assert.match(error.message, /没有任何角色用它做组维度/)
      return true
    },
  )
})

test('结构声明：指向的角色不在角色表里 → 直接报错（声明了却不生效 = 静默失能）', () => {
  assert.throws(
    () =>
      resolveStructure({
        preset: { publicApiUnits: [{ role: 'nope' }] },
        roles,
      }),
    (error) => {
      assert.ok(error instanceof StructureDeclarationError)
      assert.match(error.message, /不在角色表里/)
      return true
    },
  )
  assert.throws(
    () => resolveStructure({ preset: { directoryItemLimits: [{ role: 'nope', max: 3 }] }, roles }),
    StructureDeclarationError,
  )
})

test('结构声明：degreeLimits 按键合并，且必须真的给一个上限', () => {
  const resolved = resolveStructure({
    preset: { degreeLimits: [{ role: 'a', maxIn: 3 }] },
    overrides: {
      degreeLimits: [
        { role: 'a', maxIn: 5 },
        { role: 'b', maxOut: 2 },
      ],
    },
    roles: [
      { id: 'a', pattern: 'src/a/**', layer: 1 },
      { id: 'b', pattern: 'src/b/**', layer: 1 },
    ],
  })
  assert.deepEqual(resolved.degreeLimits, [
    { role: 'a', maxIn: 5 },
    { role: 'b', maxOut: 2 },
  ])
  assert.throws(
    () =>
      resolveStructure({
        preset: { degreeLimits: [{ role: 'a' }] },
        roles: [{ id: 'a', pattern: 'src/a/**', layer: 1 }],
      }),
    /既没给 maxIn 也没给 maxOut/,
  )
})

test('结构声明：overrides 是显式覆盖（预设给默认，宿主调数值）', () => {
  const resolved = resolveStructure({
    preset: { groupCountLimits: [{ dimension: 'slice', max: 20 }] },
    overrides: { groupCountLimits: [{ dimension: 'slice', max: 3 }] },
    roles,
  })
  assert.deepEqual(resolved.groupCountLimits, [{ dimension: 'slice', max: 3 }])
})

test('结构声明：同一份来源里出现两份不同声明 → 报错（两个真相不许静默取一个）', () => {
  assert.throws(
    () =>
      resolveStructure({
        // 两个预设拼接后落到同一个 preset 上：同一维度两份不同数值
        preset: {
          groupInDegree: [
            { dimension: 'slice', min: 1 },
            { dimension: 'slice', min: 2 },
          ],
        },
        roles,
      }),
    (error) => {
      assert.ok(error instanceof StructureDeclarationError)
      assert.match(error.message, /有两份不同的声明/)
      return true
    },
  )
  const same = resolveStructure({
    preset: { groupInDegree: [{ dimension: 'slice', min: 1 }] },
    overrides: { groupInDegree: [{ dimension: 'slice', min: 1 }] },
    roles,
  })
  assert.deepEqual(same.groupInDegree, [{ dimension: 'slice', min: 1 }])
})

test('结构声明：字段顺序不同不算差异（避免宿主的写法影响判定）', () => {
  const resolved = resolveStructure({
    preset: { nameCollisions: [{ dimension: 'slice', names: ['ui'] }] },
    overrides: { nameCollisions: [{ names: ['ui'], dimension: 'slice' }] },
    roles,
  })
  assert.deepEqual(resolved.nameCollisions, [{ dimension: 'slice', names: ['ui'] }])
})

test('mergeStructureSpec：两个预设的结构声明相加而不是覆盖', () => {
  const merged = mergeStructureSpec(
    { order: true, isolate: ['a'], repetitiveNaming: ['slice'] },
    { isolate: ['b'], reservedNames: ['ui'], pluralConsistency: [{ dimension: 'slice' }] },
  )
  assert.equal(merged.order, true)
  assert.deepEqual(merged.isolate, ['a', 'b'])
  assert.deepEqual(merged.repetitiveNaming, ['slice'])
  assert.deepEqual(merged.reservedNames, ['ui'])
  assert.deepEqual(merged.pluralConsistency, [{ dimension: 'slice' }])
  assert.deepEqual(mergeStructureSpec(undefined, { order: true }), { order: true })
  assert.deepEqual(mergeStructureSpec({ order: true }, undefined), { order: true })
})

test('声明可命中性：声明了公开面却没有 entry 角色 → 报错（这条声明永远不命中）', () => {
  assert.throws(
    () =>
      resolveStructure({
        preset: { publicApi: ['slice'] },
        roles: [
          { id: 'fsd:pages:ui', pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' },
        ],
      }),
    (error) => {
      assert.ok(error instanceof StructureDeclarationError)
      assert.match(error.message, /没有任何 entry: true 的角色/)
      return true
    },
  )
  // 有了 entry 角色就通过
  assert.doesNotThrow(() =>
    resolveStructure({
      preset: { publicApi: ['slice'] },
      roles: [
        { id: 'fsd:pages:ui', pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' },
        {
          id: 'fsd:pages:index',
          pattern: 'src/pages/{slice}/index.ts',
          layer: 5,
          group: 'slice',
          entry: true,
        },
      ],
    }),
  )
})

test('声明可命中性：nameCollisions 的词汇角色 / degreeLimits 的角色必须真实存在', () => {
  const roles = [{ id: 'a', pattern: 'src/a/{slice}/**', layer: 5, group: 'slice' }]
  assert.throws(
    () =>
      resolveStructure({
        preset: { nameCollisions: [{ dimension: 'slice', vocabularyRoles: ['nope'] }] },
        roles,
      }),
    StructureDeclarationError,
  )
  assert.throws(
    () => resolveStructure({ preset: { degreeLimits: [{ role: 'nope', maxIn: 3 }] }, roles }),
    StructureDeclarationError,
  )
})

/**
 * 数字字段写错类型 = **静默空转**（比较永远为假，规则照常"在跑"却什么都不判）。
 * 实测撞出来的：`pluralConsistency.layers` 写成层名（`['modules']`）时 S31 一条都没跑过。
 */
test('结构声明：数字字段必须是整数（写错类型不许静默空转）', () => {
  const cases = [
    [
      { pluralConsistency: [{ dimension: 'slice', layers: ['modules'] }] },
      /pluralConsistency\.layers/,
    ],
    [{ pluralConsistency: [{ dimension: 'slice', layers: [1.5] }] }, /pluralConsistency\.layers/],
    [{ groupCountLimits: [{ dimension: 'slice', max: '20' }] }, /groupCountLimits\.max/],
    [{ directoryItemLimits: [{ role: 'fsd:shared:lib', max: '3' }] }, /directoryItemLimits\.max/],
    [{ groupInDegree: [{ dimension: 'slice', min: '1' }] }, /groupInDegree\.min/],
    [{ degreeLimits: [{ role: 'fsd:shared:lib', maxIn: '3' }] }, /degreeLimits\.maxIn/],
    [{ degreeLimits: [{ role: 'fsd:shared:lib', maxOut: 1.5 }] }, /degreeLimits\.maxOut/],
  ]
  for (const [preset, pattern] of cases) {
    assert.throws(
      () => resolveStructure({ preset, roles }),
      (error) => {
        assert.ok(error instanceof StructureDeclarationError, JSON.stringify(preset))
        assert.match(error.message, pattern)
        assert.match(error.message, /静默空转/)
        return true
      },
      JSON.stringify(preset),
    )
  }

  // 合法写法照常通过
  const ok = resolveStructure({
    preset: {
      pluralConsistency: [{ dimension: 'slice', layers: [5] }],
      groupCountLimits: [{ dimension: 'slice', max: 20 }],
      degreeLimits: [{ role: 'fsd:shared:lib', maxIn: 3 }],
    },
    roles,
  })
  assert.deepEqual(ok.pluralConsistency, [{ dimension: 'slice', layers: [5] }])
})
