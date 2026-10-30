import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canonical, fsd, library } from '../es/index.js'

import { APP_ONLY } from './paradigm-app-only.mjs'

/**
 * **元门禁：范式预设的结构词汇必须完整**（R-74）。
 *
 * 为什么需要：规则、声明、夹具都齐了，**范式预设这条路却可能是断的** ——
 * 2026-09-25 实测发现 6 条已实现的规则因为两行数据缺失（`canonical()` 的角色没声明 `group: 'domain'`、
 * `routes.tsx` 没标 `entry: true`）在前端应用里**从来没跑过**，而门禁一直显示"通过"。
 *
 * 这条测试把"每个范式预设必须提供哪些结构词汇"写成显式期望表：
 * 删掉 `group` / `entry` 就会红，而不是安静地让一批按组判定的规则集体沉默。
 */

/** 期望表：**改范式 = 改这里**（有捕获就必须能当组用；有入口语义就必须有 entry 角色） */
const EXPECTED = [
  {
    name: 'canonical',
    preset: canonical,
    groups: ['domain'],
    entry: true,
    why: '三根拓扑：`modules/{domain}` 是组维度，`routes.tsx` 是域的公开面入口（S03/S23 的前提）',
  },
  {
    name: 'fsd',
    preset: fsd,
    groups: ['slice'],
    entry: true,
    why: 'FSD：`{slice}` 是组维度，切片的 `index.ts` 是公开面入口',
  },
  {
    name: 'library',
    preset: library,
    groups: [],
    entry: false,
    why: '库范式没有"域 / 切片"概念，也没有公开面入口 —— 按组判定的规则对它天然不适用（靠声明才判，不是靠数据）',
  },
]

test('范式预设：域/切片捕获必须声明为组维度（否则按组判定的规则集体沉默）', () => {
  for (const spec of EXPECTED) {
    const roles = spec.preset().roles ?? []
    const captures = new Set()
    for (const role of roles) {
      for (const match of role.pattern.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) captures.add(match[1])
    }
    const declared = new Set(roles.map((role) => role.group).filter(Boolean))
    for (const expected of spec.groups) {
      assert.ok(
        captures.has(expected),
        `${spec.name} 的角色表里没有 {${expected}} 捕获（期望表过时了？）`,
      )
      assert.ok(
        declared.has(expected),
        `${spec.name} 的 {${expected}} 捕获没有角色声明 group: '${expected}' —— ${spec.why}`,
      )
    }
    for (const name of declared) {
      assert.ok(
        spec.groups.includes(name),
        `${spec.name} 声明了未登记的组维度 ${name}（改范式要同步本测试的期望表）`,
      )
    }
  }
})

test('范式预设：有入口语义的范式必须有 entry 角色（否则 S23 / S35 不生效）', () => {
  for (const spec of EXPECTED) {
    const roles = spec.preset().roles ?? []
    const entries = roles.filter((role) => role.entry === true)
    if (spec.entry) {
      assert.ok(
        entries.length > 0,
        `${spec.name} 没有任何 entry: true 的角色 —— 公开面规则（S23）与空壳组（S35）等于关着`,
      )
    } else {
      assert.equal(entries.length, 0, `${spec.name} 不该有 entry 角色（期望表说它没有入口语义）`)
    }
  }
})

test('范式覆盖：每个范式的账目都必须闭合，且 fsd 未启用的正好是那批应用专属规则', async () => {
  const { coreRules, createRegistry, loadConfig } = await import('../es/index.js')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const root = fileURLToPath(new URL('..', import.meta.url))

  /**
   * R-142 之后这条守卫更强了：以前它靠"算差集"来**记录**那 9 条静默缺席的规则
   * （既不跑、也不在停用清单里）—— 现在它们进了 `skipped`，于是可以要求**账目闭合**：
   * 每条注册的规则都必须落在 enabled / skipped / disable 三者之一里，一条都不许"没下落"。
   */
  const accounting = async (example) => {
    const { config } = await loadConfig({ root: join(root, 'examples', example) })
    const registry = createRegistry(coreRules, config)
    const accounted = new Set([
      ...registry.enabled.map((rule) => rule.id),
      ...registry.skipped.map((item) => item.rule),
      ...(config.disable ?? []),
    ])
    return {
      missing: coreRules.map((rule) => rule.id).filter((id) => !accounted.has(id)),
      notEnabled: registry.skipped
        .filter((item) => item.code === 'not-enabled')
        .map((item) => item.rule)
        .sort(),
    }
  }

  const canonicalExample = await accounting('full')
  const fsdExample = await accounting('full-fsd')

  assert.deepEqual(canonicalExample.missing, [], 'canonical：账目必须闭合（R-142）')
  assert.deepEqual(
    fsdExample.missing,
    [],
    'fsd：账目必须闭合 —— 那 8 条不再"静默消失"，而是明列 `not-enabled`',
  )
  assert.deepEqual(
    fsdExample.notEnabled,
    [...APP_ONLY].sort(),
    'fsd 未启用的必须**正好**是这批应用专属规则；多一条 = 又有一条规则被静默放下了',
  )
  assert.deepEqual(
    canonicalExample.notEnabled,
    [],
    'canonical 的启用清单必须是满的（声明都给全了）',
  )
})
