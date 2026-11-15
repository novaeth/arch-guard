import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coreRules, deps } from '../es/index.js'
import { applyFingerprintOverrides } from '../es/engine/deps.js'
import { wheelFingerprints } from '../es/data/wheel-fingerprints.js'

/**
 * R-73：指纹表可被项目覆盖。
 * - `applyFingerprintOverrides`：加 / 删 pattern、改 API 名、放宽 allowOwn —— 纯函数、不动内置表
 * - `deps({ fingerprints })`：能力名拼错、正则写不合法 → 配置阶段就报错
 * - P06 / P07：判定跟着**生效表**走（不是内置表）
 */

const rule = (id) => {
  const found = coreRules.find((entry) => entry.id === id)
  assert.ok(found, `规则 ${id} 不存在`)
  return found
}

const base = () => wheelFingerprints.find((entry) => entry.capability === 'deep-clone')

const ctx = ({ capabilities = {}, fingerprints = [], sources = {}, exports = {} }) => {
  const relations = Object.keys(sources)
  return {
    config: { structure: {} },
    records: relations.map((rel) => ({ rel, kind: 'ts', layer: 3, captures: {} })),
    facts: new Map(
      relations.map((rel) => [rel, { comments: [], exports: exports[rel] ?? [], functions: [] }]),
    ),
    sourceOf: (rel) => sources[rel],
    policy: { allow: [], deny: [], capabilities, fingerprints },
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

test('覆盖：删 pattern 按原文精确匹配，加 pattern 追加在后面，内置表不被改动', () => {
  const syntax = base().syntax ?? []
  const overridden = applyFingerprintOverrides(wheelFingerprints, [
    { capability: 'deep-clone', removeSyntax: [syntax[0]], addSyntax: ['myClone\\('] },
  ])
  const entry = overridden.find((item) => item.capability === 'deep-clone')
  assert.equal(entry.syntax.includes(syntax[0]), false, '删掉的 pattern 不该还在')
  assert.equal(entry.syntax.includes('myClone\\('), true, '追加的 pattern 要在')
  assert.equal(entry.syntax.length, syntax.length, '加一个删一个 → 总数不变')
  assert.deepEqual(base().syntax, syntax, '内置表必须原样不动（同进程里还有别的宿主）')
})

test('覆盖：apiNames / allowOwn / platform / hint 都能改，没声明的能力原样返回', () => {
  const overridden = applyFingerprintOverrides(wheelFingerprints, [
    {
      capability: 'debounce-throttle',
      apiNames: ['myDebounce'],
      allowOwn: false,
      platform: true,
      hint: '项目自己的写法',
    },
  ])
  const entry = overridden.find((item) => item.capability === 'debounce-throttle')
  assert.deepEqual(entry.apiNames, ['myDebounce'])
  assert.equal(entry.allowOwn, false)
  assert.equal(entry.platform, true)
  assert.equal(entry.hint, '项目自己的写法')
  const untouched = overridden.find((item) => item.capability === 'datetime')
  assert.deepEqual(
    untouched,
    wheelFingerprints.find((item) => item.capability === 'datetime'),
  )
  assert.deepEqual(
    applyFingerprintOverrides(wheelFingerprints, []).length,
    wheelFingerprints.length,
  )
})

test('配置校验：能力名拼错 / 正则不合法 / 覆盖了没有弱指纹的能力，都在 deps() 里拦下', () => {
  assert.throws(() => deps({ fingerprints: [{ capability: 'nope' }] }), /不存在的能力/)
  assert.throws(
    () => deps({ fingerprints: [{ capability: 'datetime', addSyntax: ['('] }] }),
    /不是合法正则/,
  )
  const ok = deps({
    fingerprints: [{ capability: 'datetime', removeSyntax: ['\\.toLocaleString\\('] }],
  })
  assert.deepEqual(ok.params.fingerprints, [
    { capability: 'datetime', removeSyntax: ['\\.toLocaleString\\('] },
  ])
})

test('P06：判定跟着生效表走 —— 内置表下 JSON 深拷贝要报', () => {
  const sources = {
    'src/shared/lib/clone.ts': 'export const clone = (v) => JSON.parse(JSON.stringify(v))\n',
  }
  const findings = rule('P06').run(
    ctx({ capabilities: { 'deep-clone': 'structuredClone' }, sources }),
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].file, 'src/shared/lib/clone.ts')
})

test('R-167：P06 只扫 ts —— CSS/SCSS 注释里的示例不算代码', () => {
  const rel = 'src/shared/styles/comment.scss'
  const sources = { [rel]: '// JSON.parse(JSON.stringify(v))\n' }
  const base = ctx({ capabilities: { 'deep-clone': 'structuredClone' }, sources })
  base.records = [{ rel, kind: 'css', layer: 3, captures: {} }]
  assert.deepEqual(rule('P06').run(base), [], 'css 记录不参与指纹扫描')
})

test('P06 / P07：真实覆盖对象生效（P06 删形态 → 不报；P07 加弱指纹 + API 名 → 报）', () => {
  const capabilities = { 'deep-clone': 'structuredClone', 'debounce-throttle': 'lodash' }
  const sources = {
    'src/shared/lib/clone.ts':
      'export const clone = (value) => JSON.parse(JSON.stringify(value))\n',
  }
  const fingerprints = [
    { capability: 'deep-clone', removeSyntax: ['JSON\\.parse\\(\\s*JSON\\.stringify\\('] },
  ]
  assert.deepEqual(
    rule('P06').run(ctx({ capabilities, sources, fingerprints })),
    [],
    '删掉形态后不报',
  )

  // P07：给 debounce-throttle 加一条项目自己的弱指纹 + API 名 → 两证据齐了才报
  const custom = {
    'src/shared/lib/timing.ts': 'export function myDelay(fn) {\n  return setTimeout(fn, 100)\n}\n',
  }
  assert.deepEqual(
    rule('P07')
      .run(ctx({ capabilities, sources: custom }))
      .map((item) => item.rule),
    [],
    '默认表里 myDelay 不是命名指纹 → 不报',
  )
  assert.deepEqual(
    rule('P07')
      .run(
        ctx({
          capabilities,
          sources: custom,
          // 命名指纹来自事实模型的 exports / functions（真实解析里由 parser 填）
          exports: { 'src/shared/lib/timing.ts': [{ name: 'myDelay', line: 1 }] },
          fingerprints: [
            {
              capability: 'debounce-throttle',
              addSoftSyntax: ['setTimeout\\('],
              apiNames: ['myDelay'],
            },
          ],
        }),
      )
      .map((item) => item.rule),
    ['P07'],
    '覆盖后两证据齐 → 报',
  )
})
