import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { run } from '../es/cli.js'

/**
 * **渐进接入**（P0-5 / P0-6）：
 * - `overrides.severity`：逐规则降级（先看见、暂不拦），不必整条关规则；
 * - `overrides.enable: 'all'`：把预设没给的规则也打开 —— 副作用必须在报告里点名；
 * - `customRules`：项目层 `enable` 是整体替换，自定义规则**默认仍在跑**（不许被名单静默放下）；
 * - M08：测试 import 的是公开面 barrel 时，被再导出的实现算"间接有测试"。
 */

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_URL = pathToFileURL(join(PACKAGE_ROOT, 'es/index.js')).href

async function runCli(args, cwd) {
  const lines = []
  const originalLog = console.log
  const originalCwd = process.cwd()
  const originalError = console.error
  console.log = (line = '') => lines.push(String(line))
  console.error = (line = '') => lines.push(String(line))
  try {
    process.chdir(cwd)
    return { code: await run(args, {}), out: lines.join('\n') }
  } finally {
    process.chdir(originalCwd)
    console.log = originalLog
    console.error = originalError
  }
}

function makeDir() {
  return mkdtempSync(join(tmpdir(), 'ag-adoption-'))
}

function writeConfig(dir, body) {
  writeFileSync(join(dir, 'arch.config.mjs'), body)
}

function baseProject() {
  const dir = makeDir()
  mkdirSync(join(dir, 'src/shared/lib'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'ad', private: true, type: 'module' }),
  )
  // 非公开面 barrel：S11 的确定性违规（与 entries 无关，便于测严重度覆盖）
  writeFileSync(join(dir, 'src/shared/lib/bad.ts'), "export * from './inner'\n")
  writeFileSync(join(dir, 'src/shared/lib/inner.ts'), 'export const inner = 1\n')
  return dir
}

const json = (out) => JSON.parse(out)

test('overrides.severity：把某条规则降成 warn → 报告按 warn 计、退出码不红', async () => {
  const dir = baseProject()
  try {
    writeConfig(
      dir,
      `import { canonical } from '${INDEX_URL}'\nexport default { presets: [canonical()] }\n`,
    )
    const strict = await runCli(['--format=json'], dir)
    assert.equal(strict.code, 1, '默认 error：有违规就红')
    assert.ok(
      json(strict.out).findings.some((item) => item.rule === 'S11' && item.severity === 'error'),
    )

    writeConfig(
      dir,
      `import { canonical } from '${INDEX_URL}'\nexport default {
  presets: [canonical()],
  overrides: { severity: { S11: 'warn' } },
}\n`,
    )
    const relaxed = await runCli(['--format=json'], dir)
    assert.equal(relaxed.code, 0, '降成 warn 后不该让门禁红')
    const report = json(relaxed.out)
    assert.equal(report.errors, 0)
    assert.ok(report.findings.some((item) => item.rule === 'S11' && item.severity === 'warn'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('overrides.severity：拼错的规则 id / 非法值 → 配置期 fail-closed', async () => {
  for (const [body, pattern] of [
    [`{ severity: { S999: 'warn' } }`, /不存在的规则/],
    [`{ severity: { S11: 'fatal' } }`, /必须是 'error' 或 'warn'/],
  ]) {
    const dir = baseProject()
    try {
      writeConfig(
        dir,
        `import { canonical } from '${INDEX_URL}'\nexport default { presets: [canonical()], overrides: ${body} }\n`,
      )
      const result = await runCli([], dir)
      assert.equal(result.code, 2, '配置错误必须退出 2')
      assert.match(result.out, pattern)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('overrides.enable: "all"：副作用点名（预设没给的规则也被打开）', async () => {
  const dir = baseProject()
  try {
    writeFileSync(join(dir, 'src/index.ts'), 'export const entry = 1\n')
    writeConfig(
      dir,
      `import { library } from '${INDEX_URL}'\nexport default {
  presets: [library({ src: 'src', entry: ['index.ts'] })],
  overrides: { enable: 'all' },
}\n`,
    )
    const result = await runCli(['--format=json'], dir)
    const notice = json(result.out).notices.find((item) => item.code === 'enable-all-expanded')
    assert.ok(notice, "enable:'all' 必须自述它额外打开了哪些规则")
    assert.match(notice.text, /\d+ 条预设没给的规则/)

    writeConfig(
      dir,
      `import { library } from '${INDEX_URL}'\nexport default {
  presets: [library({ src: 'src', entry: ['index.ts'] })],
  overrides: { enable: ['S01'] },
}\n`,
    )
    const narrow = await runCli(['--format=json'], dir)
    assert.equal(
      json(narrow.out).notices.some((item) => item.code === 'enable-all-expanded'),
      false,
      '没写 all 就不该有这条自述',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('customRules：项目层 enable 名单漏写自定义规则也照跑（不许静默放下）', async () => {
  const dir = baseProject()
  try {
    writeConfig(
      dir,
      `import { canonical, createRule } from '${INDEX_URL}'
export default {
  presets: [canonical()],
  overrides: {
    enable: ['S01'],
    customRules: [
      createRule({
        id: 'S99',
        domain: 'structure',
        level: 'L2',
        severity: 'error',
        title: '自定义规则',
        hint: '夹具',
        run: () => [],
      }),
    ],
  },
}\n`,
    )
    const result = await runCli(['--format=json'], dir)
    const report = json(result.out)
    assert.ok(
      !report.notices.some((item) => item.code === 'rules-disabled' && /S99/.test(item.text ?? '')),
      '自定义规则不该被 enable 名单静默放下',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('M08：测试 import 公开面 barrel → 被再导出的实现算"间接有测试"', async () => {
  const dir = makeDir()
  mkdirSync(join(dir, 'src/shared/lib'), { recursive: true })
  mkdirSync(join(dir, 'tests'), { recursive: true })
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'm08', private: true, type: 'module' }),
    )
    mkdirSync(join(dir, 'src/shared/api'), { recursive: true })
    writeFileSync(join(dir, 'src/shared/api/http.ts'), 'export const http = 1\n')
    writeFileSync(join(dir, 'src/shared/api/index.ts'), "export * from './http'\n")
    writeFileSync(
      join(dir, 'tests/shared.test.ts'),
      "import { http } from '../src/shared/api'\nexport const use = http\n",
    )
    writeConfig(
      dir,
      `import { canonical, metrics } from '${INDEX_URL}'
export default {
  presets: [canonical(), metrics({ tests: { requireTestsFor: ['src/shared/api/http.ts'] } })],
  overrides: { enable: ['M08'] },
}\n`,
    )
    const viaBarrel = await runCli(['--format=json'], dir)
    assert.equal(
      json(viaBarrel.out).findings.some((item) => item.rule === 'M08'),
      false,
      '测试只 import 公开面 barrel 时，被再导出的 http.ts 不该被 M08 报红',
    )

    // 拿掉 barrel 的再导出：测试不再能到 a.ts —— M08 必须报（"间接"只穿再导出文件）
    writeFileSync(join(dir, 'src/shared/api/index.ts'), 'export const unrelated = 1\n')
    const direct = await runCli(['--format=json'], dir)
    assert.ok(
      json(direct.out).findings.some(
        (item) => item.rule === 'M08' && item.file === 'src/shared/api/http.ts',
      ),
      '没有 barrel 再导出时，没有测试到 http.ts 必须报',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
