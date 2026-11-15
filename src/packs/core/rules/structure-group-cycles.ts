import { groupCyclesOf, groupIndexOf, groupOfRelOf } from '../../../engine/group-graph.js'
import type { Finding, Rule } from '../../../engine/types.js'

import { finding } from './finding.js'

/**
 * S47 **组级依赖环**（R-170）：文件级可能没有环（S08 看不见），但组之间互相依赖后，
 * 拆 / 换其中一个组都要动另一个 —— 这正是"组"想避免的事。
 *
 * 为什么从建议升成红线：它是**图属性**，没有口味成分；而本工具面向 AI，非阻断建议
 * 不会改变 AI 的行为（R-169 同一条理由）。合法的双向依赖用 `exceptions` 声明（写 reason）。
 *
 * 边界：只算跨组边 · 测试 / 组外文件不计（`groupIndexOf` / `groupEdgesOf` 的统一口径）·
 * 单文件环归 S08，不在组图里。
 */
export const groupCycleRule: Rule = {
  id: 'S47',
  domain: 'structure',
  level: 'L3',
  severity: 'error',
  title: '组级依赖环',
  hint: '组间互相依赖：把共用部分下沉到共享层，或让一侧单向依赖（公开面 + 事件 / 回调反转）；合法双向依赖用 overrides.exceptions 声明 S47 并写 reason',
  run: (ctx) => {
    if (ctx.records.length === 0) return []
    const groups = groupIndexOf(ctx.records)
    if (groups.size === 0) return []
    const groupOfRel = groupOfRelOf(groups)
    const out: Finding[] = []
    for (const { cycle } of groupCyclesOf(groups, groupOfRel, ctx.graph.edges)) {
      const start = cycle[0]
      if (start === undefined) continue
      const anchor = cycle.flatMap((group) => group.files.map((file) => file.rel)).sort()[0]
      if (anchor === undefined) continue
      out.push(
        finding(
          'S47',
          anchor,
          1,
          `组级依赖环：${[...cycle.map((group) => group.label), start.label].join(' → ')}` +
            '（文件级可能没有环，S08 看不见）—— 拆 / 换其中一个都要动另一个',
          undefined,
          // 组级谓词：`--scope=changed` 下默认仍阻断（与 S27 同口径）
          true,
        ),
      )
    }
    return out
  },
}
