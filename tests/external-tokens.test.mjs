import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { builtinSourceForms, coreRules, designSystem, runGuard } from '../es/index.js'

/**
 * 外部令牌（D04）与外部消费者（D05）。
 *
 * 判据本体由夹具 `__fixtures__/external-tokens` 覆盖；这里补两件夹具判不了的事：
 * ① 配置期 fail-closed（形状写错不许静默失能）；② **声明 ⇄ 不声明的对照** ——
 * 同一份代码，不声明时 D04/D05 报，声明后不报（"合规不报"不能只靠一个夹具自证）。
 */

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = `file://${join(PACKAGE_ROOT, 'es/index.js')}`

test('designSystem：externalTokens / externalConsumers 配置期 fail-closed', () => {
  // 前缀不以 -- 开头 / 太短 / 含空白
  for (const prefix of ['ext-color', '--', '--ext color', 42]) {
    assert.throws(
      () => designSystem({ externalTokens: [{ prefix }] }),
      /prefix 必须形如/,
      `prefix=${JSON.stringify(prefix)} 应被拒`,
    )
  }
  // 同一个命名空间声明两次
  assert.throws(
    () =>
      designSystem({
        externalTokens: [{ prefix: '--ext-' }, { prefix: '--ext-', provider: '另一个' }],
      }),
    /重复/,
  )
  // provider 写了就必须非空
  assert.throws(
    () => designSystem({ externalTokens: [{ prefix: '--ext-', provider: '   ' }] }),
    /provider/,
  )
  // externalConsumers：不是数组 / 空项
  assert.throws(() => designSystem({ externalConsumers: 'shared/src/**' }), /必须是字符串数组/)
  assert.throws(() => designSystem({ externalConsumers: ['', '  '] }), /非空字符串/)

  // 合规形态落进 params；没声明不落键（行为与旧版一致）
  const preset = designSystem({
    externalTokens: [{ prefix: '--ext-', provider: ' 主题运行时 ' }],
    externalConsumers: ['shared/src/**', 'shared/src/**'],
  })
  assert.deepEqual(preset.params?.externalTokens, [{ prefix: '--ext-', provider: '主题运行时' }])
  assert.deepEqual(preset.params?.externalConsumers, ['shared/src/**'], '重复的 glob 去重')
  assert.equal(designSystem().params?.externalTokens, undefined)
  assert.equal(designSystem().params?.externalConsumers, undefined)
})

/** 建一个临时项目：本包令牌 + 包内引用 + 包外消费者（契约域之外） */
function makeProject({ declared }) {
  const dir = mkdtempSync(join(tmpdir(), 'ag-external-tokens-'))
  const write = (rel, text) => {
    const file = join(dir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  write(
    'app/src/styles/tokens/palette.css',
    ':root {\n  --app-len-1: 4px;\n  --app-only-outside: 8px;\n  --app-dead: 12px;\n}\n',
  )
  write(
    'app/src/styles/global.css',
    '.card { color: var(--ext-color-primary); padding: var(--app-len-1); }\n' +
      '.dangling { color: var(--dangling-color); }\n',
  )
  write('shared/src/Card.css', '.card { gap: var(--app-only-outside); }\n')
  write(
    'arch.config.mjs',
    `import { designSystem, library } from ${JSON.stringify(ENTRY)}
export default {
  presets: [
    library({ src: 'app/src', entry: [] }),
    designSystem({
      tokenDir: 'app/src/styles/tokens',
      paletteFile: 'app/src/styles/tokens/palette.css',
      ${declared ? "externalTokens: [{ prefix: '--ext-', provider: '主题运行时' }], externalConsumers: ['shared/src/**']," : ''}
    }),
  ],
  overrides: {
    addRoles: [{ id: 'fixture:styles', pattern: 'app/src/styles/**', layer: 1, exclusive: true }],
    enable: ['D04', 'D05'],
    ignore: ['arch.config.mjs'],
  },
}
`,
  )
  return dir
}

test('D04/D05：声明 externalTokens / externalConsumers 后不报；不声明时要报', async () => {
  const run = async (declared) => {
    const dir = makeProject({ declared })
    try {
      const result = await runGuard({
        cwd: dir,
        ruleSet: coreRules,
        sourceForms: builtinSourceForms,
        quiet: true,
      })
      return result.all.map((finding) => ({ rule: finding.rule, text: finding.text ?? '' }))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const declared = await run(false)
  assert.ok(
    declared.some((item) => item.rule === 'D04' && item.text.includes('--ext-color-primary')),
    '未声明 externalTokens 时，外部命名空间的引用会被 D04 报（误报就是本需求要消掉的）',
  )
  assert.ok(
    declared.some((item) => item.rule === 'D05' && item.text.includes('--app-only-outside')),
    '未声明 externalConsumers 时，包外消费者的令牌会被 D05 报成死令牌',
  )

  const configured = await run(true)
  assert.equal(
    configured.some((item) => item.rule === 'D04' && item.text.includes('--ext-color-primary')),
    false,
    '声明 externalTokens 后，外部命名空间视为闭合',
  )
  assert.equal(
    configured.some((item) => item.rule === 'D05' && item.text.includes('--app-only-outside')),
    false,
    '声明 externalConsumers 后，包外引用算「被引用」',
  )
  // 真违规仍然要报（豁免只针对声明的命名空间/消费者，不许扩大）
  assert.ok(
    configured.some((item) => item.rule === 'D04' && item.text.includes('--dangling-color')),
    '本地悬空引用仍然要报',
  )
  assert.ok(
    configured.some((item) => item.rule === 'D05' && item.text.includes('--app-dead')),
    '本包内确实没人用的令牌仍然要报',
  )
})
