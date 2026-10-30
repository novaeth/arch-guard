import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createProgram, run } from '../es/cli.js'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_URL = pathToFileURL(join(PACKAGE_ROOT, 'es/index.js')).href

/**
 * 同进程跑 CLI：spawn 子进程的执行不会被父进程的覆盖率统计合并，
 * 而同进程调用还更快。cwd 会被临时切换（同一进程内测试是串行的）。
 */
async function runCli(args, { cwd, packageRoot } = {}) {
  const lines = []
  const errors = []
  const originalLog = console.log
  const originalError = console.error
  const originalCwd = process.cwd()
  console.log = (line = '') => lines.push(String(line))
  console.error = (line = '') => errors.push(String(line))
  try {
    if (cwd) process.chdir(cwd)
    const code = await run(args, packageRoot ? { packageRoot } : {})
    return { code, out: lines.join('\n'), err: errors.join('\n') }
  } finally {
    process.chdir(originalCwd)
    console.log = originalLog
    console.error = originalError
  }
}

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'ag-cli-'))
  mkdirSync(join(dir, 'src/shared/lib'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'cli', private: true, type: 'module' }),
  )
  writeFileSync(
    join(dir, 'arch.config.mjs'),
    `import { canonical } from '${INDEX_URL}'\nexport default { presets: [canonical()] }\n`,
  )
  // 违规要**与入口无关**：S11（非公开面 barrel）不依赖可达性根集，
  // 否则 `entries` 0 命中时"根集为空不判孤儿"会让这个夹具静默变绿。
  writeFileSync(join(dir, 'src/shared/lib/bad.ts'), "export * from './inner'\n")
  writeFileSync(join(dir, 'src/shared/lib/inner.ts'), 'export const inner = 1\n')
  return dir
}

test('cli：--verify-deps 不一致/一致两种结论', async () => {
  const inconsistent = await runCli(['--verify-deps'], {
    cwd: join(PACKAGE_ROOT, '__fixtures__/adapters'),
  })
  assert.equal(inconsistent.code, 1)
  assert.match(inconsistent.out, /适配表 vs 实际依赖/)
  assert.match(inconsistent.out, /✖ 对账失败/)

  const dir = mkdtempSync(join(tmpdir(), 'ag-vd-'))
  try {
    mkdirSync(join(dir, 'src/app'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'ok',
        private: true,
        type: 'module',
        dependencies: { antd: '^6.0.0', '@ant-design/icons': '^6.0.0', '@ant-design/x': '^2.0.0' },
      }),
    )
    writeFileSync(join(dir, 'src/app/main.tsx'), 'export const x = 1\n')
    writeFileSync(
      join(dir, 'arch.config.mjs'),
      `import { canonical, uiKit, antdKit } from '${INDEX_URL}'\nexport default { presets: [canonical(), uiKit(antdKit())] }\n`,
    )
    const ok = await runCli(['--verify-deps'], { cwd: dir })
    assert.equal(ok.code, 0, ok.out)
    assert.match(ok.out, /✔ 对账通过/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cli：--format=github 出注解、--stats 出统计表、过滤开关都能用', async () => {
  const fixture = join(PACKAGE_ROOT, '__fixtures__/violations')
  const github = await runCli(['--format=github'], { cwd: fixture })
  assert.equal(github.code, 1)
  assert.match(
    github.out,
    /::error file=src\/modules\/crews\/views\/Bad\.tsx,line=\d+,title=S\d\d /,
  )

  const stats = await runCli(['--stats'], { cwd: fixture })
  assert.match(stats.out, /合计 \d+\.\d+ms \/ \d+ 条规则/)
  assert.match(stats.out, /S12\s+structure/)

  const byDomain = await runCli(['--domain=H', '--format=json'], { cwd: fixture })
  const payload = JSON.parse(byDomain.out)
  assert.ok(payload.findings.every((finding) => finding.rule.startsWith('H')))

  const byOnly = await runCli(['--only=S12,S13', '--format=json'], { cwd: fixture })
  assert.deepEqual(
    [...new Set(JSON.parse(byOnly.out).findings.map((finding) => finding.rule))].sort(),
    ['S12', 'S13'],
  )

  const reportOnly = await runCli(['--report-only', '--format=json'], { cwd: fixture })
  assert.equal(reportOnly.code, 0)
  assert.ok(JSON.parse(reportOnly.out).errors > 0)

  const filtered = await runCli(['--paths=src/没有这个目录/**', '--format=json'], { cwd: fixture })
  assert.equal(JSON.parse(filtered.out).findings.length, 0)
})

test('cli：错误参数一律退出 2 并给出可用值', async () => {
  const fixture = join(PACKAGE_ROOT, '__fixtures__/violations')
  for (const args of [
    ['--domain=Z'],
    ['--min-level=L9'],
    ['--severity=fatal'],
    ['--format=xml'],
    ['--config=不存在的配置.mjs'],
    ['--verify-deps', '--config=没有这个配置.mjs'],
  ]) {
    const result = await runCli(args, { cwd: fixture })
    assert.equal(result.code, 2, `${args.join(' ')} 应退出 2，实际 ${result.code}`)
    assert.match(result.out + result.err, /未知|找不到/)
  }
})

test('cli：基线机制已移除 —— --update-baseline 不存在，存量违规没有豁免通道', async () => {
  const dir = makeProject()
  try {
    // 开关本身不该再存在（这正是"必须符合规范"的核心：没有一键洗白）
    const gone = await runCli(['--update-baseline'], { cwd: dir })
    assert.equal(gone.code, 2, '未知开关一律退出 2')
    assert.match(gone.out + gone.err, /unknown option|未知/)

    // 就算手写一份基线文件也没用：违规照报
    writeFileSync(
      join(dir, 'arch.baseline.json'),
      JSON.stringify({ version: 1, specVersion: '2', entries: [] }),
    )
    const run = await runCli([], { cwd: dir })
    assert.equal(run.code, 1, '有违规就必须红')
    assert.match(run.out, /基线机制已移除/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cli：失败分支也要讲清楚（自检失败 / 本体自包含失败 / 版本兜底）', async () => {
  // 把 es/ 复制到临时目录并伪造必然失败的夹具：这样自检与本体检查的失败分支可在同进程覆盖
  const tmp = mkdtempSync(join(tmpdir(), 'ag-clifail-'))
  try {
    cpSync(join(PACKAGE_ROOT, 'es'), join(tmp, 'es'), { recursive: true })
    symlinkSync(join(PACKAGE_ROOT, 'node_modules'), join(tmp, 'node_modules'), 'dir')
    mkdirSync(join(tmp, '__fixtures__/broken'), { recursive: true })
    writeFileSync(
      join(tmp, '__fixtures__/broken/expect.json'),
      JSON.stringify({ findings: [{ rule: 'S99', file: 'src/不存在.ts' }] }),
    )
    mkdirSync(join(tmp, 'src'), { recursive: true })
    writeFileSync(join(tmp, 'src/bad.ts'), "import lodash from 'lodash'\nexport const x = lodash\n")

    const version = await runCli(['--version'], { packageRoot: tmp })
    assert.equal(version.out.trim(), '0.0.0', '没有 package.json 时版本退回 0.0.0')

    const selfTest = await runCli(['--self-test'], { cwd: tmp, packageRoot: tmp })
    assert.equal(selfTest.code, 1)
    assert.match(selfTest.out, /夹具回归失败/)

    const portability = await runCli(['--self-check-portability'], { cwd: tmp, packageRoot: tmp })
    assert.equal(portability.code, 1)
    assert.match(portability.out, /本体自包含检查失败/)
    assert.match(portability.out, /\[P1\]/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('cli：createProgram 注册了全部对外开关（防止重构时丢参数）', () => {
  const options = createProgram('0.0.0')
    .options.map((option) => option.long)
    .sort()
  assert.ok(options.includes('--stats'))
  assert.ok(options.includes('--verify-deps'))
  assert.ok(options.includes('--update-coverage'))
})
