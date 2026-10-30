import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { run } from '../es/cli.js'
// 从**包入口**导入：消费方只有这一条路（`exports` 映射不暴露 ./engine/*）
import {
  NOTICE,
  NOTICE_CODES,
  REPORT_API_VERSION,
  SKIP,
  SKIP_CODES,
  isNoticeCode,
  isSkipCode,
} from '../es/index.js'

/**
 * **JSON 报告的对外契约**（DESIGN §6.9）。
 *
 * 这一组测试是**故意**写得这么死的：改任何一个顶层字段、增删一个 `notices[].code`，
 * 这里都会红 —— 红就是提醒你「这是契约变更，要动 `REPORT_API_VERSION` + CHANGELOG + §6.9」。
 *
 * 起因是一次真实反馈：0.3.x 一口气加了 `skipped` / `exceptions` / `skippedGlobals` /
 * `filteredBySeverity` / `notices` 五个字段，而**没有任何机制**让"字段变多了"与"字段没变"可区分 ——
 * 旧消费方照跑不误，只是悄悄少显示一类信息（`S13 没在跑`看不见、`--paths` 零匹配被当成通过）。
 * 只加一个版本号并不解决问题：**没人强制你 bump 的版本号只是装饰**（本仓刚在 `exempt` 上踩过"装饰性配置"）。
 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_URL = pathToFileURL(join(PACKAGE_ROOT, 'es/index.js')).href

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

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'ag-contract-'))
  mkdirSync(join(dir, 'src/app'), { recursive: true })
  mkdirSync(join(dir, 'src/shared/lib'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'contract', private: true, type: 'module' }),
  )
  writeFileSync(
    join(dir, 'arch.config.mjs'),
    `import { canonical } from '${INDEX_URL}'\nexport default { sourceForm: 'typescript', presets: [canonical()] }\n`,
  )
  writeFileSync(join(dir, 'src/app/main.tsx'), 'export const boot = 1\n')
  writeFileSync(join(dir, 'src/shared/lib/a.ts'), "export * from './b'\n")
  return dir
}

const report = async (dir, args = []) =>
  JSON.parse((await runCli([...args, '--format=json'], dir)).out)

test('冻结：JSON 顶层字段集（改这里 = 契约变更，要动 apiVersion + §6.9 + CHANGELOG）', async () => {
  const dir = makeProject()
  try {
    const json = await report(dir)
    assert.deepEqual(Object.keys(json).sort(), [
      'apiVersion',
      'contractScope',
      'durationMs',
      'errors',
      'exceptions',
      'filteredBySeverity',
      'findings',
      'globalFindings',
      'notices',
      'ok',
      'outsideContract',
      'paths',
      'rulesEnabled',
      'rulesTotal',
      'scope',
      'scopeFiles',
      'skipped',
      'skippedGlobals',
      'warnings',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('契约版本带着走，且消费方能拒绝不认识的版本', async () => {
  const dir = makeProject()
  try {
    const json = await report(dir)
    assert.equal(json.apiVersion, REPORT_API_VERSION)
    assert.equal(
      json.apiVersion,
      3,
      'v3 = 新增 `enable-all-expanded` notice code（破坏性变更，动它必须同时改这里 + §6.9 + CHANGELOG）',
    )
    assert.equal(typeof json.apiVersion, 'number')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('冻结：notices 的稳定 code 清单（文案不是契约，code 才是）', () => {
  assert.deepEqual([...NOTICE_CODES].sort(), [
    'adapters-in-use',
    'architecture-advice',
    'config-aliases',
    'config-no-manifest',
    'copy-list-source',
    'coverage-update-skipped',
    'coverage-updated',
    'declaration-no-match',
    'deps-allow-not-enabled',
    'enable-all-expanded',
    'facts-cache',
    'facts-cache-reset',
    'facts-cache-unavailable',
    'facts-cache-write-failed',
    'ignore-skipped',
    'legacy-baseline',
    'local-only-globals-skipped',
    'paths-globals-filtered',
    'paths-no-match',
    'read-failed',
    'rules-disabled',
    'scan-empty',
    'scan-scope-outside',
    'scope-changed-relocated',
    'scope-degraded-no-git',
    'severity-filtered',
    'source-form-missing',
    'staged-fallback',
    'vcs-ignored-skipped',
    'viewlines-no-page-role',
  ])
})

test('每条 notice 都是 { code, text }，且 code 在清单内', async () => {
  const dir = makeProject()
  try {
    const json = await report(dir)
    assert.ok(json.notices.length > 0, '正常项目也该有自述（扫描域 / 缓存…）')
    for (const notice of json.notices) {
      assert.deepEqual(Object.keys(notice).sort(), ['code', 'text'])
      assert.ok(NOTICE_CODES.includes(notice.code), `未知 code：${notice.code}`)
      assert.ok(notice.text.length > 0)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('机读 ⊇ 人读：人读摘要里的数字，机读侧一个都不许少', async () => {
  const dir = makeProject()
  try {
    const json = await report(dir)
    // 这几项以前只出现在人读的那一行里（`scope=full | 64 个文件 | … | 规则 17/56`）
    assert.ok(
      json.scopeFiles > 0,
      `本项目有源文件，scopeFiles 就不能是 0（0 会被消费方读成"一个文件都没判"，实测踩过）`,
    )
    assert.equal(typeof json.globalFindings, 'number')
    assert.equal(typeof json.rulesEnabled, 'number')
    assert.equal(typeof json.rulesTotal, 'number')
    assert.equal(typeof json.outsideContract, 'number')
    // 没加 --only/--domain 过滤时：跑起来的 + 因能力停用的 = 全部规则
    assert.equal(json.rulesEnabled + json.skipped.length, json.rulesTotal)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--paths 零匹配：退出码 2 + paths.matched=0 + code=paths-no-match（不再是"通过"）', async () => {
  const dir = makeProject()
  try {
    const missed = await runCli(['--paths=src/typo/**', '--format=json'], dir)
    const json = JSON.parse(missed.out)
    assert.equal(missed.code, 2, '请求无法满足 → 非零（CI 里打错路径不会静默变绿）')
    assert.equal(json.ok, false, '`ok` 必须与"请求被满足"一致，否则只读 stdout 的消费方会当成通过')
    assert.deepEqual(json.paths, { requested: ['src/typo/**'], matched: 0 })
    assert.ok(json.notices.some((notice) => notice.code === 'paths-no-match'))

    // `--report-only` 是显式的"只看不拦" → 仍然恒 0
    const advisory = await runCli(['--paths=src/typo/**', '--report-only', '--format=json'], dir)
    assert.equal(advisory.code, 0)

    // 匹配上时：给出命中数，且没有那条 code
    const hit = await report(dir, ['--paths=src/shared/lib/a.ts'])
    assert.deepEqual(hit.paths, { requested: ['src/shared/lib/a.ts'], matched: 1 })
    assert.equal(
      hit.notices.some((notice) => notice.code === 'paths-no-match'),
      false,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('没给 --paths 时 paths 是 null（"没问"与"问了没命中"必须可区分）', async () => {
  const dir = makeProject()
  try {
    assert.equal((await report(dir)).paths, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('冻结：skipped[].code 清单，且「没跑」的原因不是散文', async () => {
  // R-142 加了两种"没跑"：不在启用名单里、被本次过滤器收窄 —— 以前它们落在所有桶之外
  assert.deepEqual([...SKIP_CODES], ['capability-missing', 'not-enabled', 'filtered'])
  const dir = makeProject()
  try {
    const json = await report(dir)
    assert.ok(json.skipped.length > 0, 'canonical + 无适配器 → 必然有因能力未声明的停用')
    for (const entry of json.skipped) {
      // `recipe`（R-131）是**可选**字段：只有存在"可以直接粘进配置的那一行"时才出现 ——
      // 读 JSON 的编码 agent 靠它自服务，所以它进冻结清单是一次**有意识的契约决定**。
      const keys = Object.keys(entry).sort()
      assert.deepEqual(
        keys,
        keys.includes('recipe')
          ? ['code', 'missing', 'reason', 'recipe', 'rule']
          : ['code', 'missing', 'reason', 'rule'],
      )
      if ('recipe' in entry) assert.ok(entry.recipe.length > 0, 'recipe 不许是空串')
      assert.ok(SKIP_CODES.includes(entry.code), `未知 skip code：${entry.code}`)
      // `missing` **当且仅当** capability-missing 时非空（另两种没有"缺什么能力"可言）
      if (entry.code === 'capability-missing') assert.ok(entry.missing.length > 0)
      else assert.deepEqual(entry.missing, [], `${entry.code} 不该带 missing`)
      assert.ok(entry.reason.length > 0)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('R-142：账目闭合 —— 注册的规则 ∈ enabled ∪ skipped（含被过滤器收窄的那一次）', async () => {
  const dir = makeProject()
  try {
    const plain = await report(dir)
    assert.equal(plain.rulesEnabled + plain.skipped.length, plain.rulesTotal)

    // 收窄也要进账：`--only S01` 之后，其余规则以 `filtered` 出现在 skipped 里，而不是"消失"
    const narrowed = await report(dir, ['--only', 'S01'])
    assert.equal(narrowed.rulesEnabled, 1)
    assert.equal(
      narrowed.rulesEnabled + narrowed.skipped.length,
      narrowed.rulesTotal,
      '收窄掉的规则不许"消失"—— 它们是 filtered，不是不存在',
    )
    assert.equal(
      narrowed.skipped.filter((entry) => entry.code === 'filtered').length,
      narrowed.rulesTotal - 1,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('契约枚举的常量表是**派生**的（不是第二份清单），且守卫能挡住不认识的 code', () => {
  // 派生规则：kebab-case → SCREAMING_SNAKE
  assert.equal(NOTICE.PATHS_NO_MATCH, 'paths-no-match')
  assert.equal(NOTICE.SEVERITY_FILTERED, 'severity-filtered')
  assert.equal(NOTICE.FACTS_CACHE_RESET, 'facts-cache-reset')
  assert.equal(SKIP.CAPABILITY_MISSING, 'capability-missing')

  // 完备性：每个 code 恰好一个常量名，且没有多余的键（加 code 只改数组一处）
  const screaming = (code) => code.toUpperCase().replace(/-/g, '_')
  assert.deepEqual(Object.keys(NOTICE).sort(), [...NOTICE_CODES].map(screaming).sort())
  assert.deepEqual(Object.values(NOTICE).sort(), [...NOTICE_CODES].sort())
  assert.deepEqual(Object.keys(SKIP).sort(), [...SKIP_CODES].map(screaming).sort())

  // 守卫：消费方解析 JSON 时 fail-closed，而不是静默少处理一类
  assert.equal(isNoticeCode('paths-no-match'), true)
  assert.equal(isNoticeCode('paths-nomatch'), false, '拼错必须被挡住（JS 消费方没有类型系统）')
  assert.equal(isNoticeCode(undefined), false)
  assert.equal(isNoticeCode(42), false)
  assert.equal(isSkipCode('capability-missing'), true)
  assert.equal(isSkipCode('capability-gone'), false)
})

test('消费方用法：漏接一个 code 必须能被发现（TS 靠 Record 编译期，JS 靠 NOTICE_CODES 自查）', () => {
  // JS 消费方（没有类型系统）的自查写法 —— 用同一份清单，不抄第二份
  const handlers = { [NOTICE.PATHS_NO_MATCH]: () => 'x', [NOTICE.SCAN_EMPTY]: () => 'y' }
  const uncovered = NOTICE_CODES.filter((code) => !(code in handlers))
  assert.equal(uncovered.length, NOTICE_CODES.length - 2, '漏接的必须全被数出来')
  assert.ok(uncovered.includes('severity-filtered'))

  // 全接上时应当为空
  const full = Object.fromEntries(NOTICE_CODES.map((code) => [code, () => code]))
  assert.deepEqual(
    NOTICE_CODES.filter((code) => !(code in full)),
    [],
  )
})

test('ok 的语义：结论是否通过（≠ 要不要拦）；"什么都没判"一律不是通过', async () => {
  const dir = makeProject()
  const empty = mkdtempSync(join(tmpdir(), 'ag-empty-'))
  try {
    // ① 正常：有 error → false；无 error → true
    const json = await report(dir)
    assert.equal(json.ok, false, 'S11 违规 → 不是通过')

    // ② --paths 零匹配：退出码 2，ok 必须也是 false（否则只读 stdout 的消费方当成通过）
    const missed = JSON.parse((await runCli(['--paths=src/typo/**', '--format=json'], dir)).out)
    assert.equal(missed.ok, false)

    // ③ --report-only：有 error 也退 0，但 ok 仍是 false —— 两条通道故意不同
    const advisory = await runCli(['--report-only', '--format=json'], dir)
    assert.equal(advisory.code, 0, '--report-only 是显式的"只看不拦"')
    assert.equal(JSON.parse(advisory.out).ok, false, '但结论仍然不是"通过"')

    // ④ 全量下一个文件都没判 → 也不是通过。
    //    这里刻意用 `include: []`（不限扫描域）的空仓：include 非空时由 S24 报 error 兜住，
    //    只有"不限扫描域 + 0 个源码"这一格没有任何 error，正好单独验证 scopeFiles 那半句。
    writeFileSync(
      join(empty, 'package.json'),
      JSON.stringify({ name: 'empty', private: true, type: 'module' }),
    )
    writeFileSync(
      join(empty, 'arch.config.mjs'),
      `import { canonical } from '${INDEX_URL}'\n` +
        `export default { sourceForm: 'typescript', presets: [canonical()], overrides: { include: [] } }\n`,
    )
    const nothing = JSON.parse((await runCli(['--format=json'], empty)).out)
    assert.equal(nothing.errors, 0, '这一格没有任何 error —— `ok: false` 只能来自"什么都没判"')
    assert.equal(nothing.scopeFiles, 0)
    assert.equal(nothing.ok, false, '0 个文件被判定 → 不是通过（S24 的同一条道理）')
    assert.ok(nothing.notices.some((notice) => notice.code === 'scan-empty'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(empty, { recursive: true, force: true })
  }
})

test('R-133：`--brief` 下 JSON 的 notices 只给 `code`（`text` 不是契约，省下的是上下文）', async () => {
  const dir = makeProject()
  try {
    const full = await report(dir)
    assert.ok(full.notices.length > 0)
    assert.ok(
      full.notices.every((notice) => typeof notice.text === 'string'),
      '默认带文案',
    )
    const brief = JSON.parse((await runCli(['--format=json', '--brief'], dir)).out)
    assert.deepEqual(
      brief.notices.map((notice) => notice.code),
      full.notices.map((notice) => notice.code),
      'code 一个不少（契约不丢）',
    )
    assert.ok(
      brief.notices.every((notice) => notice.text === undefined),
      '文案省掉',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('R-134：机读格式的 stdout 只放机读内容（`--stats` 走 stderr，不许污染 JSON）', async () => {
  const dir = makeProject()
  try {
    // 以前 JSON 后面会追一张统计表 —— 任何解析器都炸（实测 `Extra data: line 65`）
    const plain = await runCli(['--format=json', '--stats'], dir)
    const parsed = JSON.parse(plain.out)
    assert.equal(typeof parsed.ok, 'boolean', 'stdout 是一个完整 JSON 文档')
    assert.ok(!plain.out.includes('合计'), '统计表不在 stdout 里')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
