import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { builtinSourceForms, coreRules, fsd, library, runGuard } from '../es/index.js'

/**
 * P0-4：**FSD 的入口默认在 app 段** + **`entries` 0 命中要自述、不许把全树判成孤儿**。
 *
 * 真实事故的形状：`fsd()` 继承 `library({ entry: [] })`，`entries` 是显式空数组，
 * 于是可达性根集为空 → S15 把全树报成孤儿（几百条），而报告没有任何"根集为空"的自述。
 */

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = `file://${join(PACKAGE_ROOT, 'es/index.js')}`

test('fsd：默认入口在 app 段，且启用 S15；可用 entry 覆盖', () => {
  const preset = fsd()
  assert.deepEqual(preset.entries, ['src/app/main.tsx'], 'FSD 入口默认 src/app/main.tsx')
  assert.ok(
    Array.isArray(preset.enable) && preset.enable.includes('S15'),
    'S15 的孤儿判定对 FSD 同样成立（只判孤儿那一半）',
  )
  assert.deepEqual(fsd({ entry: ['app/bootstrap.tsx'] }).entries, ['src/app/bootstrap.tsx'])

  // 库范式仍然显式空入口（它的入口按 `entry` 选项声明，不会被这里牵连）
  assert.deepEqual(library({ src: 'src', entry: [] }).entries, [])
})

test('entries 0 命中：不把全树判成孤儿，且报告点名这条声明', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ag-entry-'))
  try {
    mkdirSync(join(dir, 'src/shared/lib'), { recursive: true })
    writeFileSync(join(dir, 'src/shared/lib/a.ts'), 'export const a = 1\n')
    writeFileSync(
      join(dir, 'arch.config.mjs'),
      `import { canonical } from ${JSON.stringify(ENTRY)}
export default {
  presets: [canonical()],
  overrides: { enable: ['S15'], entries: ['src/does-not-exist.tsx'], ignore: ['arch.config.mjs'] },
}
`,
    )
    const result = await runGuard({
      cwd: dir,
      ruleSet: coreRules,
      sourceForms: builtinSourceForms,
      quiet: true,
    })
    assert.equal(
      result.all.some((finding) => finding.rule === 'S15'),
      false,
      '根集为空是"没判定"，不是"全是孤儿"',
    )
    const notice = result.notices.find((item) => item.code === 'declaration-no-match')
    assert.ok(notice, 'entries 0 命中必须自述（否则几百条误报没有真因）')
    assert.match(notice.text ?? '', /entries 的 src\/does-not-exist\.tsx/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('FSD 范例（examples/full-fsd）：S15 在跑且 0 finding', async () => {
  const result = await runGuard({
    cwd: join(PACKAGE_ROOT, 'examples/full-fsd'),
    ruleSet: coreRules,
    sourceForms: builtinSourceForms,
    quiet: true,
  })
  assert.equal(
    result.all.some((finding) => finding.rule === 'S15'),
    false,
    '官方 FSD 样板打开 S15 后必须干净（它自己的入口已经在 app 段）',
  )
  assert.ok(
    result.config.rules.some((rule) => rule.id === 'S15'),
    'S15 必须在 FSD 的注册/启用集里（以前它落在 9 条 not-enabled 里，可达性等于关着）',
  )
})
