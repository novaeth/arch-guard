import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { run } from '../es/cli.js'

/**
 * **规则级例外**（`exceptions: [{ rule, glob, reason, expires? }]`）—— 唯一的宽松通道。
 *
 * 它替代了原来的文件级 `exempt`，区别是决定性的：
 *   文件级豁免 = 文件不进角色表、不解析、**所有规则一起停看**（为了一条规则把整个文件免检）；
 *   规则级例外 = **只摘掉「指名的那条规则 × 那些文件」的发现项**，文件照常有角色、进图、被其它规则判定。
 *
 * 这一组同时钉住"例外不能变成隐形门禁关闭"的三件事：必须指名规则、必须写理由、过期即红。
 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_URL = pathToFileURL(join(PACKAGE_ROOT, 'es/index.js')).href

async function runCli(args, cwd) {
  const lines = []
  const errors = []
  const originalLog = console.log
  const originalError = console.error
  const originalCwd = process.cwd()
  console.log = (line = '') => lines.push(String(line))
  console.error = (line = '') => errors.push(String(line))
  try {
    process.chdir(cwd)
    const code = await run(args, {})
    return { code, out: lines.join('\n'), err: errors.join('\n') }
  } finally {
    process.chdir(originalCwd)
    console.log = originalLog
    console.error = originalError
  }
}

/** 宿主：a.ts 同时有 S11（barrel）与 S15（孤儿）两条发现项，用来验证"只摘一条" */
function makeProject(exception) {
  const dir = mkdtempSync(join(tmpdir(), 'ag-exc-'))
  mkdirSync(join(dir, 'src/app'), { recursive: true })
  mkdirSync(join(dir, 'src/shared/lib'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'exc', private: true, type: 'module' }),
  )
  const overrides = exception ? `, overrides: { exceptions: [${JSON.stringify(exception)}] }` : ''
  writeFileSync(
    join(dir, 'arch.config.mjs'),
    `import { canonical } from '${INDEX_URL}'\nexport default { sourceForm: 'typescript', presets: [canonical()]${overrides} }\n`,
  )
  writeFileSync(join(dir, 'src/app/main.tsx'), 'export const boot = 1\n')
  writeFileSync(join(dir, 'src/shared/lib/a.ts'), "export * from './b'\n")
  return dir
}

test('规则级例外只摘掉指名的那条规则 —— 文件本身照常被其它规则判定', async () => {
  const dir = makeProject({
    rule: 'S11',
    glob: 'src/shared/lib/a.ts',
    reason: '这个 barrel 是对外兼容层的刻意聚合',
  })
  try {
    const result = await runCli([], dir)
    assert.equal(/\[S11\]/.test(result.out), false, 'S11 被摘掉')
    assert.match(result.out, /\[S15\]/, 'S15（孤儿）照报 —— 证明文件没有被整文件免检')
    assert.match(result.out, /· S11 × src\/shared\/lib\/a\.ts —— 命中 1 处/, '例外命中要点名')
    assert.match(result.out, /理由：这个 barrel/)
    assert.equal(result.code, 1, '还有别的 error → 仍然红')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('例外 0 命中即红（声明必须有消费者）', async () => {
  const dir = makeProject({
    rule: 'S16',
    glob: 'src/shared/lib/a.ts',
    reason: '曾经想给这个文件放宽体积',
  })
  try {
    const result = await runCli([], dir)
    assert.equal(result.code, 2)
    assert.match(result.out + result.err, /exceptions 有 1 条 0 命中（声明必须有消费者）/)
    assert.match(result.out + result.err, /S16 × src\/shared\/lib\/a\.ts/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('例外必须指名**真实存在**的规则：拼错等于没写 → fail-closed', async () => {
  const dir = makeProject({ rule: 'S99', glob: 'src/shared/lib/a.ts', reason: '拼错的规则 id' })
  try {
    const result = await runCli([], dir)
    assert.equal(result.code, 2)
    assert.match(result.out + result.err, /exceptions 引用了不存在的规则：S99/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('例外过期即红：逼你续期或删掉，而不是让它永久躺在配置里', async () => {
  const dir = makeProject({
    rule: 'S11',
    glob: 'src/shared/lib/a.ts',
    reason: '临时放宽',
    expires: '2000-01-01',
  })
  try {
    const result = await runCli([], dir)
    assert.equal(result.code, 2)
    assert.match(result.out + result.err, /exceptions 已过期：S11 × src\/shared\/lib\/a\.ts/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('例外必须写清 rule / glob / reason：缺一样就在配置加载期报错', async () => {
  const cases = [
    [{ glob: 'src/shared/lib/a.ts', reason: '缺 rule' }, /rule \/ glob \/ reason/],
    [{ rule: 'S11', reason: '缺 glob' }, /rule \/ glob \/ reason/],
    [{ rule: 'S11', glob: 'src/shared/lib/a.ts', reason: '   ' }, /rule \/ glob \/ reason/],
    [
      { rule: 'S11', glob: 'src/shared/lib/a.ts', reason: '日期格式错', expires: '2026/12/31' },
      /expires 必须是 YYYY-MM-DD/,
    ],
  ]
  for (const [exception, pattern] of cases) {
    const dir = makeProject(exception)
    try {
      const result = await runCli([], dir)
      assert.equal(result.code, 2, JSON.stringify(exception))
      assert.match(result.out + result.err, pattern)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
