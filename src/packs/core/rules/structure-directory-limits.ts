import { DEFAULT_MAX_ITEMS_PER_DIR, TEST_LAYER_MIN } from '../../../engine/defaults.js'
import { isTestScaffold } from '../../../engine/rule-scope.js'
import type { Finding, Rule } from '../../../engine/types.js'

import { finding, unitDirsOf } from './structure-util.js'

/**
 * 给 **AI** 看的处方：必须说清"该做什么"和"不该做什么"。
 *
 * 只写"拆"会把 AI 推去建 `utils/` 这类假分组（比不拆更糟）；只写"可豁免"会把红灯变成通过按钮。
 */
const S27_FIX_HINT =
  '按已有角色 / 域拆成子目录；不要为了过门禁新建 utils / common / misc。' +
  '数据 / 资源 / 库层这类天生平铺的目录，用 structure.directoryItemLimits 给该角色更高的 max' +
  '（或用 overrides.exceptions 声明 S27 并写 reason）'

/**
 * 判据：角色 pattern 匹配到的**实际目录**的一级子项超过预算 → 报（锚在该目录内字典序最小的文件上）。
 *
 * 预算是两层（R-169）：
 *   - `structure.directoryItemLimits`：宿主按角色声明，显式优先（同一目录取最严的那个）；
 *   - `structure.maxItemsPerDir`：**默认开启**，覆盖所有 product 角色目录 —— 本工具面向 AI，
 *     非阻断建议不在 AI 的必做项里，所以"没人声明的目录"必须也有红灯。
 *
 * 默认数"文件 + 子目录"（社区 linter 的 `shared/lib` 就是这个口径）；`foldersOnly` 只数子目录；
 * **测试脚手架不计**（与 S16 同口径）—— 否则一个文件配一个测试会先把目录顶爆。
 *
 * **必须是"实际目录"**：`src/modules/{domain}/components/**` 这类带捕获的角色，
 * 按字面 pattern 去匹配永远是 0 命中（见 R-168）；这里按每条记录展开成每个域的真实目录。
 * 发现项是**目录级谓词**，标 `global` —— 否则 `--scope=changed` 会按锚点文件过滤掉它，
 * 新增文件把目录顶爆时反而看不见。
 */
export const directoryItemLimits: Rule = {
  id: 'S27',
  domain: 'structure',
  level: 'L3',
  severity: 'error',
  title: '目录子项数上限',
  hint: '一个目录里堆太多模块说明该分组了（shared/lib 是最常见的一个）；阈值在 structure.maxItemsPerDir / directoryItemLimits 里调',
  run: (ctx) => {
    if (ctx.records.length === 0) return []
    const limits = ctx.config.structure.directoryItemLimits ?? []
    const defaultMax = ctx.config.structure.maxItemsPerDir ?? DEFAULT_MAX_ITEMS_PER_DIR
    /** 实际目录 → 预算；显式声明优先，默认预算不重复判同一个目录 */
    const budgets = new Map<
      string,
      { max: number; foldersOnly: boolean; source: 'role' | 'default' }
    >()

    for (const limit of limits) {
      const roleRecords = ctx.records.filter((record) => record.role === limit.role)
      for (const dir of unitDirsOf(ctx.config.roles, limit.role, roleRecords)) {
        const prev = budgets.get(dir)
        if (prev === undefined || limit.max < prev.max) {
          budgets.set(dir, {
            max: limit.max,
            foldersOnly: limit.foldersOnly === true,
            source: 'role',
          })
        }
      }
    }

    for (const role of ctx.config.roles) {
      // 测试 / 类型声明不是产品代码；显式声明过的角色已在上面处理过
      if (role.exclusive === true || role.layer >= TEST_LAYER_MIN) continue
      if (limits.some((limit) => limit.role === role.id)) continue
      const roleRecords = ctx.records.filter((record) => record.role === role.id)
      for (const dir of unitDirsOf(ctx.config.roles, role.id, roleRecords)) {
        if (!budgets.has(dir)) {
          budgets.set(dir, { max: defaultMax, foldersOnly: false, source: 'default' })
        }
      }
    }

    const out: Finding[] = []
    for (const [dir, budget] of [...budgets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const members = ctx.records
        .filter((record) => record.rel.startsWith(`${dir}/`) && !isTestScaffold(record.rel, record))
        .map((record) => record.rel)
        .sort()
      if (members.length === 0) continue
      const children = new Set<string>()
      for (const rel of members) {
        const rest = rel.slice(dir.length + 1)
        const [head, ...tail] = rest.split('/')
        if (head === undefined || head === '') continue
        if (budget.foldersOnly && tail.length === 0) continue
        children.add(head)
      }
      if (children.size <= budget.max) continue
      const where = budget.source === 'role' ? '（directoryItemLimits）' : '（默认上限）'
      out.push(
        finding(
          'S27',
          members[0] as string,
          1,
          `${dir} 有 ${children.size} 个一级子项，超过上限 ${budget.max}${where}：按用途分子目录，别让一个目录变成杂物间`,
          S27_FIX_HINT,
          true,
        ),
      )
    }
    return out
  },
}
