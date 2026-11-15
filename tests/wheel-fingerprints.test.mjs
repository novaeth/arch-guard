import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { run } from '../es/cli.js'
import { wheelFingerprints } from '../es/data/wheel-fingerprints.js'

/**
 * 手工轮子指纹表（`src/data/wheel-fingerprints.ts`）——**数据也要被审计**。
 *
 * 这一组来自一次深度审计，一次抓出三类问题（都是一句话能说清、但没人验过的东西）：
 *   ① **平台能力的豁免条件写反**：`if (entry.platform === true) return true` → 命中即 `continue`，
 *      于是 deep-clone / unique-id / number-format / deep-equal / query-string **五个能力从来没报过**。
 *      能活下来是因为**没有任何夹具覆盖它们**（`datetime` 夹具只覆盖 datetime，`deps` 只覆盖 cli-args）。
 *   ② **`allowOwn` 没生效**：数据表说"只提示不报错"，实现只往 hint 追加一句话，finding 仍是 error。
 *   ③ **名册式枚举**：`getDay` / `argv[2]` / 宽松 `==` / `toString(16)` 这类同族写法全漏在外面。
 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(PACKAGE_ROOT, '__fixtures__/wheels')

async function runCli(args, cwd) {
  const lines = []
  const originalLog = console.log
  const originalCwd = process.cwd()
  console.log = (line = '') => lines.push(String(line))
  try {
    process.chdir(cwd)
    return { code: await run(args, {}), out: lines.join('\n') }
  } finally {
    process.chdir(originalCwd)
    console.log = originalLog
  }
}

const report = async () => JSON.parse((await runCli(['--format=json'], FIXTURE)).out)

test('数据表自检：每个能力都真的能开火，且命名指纹必须与弱指纹成对', () => {
  for (const entry of wheelFingerprints) {
    const strong = entry.syntax ?? []
    const soft = entry.softSyntax ?? []
    const apiNames = entry.apiNames ?? []
    assert.ok(
      strong.length > 0 || (soft.length > 0 && apiNames.length > 0),
      `${entry.capability} 既没有强指纹、也没有"弱指纹 + 命名指纹" → 这条能力永远不会开火（死声明）`,
    )
    assert.ok(
      apiNames.length === 0 || soft.length > 0,
      `${entry.capability} 写了 apiNames 却没有 softSyntax → P07 需要"弱指纹 且 自研同名"，命名指纹永远读不到`,
    )
    assert.ok(entry.hint.length > 0, `${entry.capability} 缺 hint：报错必须告诉人怎么改`)
  }
})

test('平台能力命中即报（此前五个平台能力全部静默失效）', async () => {
  const json = await report()
  const files = json.findings.map((finding) => finding.file)
  for (const file of [
    'src/shared/lib/clone-json.ts', // deep-clone
    'src/shared/lib/unique-id.ts', // unique-id
    'src/shared/lib/number-format.ts', // number-format
    'src/shared/lib/deep-equal.ts', // deep-equal（宽松 `==`）
    'src/shared/lib/query-string.ts', // query-string
  ]) {
    assert.ok(files.includes(file), `${file} 应当被报（平台能力没有 import 可查 → 命中即报）`)
  }
})

test('allowOwn 的能力真的降级为 warn（不是只改 hint）', async () => {
  const json = await report()
  const byFile = new Map(json.findings.map((finding) => [finding.file, finding]))
  assert.equal(
    byFile.get('src/shared/lib/query-string.ts')?.severity,
    'warn',
    'query-string 在能力表里标了 allowOwn → 机读侧必须能看到 warn（而不是 error）',
  )
  assert.equal(
    byFile.get('src/shared/lib/clone-json.ts')?.severity,
    'error',
    '平台能力的命中仍是 error',
  )
  // counts 也走同一个判据（severityOf 是唯一读取点）
  assert.equal(json.errors, 11)
  assert.equal(json.warnings, 6)
})

test('合规写法零命中：structuredClone / crypto.randomUUID / Intl / isDeepStrictEqual / URLSearchParams', async () => {
  const json = await report()
  assert.equal(
    json.findings.some((finding) => finding.file === 'src/shared/lib/compliant.ts'),
    false,
    '用了平台内置的写法不该被点名',
  )
})

test('覆盖缺口：argv 索引取值 / 宽松 `==` / 自研递归克隆都要抓得到', async () => {
  const json = await report()
  const byFile = new Map(json.findings.map((finding) => [finding.file, finding]))
  // `process.argv[2]`（旧模式只认 argv.slice/indexOf/…）
  assert.ok(byFile.has('src/shared/lib/argv.ts'))
  // `JSON.stringify(a) == JSON.stringify(b)`（旧模式只认 `===`）
  assert.equal(byFile.get('src/shared/lib/deep-equal.ts')?.rule, 'P06')
  // 自研递归克隆（不走 JSON 技巧 → 只有 P07 抓得到）
  assert.equal(byFile.get('src/shared/lib/clone-recursive.ts')?.rule, 'P07')
})

test('R-165：跨行写法照抓；平台同行首选 / 数字千分位 / 打码 / dayjs 封装都不报', async () => {
  const json = await report()
  const files = new Set(json.findings.map((finding) => finding.file))

  // ① 跨行：`JSON.parse(\n JSON.stringify(…)` 与 `new Date(\n '…'`
  assert.ok(files.has('src/shared/lib/multiline.ts'), '跨行深拷贝必须报')
  assert.ok(files.has('src/shared/lib/multiline-date.ts'), '跨行日期解析必须报')

  // ② 四种同形合法写法：一条都不该报
  for (const file of [
    'src/shared/lib/locale-number.ts', // amount.toLocaleString() 是数字千分位
    'src/shared/lib/phone-mask.ts', // replace(/(\d{3})…/) 是打码，不是千分位
    'src/shared/lib/query-preferred.ts', // '?' + new URLSearchParams(…) 是推荐写法
    'src/shared/lib/date-wrapper.ts', // import dayjs 的统一封装
  ]) {
    assert.equal(files.has(file), false, `${file} 不该被报（R-165 的误伤边界）`)
  }

  // ③ 新增的 word-forms：手抄不规则复数表报，import pluralize 的不报
  assert.ok(files.has('src/shared/lib/word-forms.ts'))
  assert.equal(files.has('src/shared/lib/word-forms-compliant.ts'), false)
})

test('R-166：emoji 不影响注释遮罩；type-only import 不豁免；未声明能力不跑 P07', async () => {
  const json = await report()
  const files = new Set(json.findings.map((finding) => finding.file))

  // emoji 在注释里：遮罩按 UTF-16 写，下一行的 JSON 深拷贝必须照报（此前会变成 SON.parse 漏掉）
  assert.ok(files.has('src/shared/lib/emoji-spill.ts'), 'emoji 之后的代码不能被吃掉')
  // emoji 在注释之前：注释内容不能被露出来（此前会误报 P06）
  assert.equal(files.has('src/shared/lib/emoji-comment.ts'), false)

  // `import type { Dayjs }` 不算在用 dayjs → 手搓日期格式化照报
  assert.ok(files.has('src/shared/lib/type-only-dayjs.ts'), 'type-only import 不能豁免 P06')

  // debounce-throttle 没在 capabilities 里声明：P07 不该提示（与 P06 同口径）
  assert.equal(files.has('src/shared/lib/undeclared-wheel.ts'), false)
})

test('R-167：数据精度（四种误伤不报）与覆盖补完（五处漏判必报）', async () => {
  const json = await report()
  const files = new Set(json.findings.map((finding) => finding.file))

  // 误伤：HTTP 头 / 格式常量 / 随机颜色 / 业务字典 / JSON-safe 快照
  for (const file of [
    'src/shared/lib/datetime-tokens.ts',
    'src/shared/lib/random-color.ts',
    'src/shared/lib/word-forms-dict.ts',
    'src/shared/lib/clone-for-storage.ts',
  ]) {
    assert.equal(files.has(file), false, `${file} 不该被报（R-167 的误伤边界）`)
  }

  // 覆盖：argv.at / for...of、嵌套括号、递归 clone 的 Object.keys、isMail 命名
  for (const file of [
    'src/shared/lib/argv-at.ts',
    'src/shared/lib/nested-parens.ts',
    'src/shared/lib/clone-recursive-keys.ts',
    'src/shared/lib/validate-is-mail.ts',
  ]) {
    assert.ok(files.has(file), `${file} 应当被报（R-167 的覆盖补完）`)
  }

  // word-forms 去掉强指纹后由 P07 报（弱形态 + 自研同名）
  const wordForms = json.findings.find((finding) =>
    finding.file.endsWith('src/shared/lib/word-forms.ts'),
  )
  assert.equal(wordForms?.rule, 'P07', 'word-forms 不应再由 P06 error 报')
})
