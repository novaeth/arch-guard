import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { builtinSourceForms, coreRules, runGuard } from '../es/index.js'

/**
 * 规则级 `appliesTo`：**测试脚手架不是产品代码纪律的对象**。
 *
 * 判据本体由夹具覆盖（`__fixtures__/rules` 里 60 行的 `__tests__/big.test.ts`、
 * `__fixtures__/deps` 里读 `process.argv` 的 `__tests__/argv-helper.ts`）；这里钉两件事：
 * ① 这两条规则确实声明了 `appliesTo: 'product'`（别在后续重构里把声明丢掉）；
 * ② 引擎真的跳过测试脚手架，而同一条规则在产品代码上的判定**不受影响**。
 */

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ruleOf = (id) => {
  const rule = coreRules.find((entry) => entry.id === id)
  assert.ok(rule, `规则 ${id} 不存在`)
  return rule
}

test('appliesTo：S16 / P06 声明为 product，且测试脚手架不再产生发现项', async () => {
  assert.equal(ruleOf('S16').appliesTo, 'product')
  assert.equal(ruleOf('P06').appliesTo, 'product')

  const rulesFixture = await runGuard({
    cwd: join(PACKAGE_ROOT, '__fixtures__/rules'),
    ruleSet: coreRules,
    sourceForms: builtinSourceForms,
    quiet: true,
  })
  assert.equal(
    rulesFixture.all.some(
      (finding) => finding.rule === 'S16' && finding.file.includes('__tests__'),
    ),
    false,
    '测试脚手架超过体积阈值不该报 S16',
  )
  assert.ok(
    rulesFixture.all.some((finding) => finding.rule === 'S16' && finding.file.endsWith('big.ts')),
    '产品代码超过体积阈值仍然要报',
  )

  const depsFixture = await runGuard({
    cwd: join(PACKAGE_ROOT, '__fixtures__/deps'),
    ruleSet: coreRules,
    sourceForms: builtinSourceForms,
    quiet: true,
  })
  assert.equal(
    depsFixture.all.some((finding) => finding.rule === 'P06' && finding.file.includes('__tests__')),
    false,
    '测试夹具里的 argv 指纹不该报 P06',
  )
  assert.ok(
    depsFixture.all.some((finding) => finding.rule === 'P06'),
    '产品代码里的手搓 argv 仍然要报 P06',
  )
})
