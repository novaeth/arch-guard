import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coreRules } from '../es/index.js'

/**
 * S11：**声明过的 barrel** 放行（公开面入口 / 生成物），没声明的照报。
 *
 * 判据本体由夹具覆盖（`__fixtures__/generated-marker` 同时含生成物 `export *`、
 * 公开面入口 `src/modules/crews/index.ts` 的 `export *`）；这里用合成事实钉边界：
 * "放行"只认声明，不认文件名。
 */

const rule = coreRules.find((entry) => entry.id === 'S11')
assert.ok(rule, 'S11 不存在')

const STAR = (line) => ({
  name: '*',
  kind: 're-export',
  isStar: true,
  isDefault: false,
  typeOnly: false,
  line,
})

const context = ({ records, structure = {} }) => ({
  config: { structure },
  records,
  facts: new Map(records.map((record) => [record.rel, { exports: [STAR(1)] }])),
})

test('S11：公开面入口 / 生成物里的 export * 不报；没声明的 barrel 照报', () => {
  const plain = { rel: 'src/shared/lib/helpers.ts', kind: 'ts' }
  const findings = rule.run(
    context({
      records: [
        // 公开面入口：角色 entry: true（库范式是 slot: 'entry'）
        { rel: 'src/modules/crews/index.ts', kind: 'ts', entry: true },
        // 生成物：structure.generated 命中
        { rel: 'src/shared/api/generated/client.ts', kind: 'ts' },
        // 没声明：照报
        plain,
      ],
      structure: { generated: ['src/shared/api/generated/**'] },
    }),
  )
  assert.deepEqual(
    findings.map((finding) => finding.file),
    ['src/shared/lib/helpers.ts'],
    '只报没声明的那一个',
  )
})

test('S11：structure.generated 只在声明时放行（不猜文件名）', () => {
  const findings = rule.run(
    context({
      records: [{ rel: 'src/shared/api/generated/client.ts', kind: 'ts' }],
      // 没有 structure.generated：generated 目录里的 barrel 照报
      structure: {},
    }),
  )
  assert.deepEqual(
    findings.map((finding) => finding.file),
    ['src/shared/api/generated/client.ts'],
  )
})
