import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coreRules, deps, depsPolicyFrom, policyConflicts } from '../es/index.js'
import { effectiveFingerprints } from '../es/packs/core/rules/deps-fingerprints.js'

/**
 * R-154：自定义能力。
 *
 * 对象形态与字符串形态的差别只有「证据从哪来」—— 落进生效表后 P06 / P07 / 冲突检测 / 文档
 * 都不该再区分来源。所以这组测试盯三件事：
 *   ① 解析：对象一次性拆成「能力 → 首选」+ 同形指纹条目；
 *   ② 判定：P06 的 import 豁免与 P07 的两类证据对自定义能力同样成立；
 *   ③ 配置期 fail-closed：写错了不许静默失效。
 */

const rule = (id) => {
  const found = coreRules.find((entry) => entry.id === id)
  assert.ok(found, `规则 ${id} 不存在`)
  return found
}

const HTTP_CLIENT = {
  preferred: 'axios',
  syntax: ['\\bfetch\\s*\\('],
  hint: '请求统一走 src/shared/api/client.ts 的 axios 封装',
}

const ctx = ({ policy, sources = {}, exports = {}, imports = {} }) => {
  const relations = Object.keys(sources)
  return {
    config: { structure: {}, params: {} },
    records: relations.map((rel) => ({ rel, kind: 'ts', layer: 3, captures: {} })),
    facts: new Map(
      relations.map((rel) => [
        rel,
        { comments: [], exports: exports[rel] ?? [], functions: [], imports: imports[rel] ?? [] },
      ]),
    ),
    sourceOf: (rel) => sources[rel],
    policy,
    graph: { edges: new Map(), importers: new Map() },
    scan: {
      records: [],
      files: [],
      missing: [],
      ambiguous: [],
      exempted: [],
      outside: [],
      foreign: [],
    },
    deps: { declared: [], installed: [] },
    files: relations,
  }
}

test('解析：对象形态拆成「能力 → 首选」+ 同形指纹条目，字符串形态照旧', () => {
  const policy = depsPolicyFrom({
    capabilities: {
      datetime: 'dayjs',
      'http-client': HTTP_CLIENT,
    },
  })
  assert.deepEqual(policy.capabilities, { datetime: 'dayjs', 'http-client': 'axios' })
  assert.deepEqual(policy.customCapabilities, [
    {
      capability: 'http-client',
      preferred: ['axios'],
      syntax: ['\\bfetch\\s*\\('],
      hint: HTTP_CLIENT.hint,
    },
  ])
})

test('配置期校验：重名 / 无证据 / 坏正则 / 缺 hint / 命名证据不成对都直接报错', () => {
  const cases = [
    [{ datetime: { preferred: 'dayjs', syntax: ['x'], hint: 'h' } }, /内置能力/],
    [{ x: { preferred: 'p', hint: 'h' } }, /没有任何指纹/],
    [{ x: { preferred: 'p', syntax: ['('], hint: 'h' } }, /不是合法正则/],
    [{ x: { preferred: 'p', syntax: ['x'] } }, /缺 hint/],
    [{ x: { preferred: 'p', apiNames: ['foo'], hint: 'h' } }, /apiNames 没有 softSyntax/],
    [{ x: { preferred: 'p', softSyntax: ['setTimeout\\('], hint: 'h' } }, /只有 softSyntax/],
  ]
  for (const [capabilities, pattern] of cases) {
    assert.throws(() => deps({ capabilities }), pattern)
    assert.throws(() => depsPolicyFrom({ capabilities }), pattern)
  }
  // 非字符串 / 非对象的老写法仍然忽略（历史行为，配置里可能残留）
  assert.deepEqual(depsPolicyFrom({ capabilities: { bad: 2 } }).capabilities, {})
})

test('生效表：自定义能力与内置能力合并，fingerprints 覆盖对自定义能力同样生效', () => {
  const preset = deps({
    capabilities: { 'http-client': HTTP_CLIENT },
    fingerprints: [{ capability: 'http-client', addSyntax: ['\\bXMLHttpRequest\\b'] }],
  })
  const policy = depsPolicyFrom(preset.params)
  const entry = effectiveFingerprints(policy).find((item) => item.capability === 'http-client')
  assert.deepEqual(entry?.syntax, ['\\bfetch\\s*\\(', '\\bXMLHttpRequest\\b'])
  // 覆盖能力名拼错仍然报错，且提示里同时给出内置与本次声明的自定义能力
  assert.throws(
    () =>
      deps({
        capabilities: { 'http-client': HTTP_CLIENT },
        fingerprints: [{ capability: 'nope' }],
      }),
    /不存在的能力.*http-client/s,
  )
})

test('P06：自定义能力强指纹命中即报；同一文件 import 了首选方案则豁免', () => {
  const policy = depsPolicyFrom({ capabilities: { 'http-client': HTTP_CLIENT } })
  const violation = {
    'src/shared/lib/http.ts': "export const load = () => fetch('/api/crews')\n",
  }
  const findings = rule('P06').run(ctx({ policy, sources: violation }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].file, 'src/shared/lib/http.ts')
  assert.match(findings[0].text, /http-client/)
  assert.equal(findings[0].hint, HTTP_CLIENT.hint)

  const compliant = {
    'src/shared/lib/http.ts':
      "import axios from 'axios'\nexport const load = () => fetch('/api/crews')\n",
  }
  assert.deepEqual(
    rule('P06').run(
      ctx({
        policy,
        sources: compliant,
        imports: { 'src/shared/lib/http.ts': [{ spec: 'axios' }] },
      }),
    ),
    [],
    '按文件判：已经 import 首选方案的文件不再报（与内置能力同一语义）',
  )
})

test('P06：自定义平台能力没有 import 可查 → 命中即报（与内置平台能力同语义）', () => {
  const policy = depsPolicyFrom({
    capabilities: {
      storage: {
        preferred: 'localStorage',
        platform: true,
        syntax: ['\\.setItem\\('],
        hint: '用 shared/lib/storage.ts 的封装',
      },
    },
  })
  const findings = rule('P06').run(
    ctx({
      policy,
      sources: { 'src/shared/lib/storage.ts': "localStorage.setItem('key', 'value')\n" },
    }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].file, 'src/shared/lib/storage.ts')
})

test('P07：自定义能力的弱指纹 + 命名指纹同时成立才报', () => {
  const policy = depsPolicyFrom({
    capabilities: {
      'event-bus': {
        preferred: 'mitt',
        softSyntax: ['addEventListener\\('],
        apiNames: ['emit'],
        hint: '用 mitt：const bus = mitt(); bus.emit(type)',
      },
    },
  })
  const source = {
    'src/shared/lib/bus.ts':
      'export function emit(type) {\n  window.addEventListener(type, () => {})\n}\n',
  }
  const findings = rule('P07').run(
    ctx({
      policy,
      sources: source,
      exports: { 'src/shared/lib/bus.ts': [{ name: 'emit', line: 1 }] },
    }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rule, 'P07')
  assert.match(findings[0].text, /event-bus/)
})

test('冲突检测：自定义平台能力不算依赖；需要依赖的自定义能力仍要进 allow', () => {
  const platform = depsPolicyFrom({
    allow: ['commander'],
    capabilities: {
      storage: {
        preferred: 'localStorage',
        platform: true,
        syntax: ['\\.setItem\\('],
        hint: '用 shared/lib/storage.ts 的封装',
      },
    },
  })
  assert.deepEqual(policyConflicts(platform), [], '平台内置能力没有 import 可查 → 不要求进 allow')

  const dependency = depsPolicyFrom({
    allow: ['commander'],
    capabilities: { 'http-client': HTTP_CLIENT },
  })
  assert.match(policyConflicts(dependency)[0] ?? '', /不在 allow/)
})
