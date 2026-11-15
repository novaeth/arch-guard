import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bucketsOf,
  dirOfPattern,
  dirPatternSegments,
  extraDirsOf,
  finding,
  segmentMatches,
  unitDirOf,
  unitDirsOf,
} from '../es/packs/core/rules/structure-util.js'

test('零件：角色 pattern 的目录部分（`dir/**` 与文件形态）', () => {
  assert.deepEqual(dirPatternSegments('src/pages/{slice}/ui/**'), ['src', 'pages', '{slice}', 'ui'])
  assert.deepEqual(dirPatternSegments('src/shared/api/index.ts'), ['src', 'shared', 'api'])
  assert.equal(dirPatternSegments('index.ts'), null, '拿不到两段以上目录 → 放弃（宁少报不误报）')
  assert.equal(dirOfPattern('src/shared/lib/**'), 'src/shared/lib')
  assert.equal(dirOfPattern('src/shared/lib/index.ts'), null)
})

test('零件：路径段匹配（捕获 / 枚举 / 通配 / 字面量）', () => {
  assert.equal(segmentMatches('{slice}', 'crews'), true)
  assert.equal(segmentMatches('{a,b}', 'a'), true)
  assert.equal(segmentMatches('{a,b}', 'c'), false)
  assert.equal(segmentMatches('{a,b}.ts', 'a.ts'), true)
  assert.equal(segmentMatches('{a,b}.ts', 'c.ts'), false)
  assert.equal(segmentMatches('*', 'anything'), true)
  assert.equal(segmentMatches('ui', 'ui'), true)
  assert.equal(segmentMatches('ui', 'lib'), false)
})

test('零件：超出角色 pattern 的目录（保留名判据的基础）', () => {
  assert.deepEqual(extraDirsOf('src/shared/ui/button/ui/x.ts', 'src/shared/ui/**'), [
    'src/shared/ui/button',
    'src/shared/ui/button/ui',
  ])
  assert.deepEqual(extraDirsOf('src/shared/api/contract.ts', 'src/shared/api/**'), [])
  assert.equal(
    extraDirsOf('src/shared/api/contract.ts', 'src/pages/{slice}/ui/**'),
    null,
    'pattern 与路径对不上',
  )
  assert.equal(extraDirsOf('src/a.ts', 'src/{slice}/ui/**'), null, '目录段数不够')
})

test('零件：单元目录（pattern 形态与兜底形态）', () => {
  assert.equal(unitDirOf([{ id: 'r', pattern: 'src/shared/api/**' }], 'r', []), 'src/shared/api')
  assert.equal(
    unitDirOf([{ id: 'r', pattern: 'src/shared/{seg}/index.ts' }], 'r', [
      { rel: 'src/shared/api/index.ts' },
      { rel: 'src/shared/api/client.ts' },
    ]),
    'src/shared/api',
    'pattern 不是 dir/** 时退回命中文件的公共目录',
  )
  assert.equal(
    unitDirOf([{ id: 'r', pattern: 'src/shared/{seg}/index.ts' }], 'r', [
      { rel: 'src/shared/api/a/x.ts' },
      { rel: 'src/shared/api/b/y.ts' },
    ]),
    'src/shared/api',
    '多个不同目录时收敛到公共前缀（while 循环那条路径）',
  )
  assert.equal(unitDirOf([{ id: 'r', pattern: 'src/shared/{seg}/index.ts' }], 'r', []), null)
  assert.equal(unitDirOf([{ id: 'r', pattern: 'src/a/x.ts' }], 'r', []), null, '拿不到就跳过')
})

test('零件：单元目录按角色 pattern 展开成实际目录（S27 参数化角色）', () => {
  const roles = [
    { id: 'module:components', pattern: 'src/modules/{domain}/components/**' },
    { id: 'lib', pattern: 'src/shared/lib/**' },
  ]
  assert.deepEqual(
    unitDirsOf(roles, 'module:components', [
      { rel: 'src/modules/crews/components/A.tsx' },
      { rel: 'src/modules/orders/components/B.tsx' },
      { rel: 'src/modules/crews/components/ui/C.tsx' },
    ]),
    ['src/modules/crews/components', 'src/modules/orders/components'],
    '同一个实际目录只出现一次；子目录不另算',
  )
  assert.deepEqual(
    unitDirsOf(roles, 'lib', [{ rel: 'src/shared/lib/a.ts' }]),
    ['src/shared/lib'],
    'literal 角色行为不变',
  )
  assert.deepEqual(unitDirsOf(roles, 'lib', []), [], '没有任何记录 → 没有目录')
  assert.deepEqual(
    unitDirsOf([{ id: 'file', pattern: 'src/a/x.ts' }], 'file', [{ rel: 'src/a/x.ts' }]),
    ['src/a'],
    '文件形态的 pattern 也按目录段展开',
  )
})

test('零件：分桶（同层 + 除本维度外的捕获）', () => {
  const record = (rel, group, groupName, captures) => ({
    rel,
    group,
    groupName,
    captures,
    layer: 3,
  })
  const buckets = bucketsOf(
    {
      records: [
        record('src/features/auth/login/ui/a.ts', 'login', 'slice', {
          group: 'auth',
          slice: 'login',
        }),
        record('src/features/auth/signup/ui/b.ts', 'signup', 'slice', {
          group: 'auth',
          slice: 'signup',
        }),
        record('src/features/flat/ui/c.ts', 'flat', 'slice', {}),
      ],
    },
    'slice',
  )
  assert.equal(buckets.size, 2)
  assert.deepEqual(
    [...buckets.values()].map((bucket) => [...bucket.names].sort()),
    [['login', 'signup'], ['flat']],
  )
  // 只保留声明过的层
  assert.equal(
    bucketsOf({ records: [record('a.ts', 'flat', 'slice', {})] }, 'slice', new Set([9])).size,
    0,
  )
  // 别的维度 / 没有组值的记录不进桶
  assert.equal(
    bucketsOf(
      { records: [record('a.ts', null, null, {}), record('b.ts', 'x', 'other', {})] },
      'slice',
    ).size,
    0,
  )
})

test('零件：finding 带上 hint（报文要能照着改）', () => {
  assert.deepEqual(finding('S01', 'src/a.ts', 3, '问题'), {
    rule: 'S01',
    file: 'src/a.ts',
    line: 3,
    text: '问题',
  })
  assert.equal(finding('S01', 'src/a.ts', 1, '问题', '这么改').hint, '这么改')
})
