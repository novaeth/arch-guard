import type { Rule } from '../../engine/types.js'

import { copyRules } from './rules/copy.js'
import { adapterRules } from './rules/deps-adapters.js'
import { depsRules } from './rules/deps.js'
import { contextHygieneRules } from './rules/hygiene-context.js'
import { generatedMarker } from './rules/hygiene-generated.js'
import { noComments } from './rules/hygiene-comments.js'
import { hygieneRetiredRules } from './rules/hygiene-retired.js'
import { designSourceRules } from './rules/design-sources.js'
import { inlineStyleDiscipline } from './rules/design-inline.js'
import { numbersHaveHomes, repeatedCssValues } from './rules/design-numbers.js'
import { designStyleRules } from './rules/design-styles.js'
import { designTokenRules } from './rules/design-tokens.js'
import { designVendorRules } from './rules/design-vendor.js'
import { metricsRules } from './rules/metrics.js'
import { declaredStructureRules } from './rules/structure-declared.js'
import { structureGraphRules } from './rules/structure-graph.js'
import { structureImportRules } from './rules/structure-imports.js'
import { structureGroupRules } from './rules/structure-groups.js'
import { directoryItemLimits } from './rules/structure-directory-limits.js'
import { groupCycleRule } from './rules/structure-group-cycles.js'
import { structureBoundaryRules } from './rules/structure-boundaries.js'
import { structureCallSiteRules } from './rules/structure-call-sites.js'
import { structureDisciplineRules } from './rules/structure-discipline.js'
import { structureLocalityRules } from './rules/structure-locality.js'
import { scanScopeNotEmpty } from './rules/structure-scan.js'
import { structureRules } from './rules/structure.js'

/**
 * **共享规则集** —— 本体当前所有规则的实现都在这里（`packs/core/rules/`），
 * 由源码形态的绑定引用（`packs/registry.ts` 里两个形态今天引用的就是同一份）。
 *
 * 为什么要有这一层：pack 的名字必须表示**源码形态**（`.ts` 家族 / `.tsx` / SFC），
 * 而不是"某个具体框架" —— 否则一个纯 TS 库会被 react 形态量，配置里就写出了一句错话。
 * 现在 `packs/typescript` 与 `packs/react` 只是两份 pack 声明（id / framework / 适配面），
 * 规则实现只有一个家。
 *
 * **将来怎么分化**：第一条 JSX 专属规则已经落地（**D15 内联样式**，判据来自 `facts.styleProps`）——
 * 它暂时留在 core，因为两个 pack 今天引用同一份；出现第二条时（模板插值、SFC `<style scoped>`…）
 * 它们一起搬去**自己 pack 的** `packs/react/rules/`（各自独立），而不是继续往 core 里塞。
 * 这也正是 PARADIGM §11「换元框架 = 换 parser + 角色表变体 + 规则集变体」的落点。
 */
export const coreRules: Rule[] = [
  ...structureRules,
  ...structureGraphRules,
  ...structureImportRules,
  ...declaredStructureRules,
  ...structureGroupRules,
  directoryItemLimits,
  groupCycleRule,
  ...structureLocalityRules,
  ...structureCallSiteRules,
  ...structureBoundaryRules,
  ...structureDisciplineRules,
  // 扫描域非空是"逐文件规则能跑"的先决条件，放在结构域里
  scanScopeNotEmpty,
  ...designTokenRules,
  ...designVendorRules,
  ...designStyleRules,
  // D15 是**第一条 JSX 专属**规则（事实 `styleProps` 只在 JSX `style={}` 里产生，纯 TS 项目自然零命中）：
  // 与 design-styles 的 D12–D14 是同一套刻度，放在一起读更顺
  inlineStyleDiscipline,
  repeatedCssValues,
  numbersHaveHomes,
  ...designSourceRules,
  ...copyRules,
  ...depsRules,
  ...adapterRules,
  ...metricsRules,
  ...contextHygieneRules,
  ...hygieneRetiredRules,
  generatedMarker,
  noComments,
]
