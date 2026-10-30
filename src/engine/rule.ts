import type { Domain, Level, Rule, RuleContext, Severity, Finding } from './types.js'

/**
 * 规则契约（错误码与域的对应关系见 PARADIGM.md §2：红线只落 L1–L3）。
 * 关键约束由代码强制，而不是写在校验文档里：
 *   - id 必须形如 S01 / D12 / H03（域字母 + 两位序号）
 *   - **error 级规则的判定等级只允许 L1–L3**（范式铁律：红线只落可判定等级）
 *   - 必须给出 title 与 hint（报错要能直接照着改）
 */
export class RuleDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuleDefinitionError'
  }
}

export interface RuleDefinition {
  id: string
  domain: Domain
  level: Level
  severity?: Severity
  title: string
  requires?: string[]
  hint?: string
  /**
   * 这条规则判的是**谁**：`'product'`（默认 `'all'`）表示"产品代码纪律" ——
   * 测试脚手架（`role === 'test'` / `.test.` `.spec.` / `__tests__/` / `layer >= TEST_LAYER_MIN`）
   * 不是它的对象，由引擎统一跳过，宿主不必为每个 `__tests__/helper.ts` 写例外。
   *
   * 为什么是规则级而不是逐条规则各写一遍：同一句口径（"测试文件是脚手架"）曾经在 S16 / P06
   * 各漏一次，而 H07/H08/H09 已经用 `isTestPath` 修过一轮 —— 口径应该只有一处。
   */
  appliesTo?: 'product' | 'all'
  run: (ctx: RuleContext) => Finding[]
}

const DOMAIN_LETTER: Record<Domain, string> = {
  structure: 'S',
  design: 'D',
  copy: 'C',
  deps: 'P',
  hygiene: 'H',
  metrics: 'M',
}

export function createRule(definition: RuleDefinition): Rule {
  const severity: Severity = definition.severity ?? 'error'
  const expectedPrefix = DOMAIN_LETTER[definition.domain]
  if (!new RegExp(`^${expectedPrefix}\\d{2}[a-z]?$`).test(definition.id)) {
    throw new RuleDefinitionError(
      `规则 id 与域不匹配：${definition.id}（${definition.domain} 域应以 ${expectedPrefix} 开头，形如 ${expectedPrefix}01）`,
    )
  }
  if (severity === 'error' && !['L1', 'L2', 'L3'].includes(definition.level)) {
    throw new RuleDefinitionError(
      `规则 ${definition.id}：error 级只允许落在 L1–L3（当前 ${definition.level}）。语义判据（L5）不许进红线。`,
    )
  }
  if (!definition.title) throw new RuleDefinitionError(`规则 ${definition.id} 缺少 title`)
  if (!definition.run) throw new RuleDefinitionError(`规则 ${definition.id} 缺少 run`)
  return {
    id: definition.id,
    domain: definition.domain,
    level: definition.level,
    severity,
    title: definition.title,
    ...(definition.requires ? { requires: definition.requires } : {}),
    ...(definition.hint ? { hint: definition.hint } : {}),
    ...(definition.appliesTo ? { appliesTo: definition.appliesTo } : {}),
    run: definition.run,
  }
}
