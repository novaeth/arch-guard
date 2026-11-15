import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { pushAdviceNotices } from '../es/engine/advice.js'
import { coreRules, runGuard } from '../es/index.js'

/**
 * 架构建议（R-118）：从已有事实算**可核对的信号** + 处方选项，且**永不阻断**。
 * 判据细节：只数具名导入 · 只算"每个导出恰好被一个域用" · 纯类型导出不算 · 公开面入口不算。
 */

const fact = (over = {}) => ({
  imports: [],
  exports: [],
  strings: [],
  calls: [],
  reads: [],
  numbers: [],
  functions: [],
  ...over,
})

function advise({ records, facts, edges, adviceAllow = [], files, structure }) {
  const notices = []
  pushAdviceNotices(
    {
      config: { roles: [], adviceAllow, ...(structure ? { structure } : {}) },
      records,
      facts: new Map(Object.entries(facts)),
      graph: { importers: edges.importers ?? new Map(), edges: edges.graph ?? new Map() },
      files: files ?? records.map((record) => record.rel),
    },
    notices,
  )
  return notices.filter((notice) => notice.code === 'architecture-advice')
}

const shared = (rel, names) => ({
  rel,
  domain: 'shared',
  captures: {},
  exports: names.map((name) => ({ name, declared: true, typeOnly: false })),
})
const page = (rel, domain, imports) => ({
  rel,
  domain,
  captures: {},
  exports: [],
  imports,
})
/** 从 `src/modules/<域>/hooks/x.ts` 指向 `src/shared/api/client.ts` 的相对路径 */
const consumer = (name) => ({ spec: '../../../shared/api/client', names: [name] })

test('R-118：一个文件里 ≥3 个导出各归各域 → 给建议（并列出证据）', () => {
  const records = [
    shared('src/shared/api/client.ts', ['fetchCrews', 'fetchOrders', 'fetchCustomers']),
    page('src/modules/crews/hooks/a.ts', 'crews'),
    page('src/modules/orders/hooks/b.ts', 'orders'),
    page('src/modules/customers/hooks/c.ts', 'customers'),
  ]
  const facts = {
    'src/shared/api/client.ts': fact({
      exports: records[0].exports,
    }),
    'src/modules/crews/hooks/a.ts': fact({ imports: [consumer('fetchCrews')] }),
    'src/modules/orders/hooks/b.ts': fact({ imports: [consumer('fetchOrders')] }),
    'src/modules/customers/hooks/c.ts': fact({ imports: [consumer('fetchCustomers')] }),
  }
  const importers = new Map([
    [
      'src/shared/api/client.ts',
      new Set([
        'src/modules/crews/hooks/a.ts',
        'src/modules/orders/hooks/b.ts',
        'src/modules/customers/hooks/c.ts',
      ]),
    ],
  ])
  const notices = advise({ records, facts, edges: { importers } })
  assert.equal(notices.length, 1)
  assert.match(notices[0].text, /client\.ts 里有 3 个导出\*\*各归各域\*\*/)
  assert.match(notices[0].text, /fetchCrews→crews/)
})

test('R-118 边界：被两个域共用 / 不足 3 个 / 纯类型导出 / 公开面入口 → 不建议', () => {
  const records = [
    shared('src/shared/api/client.ts', ['a', 'b', 'c']),
    page('src/modules/crews/hooks/a.ts', 'crews'),
    page('src/modules/orders/hooks/b.ts', 'orders'),
  ]
  const importers = new Map([
    [
      'src/shared/api/client.ts',
      new Set(['src/modules/crews/hooks/a.ts', 'src/modules/orders/hooks/b.ts']),
    ],
  ])
  // 四个导出都被同一个域用（那是一个域自己的东西，不是"各归各域"）
  const oneDomain = {
    'src/shared/api/client.ts': fact({
      exports: ['a', 'b', 'c', 'd'].map((name) => ({ name, declared: true, typeOnly: false })),
    }),
    'src/modules/crews/hooks/a.ts': fact({
      imports: ['a', 'b', 'c', 'd'].map((name) => consumer(name)),
    }),
  }
  assert.equal(advise({ records, facts: oneDomain, edges: { importers } }).length, 0)
  // 纯类型导出（DTO 那种"按域命名却该集中"的契约镜像）
  const types = {
    'src/shared/api/client.ts': fact({
      exports: ['a', 'b', 'c'].map((name) => ({ name, declared: true, typeOnly: true })),
    }),
    'src/modules/crews/hooks/a.ts': fact({ imports: [consumer('a')] }),
    'src/modules/orders/hooks/b.ts': fact({ imports: [consumer('b')] }),
  }
  assert.equal(advise({ records, facts: types, edges: { importers } }).length, 0)
})

test('R-118 在真示例上：canonical 给出一条（client.ts 的取数函数），FSD / minimal 零条', async () => {
  const adviceOf = async (name) => {
    const result = await runGuard({
      cwd: fileURLToPath(new URL(`../examples/${name}`, import.meta.url)),
      ruleSet: coreRules,
      quiet: true,
    })
    return result.notices.filter((notice) => notice.code === 'architecture-advice')
  }
  // 三套样板要么没有建议，要么只剩"被声明豁免"的自述（那不是可执行建议）
  const actionable = (list) => list.filter((notice) => notice.text.includes('常见处置'))
  assert.equal(actionable(await adviceOf('full')).length, 0, 'canonical：没有可执行建议')
  assert.equal(actionable(await adviceOf('minimal')).length, 0)
  const fsd = await adviceOf('full-fsd')
  assert.equal(actionable(fsd).length, 0, 'FSD：唯一的建议已按 adviceAllow 豁免')
  assert.match(
    fsd.map((notice) => notice.text).join(' '),
    /1 条被 `adviceAllow` 声明豁免/,
    '豁免必须在报告里可见（R-121）',
  )
})

const grouped = (rel, group, layer = 10) => ({
  rel,
  domain: null,
  captures: {},
  groupName: 'domain',
  group,
  layer,
  exports: [],
})

test('R-120 域粒度：组只有 1 个源文件 / 组超过 20 个源文件 → 各给一条建议', () => {
  const oneFile = advise({
    records: [grouped('src/modules/tiny/index.ts', 'tiny')],
    facts: {},
    edges: {},
  })
  assert.equal(oneFile.length, 1)
  assert.match(oneFile[0].text, /domain tiny 只有 1 个源文件/)

  const big = advise({
    records: Array.from({ length: 21 }, (_, index) =>
      grouped(`src/modules/big/f${index}.ts`, 'big'),
    ),
    facts: {},
    edges: {},
  })
  assert.equal(big.length, 1)
  assert.match(big[0].text, /domain big 有 21 个源文件/)

  // 2 个文件刚好不报（阈值是"少于 2"）；测试层不计入组
  const ok = advise({
    records: [
      grouped('src/modules/ok/index.ts', 'ok'),
      grouped('src/modules/ok/model/types.ts', 'ok'),
      grouped('src/modules/stub/index.ts', 'stub', 99),
    ],
    facts: {},
    edges: {},
  })
  assert.equal(ok.length, 0, '2 个文件不报；layer ≥ 90 的文件不算组的文件')
})

test('R-121：豁免按（信号 × 主体）生效，而且**豁免本身要自述**；没命中的豁免要能删', () => {
  const records = [grouped('src/modules/tiny/index.ts', 'tiny')]
  // 不豁免 → 一条建议
  assert.equal(advise({ records, facts: {}, edges: {} }).length, 1)
  // 豁免 → 0 条建议，但多一条"被豁免了 1 条"的自述（静默关闭是这套机制最该防的事）
  const allowed = advise({
    records,
    facts: {},
    edges: {},
    adviceAllow: [
      { signal: 'group-granularity', glob: 'domain tiny', reason: '它是单文件的横切适配器' },
    ],
  })
  assert.equal(allowed.length, 1)
  assert.match(allowed[0].text, /1 条被 `adviceAllow` 声明豁免/)
  // 信号对不上 → 不生效（豁免必须指名信号），而且"声明必须有消费者"（0 命中即红，R-171）
  assert.throws(
    () =>
      advise({
        records,
        facts: {},
        edges: {},
        adviceAllow: [{ signal: 'per-domain-exports', glob: 'domain tiny', reason: 'x' }],
      }),
    /adviceAllow 有 1 条 0 命中（声明必须有消费者）/,
  )
})

const logicGroup = (rel, group, layer = 12) => ({
  rel,
  domain: null,
  captures: {},
  groupName: 'slice',
  group,
  layer,
  exports: [],
})

/** 造一个"组里有逻辑文件、有没有测试由调用方决定"的最小工程 */
function groupsProject({ testUnder = [] } = {}) {
  const records = [
    logicGroup('src/features/a/model/logic.ts', 'a'),
    logicGroup('src/features/b/model/logic.ts', 'b'),
  ]
  const exportFact = {
    hasJsx: false,
    exports: [{ name: 'run', declared: true, typeOnly: false, kind: 'function' }],
    imports: [],
  }
  return {
    records,
    facts: {
      'src/features/a/model/logic.ts': exportFact,
      'src/features/b/model/logic.ts': exportFact,
    },
    files: ['src/features/a/model/logic.ts', 'src/features/b/model/logic.ts', ...testUnder],
    edges: {},
  }
}

test('R-122 未测试的逻辑组：有逻辑却没测试 → 建议；补了测试 / 非逻辑片段 → 不建议', () => {
  const noTest = advise(groupsProject())
  assert.equal(noTest.filter((item) => item.text.includes('整组 0 个测试')).length, 2)
  const withTest = advise(groupsProject({ testUnder: ['src/features/a/model/logic.test.ts'] }))
  assert.equal(
    withTest.filter((item) => item.text.includes('整组 0 个测试')).length,
    1,
    'a 已有测试',
  )

  // 非逻辑片段（路由表 / 装配）不算"该配单测的逻辑"
  const routes = {
    records: [logicGroup('src/modules/crews/routes.tsx', 'crews')],
    facts: {
      'src/modules/crews/routes.tsx': {
        hasJsx: false,
        exports: [{ name: 'crewRoutes', declared: true, typeOnly: false, kind: 'const' }],
        imports: [],
      },
    },
    files: ['src/modules/crews/routes.tsx'],
    edges: {},
  }
  assert.equal(advise(routes).filter((item) => item.text.includes('整组 0 个测试')).length, 0)
})

test('R-123 同层组复用：≥3 个同级组引用同一组 → 建议；2 个 / 更共享的层 → 不建议', () => {
  const build = (consumers, consumerLayer = 12) => {
    const records = [logicGroup('src/entities/a/model/x.ts', 'a', 12)]
    const graph = new Map()
    const facts = { 'src/entities/a/model/x.ts': { hasJsx: false, exports: [], imports: [] } }
    consumers.forEach((name, index) => {
      const rel = `src/features/f${index}/ui/y.ts`
      records.push(logicGroup(rel, name, consumerLayer))
      graph.set(rel, new Set(['src/entities/a/model/x.ts']))
      facts[rel] = { hasJsx: false, exports: [], imports: [] }
    })
    return {
      records,
      facts,
      files: records.map((record) => record.rel),
      edges: { graph },
    }
  }
  const three = advise(build(['f0', 'f1', 'f2']))
  assert.equal(three.filter((item) => item.text.includes('同级或更内层**的组引用')).length, 1)
  const two = advise(build(['f0', 'f1']))
  assert.equal(two.filter((item) => item.text.includes('同级或更内层**的组引用')).length, 0)
  const higherUp = advise(build(['f0', 'f1', 'f2'], 20)) // 消费者在**更上层**用它 = 设计如此
  assert.equal(higherUp.filter((item) => item.text.includes('同级或更内层**的组引用')).length, 0)
})

test('R-135 组间依赖链过深：4 组链 → 建议；3 组链 → 不建议（正常纵深）', () => {
  const chain = (names, extra = {}) => {
    const records = names.map((name) => logicGroup(`src/features/${name}/model/x.ts`, name, 12))
    const graph = new Map()
    const facts = {}
    names.forEach((name, index) => {
      const rel = `src/features/${name}/model/x.ts`
      facts[rel] = { hasJsx: false, exports: [], imports: [] }
      if (index < names.length - 1)
        graph.set(rel, new Set([`src/features/${names[index + 1]}/model/x.ts`]))
    })
    return { records, facts, files: records.map((r) => r.rel), edges: { graph }, ...extra }
  }
  const four = advise(chain(['a', 'b', 'c', 'd']))
  const deep = four.filter((item) => item.text.includes('组间依赖链'))
  assert.equal(deep.length, 1)
  assert.match(deep[0].text, /slice a → slice b → slice c → slice d/)
  // 3 组 = pages → features → entities 这种正常纵深，不劝
  assert.equal(
    advise(chain(['a', 'b', 'c'])).filter((i) => i.text.includes('组间依赖链')).length,
    0,
  )
})

test('R-135 边界：有环时不提深度（环自己更严重）；声明组隔离时不提跨组（S22 已报）', () => {
  const records = ['a', 'b', 'c', 'd'].map((name) =>
    logicGroup(`src/features/${name}/model/x.ts`, name),
  )
  const facts = Object.fromEntries(
    records.map((r) => [r.rel, { hasJsx: false, exports: [], imports: [] }]),
  )
  const files = records.map((r) => r.rel)
  // 环：d → a（链上成环）→ 深度那条不提，环那条提
  const cyclic = new Map([
    ['src/features/a/model/x.ts', new Set(['src/features/b/model/x.ts'])],
    ['src/features/b/model/x.ts', new Set(['src/features/c/model/x.ts'])],
    ['src/features/c/model/x.ts', new Set(['src/features/d/model/x.ts'])],
    ['src/features/d/model/x.ts', new Set(['src/features/a/model/x.ts'])],
  ])
  const withCycle = advise({ records, facts, files, edges: { graph: cyclic } })
  assert.equal(withCycle.filter((i) => i.text.includes('组间依赖链')).length, 0, '有环不提深度')
  assert.equal(
    withCycle.filter((i) => i.text.includes('组级依赖环')).length,
    0,
    '组级环已升为 S47（R-170），建议层不再重复报',
  )
  // 声明了 isolate：跨组依赖本来就由 S22 报 → 跨组类的两条建议都不提
  const chain = new Map([
    ['src/features/a/model/x.ts', new Set(['src/features/b/model/x.ts'])],
    ['src/features/b/model/x.ts', new Set(['src/features/c/model/x.ts'])],
    ['src/features/c/model/x.ts', new Set(['src/features/d/model/x.ts'])],
  ])
  const isolated = advise({
    records,
    facts,
    files,
    edges: { graph: chain },
    structure: { isolate: ['slice'] },
  })
  assert.equal(isolated.filter((i) => i.text.includes('组间依赖链')).length, 0, '隔离项目不劝跨组')
})
