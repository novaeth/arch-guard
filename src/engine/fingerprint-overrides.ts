import { wheelFingerprints } from '../data/wheel-fingerprints.js'

/**
 * **指纹覆盖**（R-73）：项目对某个能力的指纹证据加 / 删、或放宽。
 *
 * 为什么需要：内置的轮子指纹表是通用判断 ——
 *   - **收紧**：企业规范只认内部实现，想让某条形态也命中；
 *   - **放宽**：项目里那个 `@org/utils` 其实很成熟，或某个形态已经是"项目认可的封装"，
 *     不该继续提示。
 *
 * **首选方案不在这里**（那是 `capabilities` 的活，一个事实只有一个出处）；
 * 这里只管"什么形态算手搓"与"这个能力允不允许自研"。
 *
 * 解析 / 校验从 `deps.ts` 拆出来（R-166）：那一份已经贴着 500 行上限，而"覆盖"这块
 * 本身内聚 —— `deps()`（预设）与 `depsPolicyFrom()`（运行期）必须读同一份。
 */
export interface FingerprintOverride {
  /** 能力标识（必须与内置表里的某个能力同名 —— 拼错会让这条覆盖静默失效） */
  capability: string
  /** 追加**强**指纹（单证据即报） */
  addSyntax?: string[]
  /** 删掉内置的强指纹（按 pattern 原文精确匹配） */
  removeSyntax?: string[]
  /** 追加**弱**指纹（需与命名指纹叠加） */
  addSoftSyntax?: string[]
  /** 删掉内置的弱指纹 */
  removeSoftSyntax?: string[]
  /** 覆盖该能力的常见 API 名清单（命名指纹那一半） */
  apiNames?: string[]
  /** 放宽 / 收紧「允许项目自研」：true → P06 降级为 warn */
  allowOwn?: boolean
  /** 改判"平台内置能力"（平台能力没有 import 可查 → 没有豁免） */
  platform?: boolean
  /** 覆盖推荐写法（进报告 hint） */
  hint?: string
}

const LIST_FIELDS = [
  'addSyntax',
  'removeSyntax',
  'addSoftSyntax',
  'removeSoftSyntax',
  'apiNames',
] as const

/** 指纹覆盖里会被当作**正则执行**的字段（remove* 只按原文匹配，但仍要求可编译） */
const PATTERN_FIELDS = ['addSyntax', 'removeSyntax', 'addSoftSyntax', 'removeSoftSyntax'] as const

export const BUILTIN_CAPABILITY_NAMES = new Set(wheelFingerprints.map((entry) => entry.capability))

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析 `deps({ fingerprints })` 的原始值：**形状错了就报**，不再静默丢弃。
 *
 * 为什么单独抽出来：以前只有 `deps()`（预设）会校验，运行期真正走的 `depsPolicyFrom()` 却把
 * 非法/未知覆盖静默丢掉 —— 宿主写错一个字母，门禁照常 ✔ 但那条覆盖根本没生效（R-166）。
 * 两条路现在读同一份解析结果。
 */
export function parseFingerprintOverrides(raw: unknown): {
  overrides: FingerprintOverride[]
  problems: string[]
} {
  const problems: string[] = []
  const overrides: FingerprintOverride[] = []
  if (raw === undefined) return { overrides, problems }
  if (!Array.isArray(raw)) {
    problems.push('fingerprints 必须是数组（每项 { capability, … }）')
    return { overrides, problems }
  }
  raw.forEach((item, index) => {
    if (!isPlainObject(item)) {
      problems.push(`fingerprints[${index}] 必须是对象`)
      return
    }
    const capability = item.capability
    if (typeof capability !== 'string' || capability.trim() === '') {
      problems.push(`fingerprints[${index}] 缺 capability（能力名）`)
      return
    }
    const override: FingerprintOverride = { capability }
    for (const field of LIST_FIELDS) {
      const value = item[field]
      if (value === undefined) continue
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        problems.push(`fingerprints[${index}].${field} 必须是字符串数组`)
        continue
      }
      // 空数组也要保留：`apiNames: []` 是"清空命名指纹"的合法写法（旧实现把它静默丢了）
      override[field] = [...value]
    }
    for (const field of ['allowOwn', 'platform'] as const) {
      const value = item[field]
      if (value === undefined) continue
      if (typeof value !== 'boolean') {
        problems.push(`fingerprints[${index}].${field} 必须是布尔值`)
        continue
      }
      override[field] = value
    }
    if (item.hint !== undefined) {
      if (typeof item.hint !== 'string') {
        problems.push(`fingerprints[${index}].hint 必须是字符串`)
      } else if (item.hint !== '') {
        override.hint = item.hint
      }
    }
    overrides.push(override)
  })
  return { overrides, problems }
}

/**
 * 覆盖的语义校验：能力名必须存在、pattern 必须能编译、**不能匹配空串**。
 *
 * 零长模式在 P06 会被空匹配保护跳过（静默零覆盖），在 P07 会命中任意位置（误报）——
 * 两种都不是可用的证据，所以配置期就拒绝。
 */
export function validateFingerprintOverrides(
  overrides: readonly FingerprintOverride[],
  customNames: Iterable<string> = [],
): string[] {
  const problems: string[] = []
  const known = new Set([...BUILTIN_CAPABILITY_NAMES, ...customNames])
  for (const override of overrides) {
    if (!known.has(override.capability)) {
      problems.push(
        `指纹覆盖指向不存在的能力「${override.capability}」` +
          `（内置能力与本次声明的自定义能力：${[...known].join(' / ')}）`,
      )
      continue
    }
    for (const field of PATTERN_FIELDS) {
      for (const pattern of override[field] ?? []) {
        let regex: RegExp
        try {
          regex = new RegExp(pattern)
        } catch {
          problems.push(`指纹覆盖 ${field} 里「${pattern}」不是合法正则 —— 这条覆盖永远不会命中`)
          continue
        }
        if ((field === 'addSyntax' || field === 'addSoftSyntax') && regex.test('')) {
          problems.push(`指纹覆盖 ${field} 里「${pattern}」会匹配空串（零长命中）—— 会命中任意位置`)
        }
      }
    }
  }
  return problems
}
