import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { run } from '../es/cli.js'
import { BLOCK_NAMES, parseDocBlocks, renderDocText } from '../es/engine/docs.js'

/**
 * 文档管理块（DESIGN §7.3）：文档里那几张表**从 `arch.config.mjs` 渲染**，漂移即红。
 *
 * 为什么值得：`arch.config.mjs` 是唯一机读真相，但文档里的选型表 / 阈值 / 角色表是**手抄**的 ——
 * 而 agent 读到的"规范"必须与门禁判的是同一份，否则它会被过时文档带偏。
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

const CONFIG = `import { canonical, designSystem, deps } from '${INDEX_URL}'
export default {
  sourceForm: 'typescript',
  presets: [canonical(), designSystem(), deps({ allow: ['commander'], capabilities: { 'cli-args': 'commander' } })],
}
`

function makeProject(docBody) {
  const dir = mkdtempSync(join(tmpdir(), 'ag-docs-'))
  mkdirSync(join(dir, 'src/app'), { recursive: true })
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'docs', private: true, type: 'module' }),
  )
  writeFileSync(join(dir, 'arch.config.mjs'), CONFIG)
  writeFileSync(join(dir, 'src/app/main.tsx'), 'export const boot = 1\n')
  writeFileSync(join(dir, 'NOTES.md'), docBody)
  return dir
}

/* ---------------- 标记解析（纯函数） ---------------- */

test('围栏代码块里的示范标记不算真块（否则文档里"示范语法"会把自己判红）', () => {
  const text = [
    '写法长这样：',
    '',
    '```md',
    '<!-- arch-guard:begin deps -->',
    '（内容）',
    '<!-- arch-guard:end deps -->',
    '```',
    '',
    '正文。',
  ].join('\n')
  const { spans, errors } = parseDocBlocks(text)
  assert.deepEqual(errors, [])
  assert.deepEqual(spans, [])
})

test('prettier 把表格对齐之后不算漂移（留白不是事实，单元格内容才是）', async () => {
  const { loadConfig } = await import('../es/engine/config.js')
  const dir = makeProject('')
  try {
    const { config } = await loadConfig({ root: dir, sourceForms: [] })
    const raw = renderDocText(
      '<!-- arch-guard:begin thresholds -->\n<!-- arch-guard:end thresholds -->\n',
      config,
    ).text
    // 模拟 prettier 的表格排版：单元格补空格 + 分隔行按列宽拉长 + 块内首尾各加一个空行
    const prettierize = (text) =>
      text
        .split('\n')
        .map((line) => {
          if (line.includes('---')) return line.replace(/-{3,}/g, '-'.repeat(12))
          return line.startsWith('|') ? line.replace(/\|/g, '  |').replace(/ +$/, '') : line
        })
        .join('\n')
        .replace(
          '<!-- arch-guard:begin thresholds -->\n',
          '<!-- arch-guard:begin thresholds -->\n\n',
        )
        .replace('\n<!-- arch-guard:end thresholds -->', '\n\n<!-- arch-guard:end thresholds -->')
    assert.deepEqual(renderDocText(prettierize(raw), config).changed, [], '对齐不该被判成漂移')
    // 但内容真变了就必须报（先改内容、再排版，模拟"文档被手改过"）
    assert.deepEqual(
      renderDocText(prettierize(raw.replace('| 500 |', '| 999 |')), config).changed,
      ['thresholds'],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('块名必须登记：拼错直接报错，而不是安静地不同步', () => {
  const { errors } = parseDocBlocks(
    '<!-- arch-guard:begin depz -->\nx\n<!-- arch-guard:end depz -->\n',
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /未知块名 depz/)
  assert.match(errors[0], new RegExp(BLOCK_NAMES[0]))
})

test('未闭合 / 不配对 / 嵌块都要报错', () => {
  assert.match(parseDocBlocks('<!-- arch-guard:begin deps -->\n').errors.join(), /没有 end 标记/)
  assert.match(
    parseDocBlocks('<!-- arch-guard:end deps -->\n').errors.join(),
    /end 没有对应的 begin/,
  )
  assert.match(
    parseDocBlocks(
      '<!-- arch-guard:begin deps -->\n<!-- arch-guard:end thresholds -->\n',
    ).errors.join(),
    /不配对/,
  )
  assert.match(
    parseDocBlocks(
      '<!-- arch-guard:begin deps -->\n<!-- arch-guard:begin roles -->\n<!-- arch-guard:end roles -->\n',
    ).errors.join(),
    /嵌在未闭合的块/,
  )
})

test('渲染只改块内内容：块外的散文与别的块一字不动', async () => {
  const { loadConfig } = await import('../es/engine/config.js')
  const dir = makeProject('')
  try {
    const { config } = await loadConfig({ root: dir, sourceForms: [] })
    const before =
      '前言\n\n<!-- arch-guard:begin thresholds -->\n旧内容\n<!-- arch-guard:end thresholds -->\n\n后记\n'
    const rendered = renderDocText(before, config)
    assert.deepEqual(rendered.changed, ['thresholds'])
    assert.match(rendered.text, /^前言\n/)
    assert.match(rendered.text, /后记\n$/)
    assert.match(rendered.text, /\| 文件行数 \| 500 \| S16 \|/)
    assert.equal(/旧内容/.test(rendered.text), false)
    // 幂等：再渲染一次不该再有变化
    assert.deepEqual(renderDocText(rendered.text, config).changed, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ---------------- CLI：--check-docs / --render-docs ---------------- */

test('--render-docs：自定义能力也进能力表（与内置能力同一张表）', async () => {
  const dir = makeProject('<!-- arch-guard:begin deps -->\n<!-- arch-guard:end deps -->\n')
  try {
    writeFileSync(
      join(dir, 'arch.config.mjs'),
      `import { canonical, deps } from '${INDEX_URL}'
export default {
  sourceForm: 'typescript',
  presets: [
    canonical(),
    deps({
      capabilities: {
        'http-client': { preferred: 'axios', syntax: ['fetch'], hint: '用 axios 统一封装' },
      },
    }),
  ],
}
`,
    )
    assert.equal((await runCli(['--render-docs'], dir)).code, 0)
    const text = readFileSync(join(dir, 'NOTES.md'), 'utf8')
    assert.match(text, /`http-client` \| `axios`/, '自定义能力必须出现在渲染出的能力表里')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--check-docs：块与 config 不一致即红，并指名文件与块', async () => {
  const dir = makeProject(
    '# 项目说明\n\n<!-- arch-guard:begin thresholds -->\n| 文件行数 | 999 |\n<!-- arch-guard:end thresholds -->\n',
  )
  try {
    const check = await runCli(['--check-docs'], dir)
    assert.equal(check.code, 1)
    assert.match(check.err, /NOTES\.md：块 thresholds 与 arch\.config\.mjs 不一致/)
    assert.match(check.out, /文档漂移/)

    const render = await runCli(['--render-docs'], dir)
    assert.equal(render.code, 0)
    assert.match(render.out, /已更新 NOTES\.md：thresholds/)
    assert.match(readFileSync(join(dir, 'NOTES.md'), 'utf8'), /\| 文件行数 \| 500 \| S16 \|/)

    const again = await runCli(['--check-docs'], dir)
    assert.equal(again.code, 0, again.out + again.err)
    assert.match(again.out, /✔ 文档管理块与 arch\.config\.mjs 一致/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--render-docs：config 一改，块就跟着变（阈值 × 能力表都来自 config）', async () => {
  const dir = makeProject(
    '<!-- arch-guard:begin thresholds -->\n<!-- arch-guard:end thresholds -->\n\n<!-- arch-guard:begin deps -->\n<!-- arch-guard:end deps -->\n',
  )
  try {
    assert.equal((await runCli(['--render-docs'], dir)).code, 0)
    const text = readFileSync(join(dir, 'NOTES.md'), 'utf8')
    assert.match(text, /`cli-args` \| `commander`/)
    assert.match(text, /- `commander`/)
    assert.match(text, /\| 函数行数 \| 150 \| S16 \|/)

    // 改 config：阈值走 overrides、批准清单加一项 —— 两者都要被重新渲染
    writeFileSync(
      join(dir, 'arch.config.mjs'),
      `import { canonical, designSystem, deps } from '${INDEX_URL}'
export default {
  sourceForm: 'typescript',
  presets: [canonical(), designSystem(), deps({ allow: ['commander', 'picocolors'], capabilities: { 'cli-args': 'commander' } })],
  overrides: { thresholds: { functionLines: 120 } },
}
`,
    )
    const check = await runCli(['--check-docs'], dir)
    assert.equal(check.code, 1, 'config 变了但文档没同步 → 必须红')
    assert.equal((await runCli(['--render-docs'], dir)).code, 0)
    const updated = readFileSync(join(dir, 'NOTES.md'), 'utf8')
    assert.match(updated, /\| 函数行数 \| 120 \|/)
    assert.match(updated, /- `picocolors`/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--check-docs：没有任何管理块时明说（不是安静地"通过"）', async () => {
  const dir = makeProject('# 只有散文，没有块\n')
  try {
    const check = await runCli(['--check-docs'], dir)
    assert.equal(check.code, 0)
    assert.match(check.out, /没有任何文档管理块/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--check-docs：块名拼错 / 未闭合都 fail-closed（退出 2，而不是 0）', async () => {
  const dir = makeProject('<!-- arch-guard:begin nope -->\nx\n<!-- arch-guard:end nope -->\n')
  try {
    const check = await runCli(['--check-docs'], dir)
    assert.equal(check.code, 2)
    assert.match(check.err, /未知块名 nope/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('docs 目录里的块也会被扫到（不只根目录的 md）', async () => {
  const dir = makeProject('# 根文档\n')
  try {
    writeFileSync(
      join(dir, 'docs/ARCH.md'),
      '<!-- arch-guard:begin thresholds -->\n旧的\n<!-- arch-guard:end thresholds -->\n',
    )
    const check = await runCli(['--check-docs'], dir)
    assert.equal(check.code, 1)
    assert.match(check.err, /docs\/ARCH\.md：块 thresholds/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('围栏：四反引号里嵌三反引号之后的管理块仍要被认出来（R-144 顺带修的真 bug）', async () => {
  const { parseDocBlocks } = await import('../es/engine/docs.js')
  // 常规写法：用 ```` 包住一个 ``` 示例，再往后放一个真管理块
  const text = [
    '# 文档',
    '',
    '````md',
    '```js',
    'const x = 1',
    '```',
    '````',
    '',
    '<!-- arch-guard:begin deps -->',
    '<!-- arch-guard:end deps -->',
    '',
  ].join('\n')
  const parsed = parseDocBlocks(text)
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(
    parsed.spans.map((span) => span.name),
    ['deps'],
    '嵌套围栏之后的管理块被当成"围栏内" = 静默不渲染、也不校验（实测 DESIGN.md 踩过）',
  )
})
