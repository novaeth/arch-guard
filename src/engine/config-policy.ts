import type { Diagnostic } from './codes.js'
import type { ConfigOverrides, Rule, Severity } from './types.js'

/**
 * **配置层的接入策略**（R-162 / R-163）：它们都回答"哪些规则在跑、按什么严重度跑"，
 * 与合并语义（`merge-spec.ts`）分开 —— 抽出来的原因和 `rule-scope.ts` 一样：
 * `loadConfig` / `runGuard` 各有长度上限，而这几条判据内聚、可单独测。
 */

/**
 * **自定义规则默认参与判定**：项目层 `enable` 是整体替换；若只列内置规则，
 * 会把自己的规则静默放下（实测：宿主写了 `enable: [...]` 又追加 `customRules`，自定义规则一条都不跑）。
 */
export function resolveEnable(
  projectEnable: string[] | 'all' | undefined,
  overrides: ConfigOverrides,
): string[] | 'all' {
  if (projectEnable === undefined) return 'all'
  if (projectEnable === 'all') return 'all'
  const customIds = (overrides.customRules ?? []).map((rule) => rule.id)
  return [...new Set([...projectEnable, ...customIds])]
}

/**
 * **逐规则严重度覆盖**的配置期校验（fail-closed）：值必须是 error/warn，规则 id 必须存在。
 * 拼错的规则 id 等于"以为降级了、其实没降"，与 `exceptions` 拼错规则 id 同一口径。
 */
export function validateSeverity(value: unknown, rules: Rule[]): Record<string, Severity> {
  const input = (value ?? {}) as Record<string, unknown>
  const known = new Set(rules.map((rule) => rule.id))
  for (const [ruleId, value] of Object.entries(input)) {
    if (value !== 'error' && value !== 'warn') {
      throw new Error(
        `overrides.severity 的 ${ruleId} 必须是 'error' 或 'warn'（当前 ${JSON.stringify(value)}）`,
      )
    }
    if (!known.has(ruleId)) {
      throw new Error(
        `overrides.severity 覆盖了不存在的规则：${ruleId} —— 拼错等于没写（写的是 ${known.size} 条已知规则之一）`,
      )
    }
  }
  return input as Record<string, Severity>
}

/** 生效规则集：按覆盖改 `severity`（报告 / 退出码 / JSON 的 `severityOf` 只读这一份） */
export function applySeverity(rules: Rule[], overrides: Record<string, Severity>): Rule[] {
  if (Object.keys(overrides).length === 0) return rules
  return rules.map((rule) => {
    const severity = overrides[rule.id]
    return severity === undefined ? rule : { ...rule, severity }
  })
}

/**
 * **项目层 `enable: 'all'` 的副作用自述**：预设只给"这个范式该跑的"，`'all'` 会把其余全部打开 ——
 * 包括能力没配、只会空转的规则。点名"额外打开了哪几条"，让"我全都要"变成可审计的选择。
 */
export function enableAllNotice(
  project: { enable?: unknown },
  preset: { enable?: unknown },
  rules: Rule[],
  overrides: ConfigOverrides,
): Diagnostic | null {
  const projectEnable = project.enable as string[] | 'all' | undefined
  const presetEnable = preset.enable as string[] | 'all' | undefined
  if (projectEnable !== 'all' || presetEnable === undefined || presetEnable === 'all') return null
  const baseline = new Set<string>(Array.isArray(presetEnable) ? presetEnable : [])
  const customIds = new Set((overrides.customRules ?? []).map((rule) => rule.id))
  const expanded = rules
    .map((rule) => rule.id)
    .filter((id) => !baseline.has(id) && !customIds.has(id))
  if (expanded.length === 0) return null
  return {
    code: 'enable-all-expanded',
    text:
      `项目层 enable:'all' 额外打开了 ${expanded.length} 条预设没给的规则：${expanded.join(', ')}` +
      '（这些规则的能力可能没配，0 命中也算"在判"；要收窄就写预设片段 { enable: [...] }）',
  }
}
