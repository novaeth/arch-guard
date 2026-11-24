import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coreRules } from '../es/index.js'

const rule = coreRules.find((item) => item.id === 'H14')

/** H14 只读 config.structure.generated / records / facts / sourceOf，给最小上下文即可 */
function context({ records, facts = {}, generated = [], sourceOf = () => '' }) {
  return {
    config: { structure: { generated } },
    records,
    facts: new Map(Object.entries(facts)),
    sourceOf,
  }
}

const record = (rel, kind = 'ts') => ({ rel, kind })
const comments = [
  { line: 2, text: '// a', kind: 'line', pos: 0, end: 1 },
  { line: 5, text: '/* b */', kind: 'block', pos: 2, end: 3 },
]

test('H14 默认开启：没有能力门（hygiene() 引入即判；R-173）', () => {
  assert.equal(rule.requires, undefined)
})

test('H14 禁止注释：TS / JS 家族与 CSS 都判；无注释 / 生成物不报', () => {
  const findings = rule.run(
    context({
      records: [
        record('src/bad.ts'),
        record('src/legacy.js'),
        record('src/good.ts'),
        record('src/gen/x.ts'),
        record('src/style.css', 'css'),
      ],
      facts: {
        'src/bad.ts': { comments },
        'src/legacy.js': { comments: [comments[0]] },
        'src/gen/x.ts': { comments },
      },
      generated: ['src/gen/**'],
      sourceOf: (rel) => (rel === 'src/style.css' ? '/* 顶部 */\n.a { color: red }\n' : ''),
    }),
  )
  assert.deepEqual(
    findings.map((item) => item.file),
    ['src/bad.ts', 'src/legacy.js', 'src/style.css'],
  )
  assert.equal(findings[0]?.line, 2)
  assert.match(findings[0]?.text ?? '', /2 条注释/)
  assert.match(findings[1]?.text ?? '', /1 条注释/)
  assert.match(findings[2]?.text ?? '', /1 条注释/)
})
