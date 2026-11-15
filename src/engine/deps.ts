import { existsSync, readFileSync } from 'node:fs'

import type { WheelFingerprint } from '../data/wheel-fingerprints.js'
import {
  BUILTIN_CAPABILITY_NAMES,
  isPlainObject,
  parseFingerprintOverrides,
  validateFingerprintOverrides,
  type FingerprintOverride,
} from './fingerprint-overrides.js'
import { builtinModules } from 'node:module'
import { join } from 'node:path'

export type { FingerprintOverride } from './fingerprint-overrides.js'

/**
 * 依赖纪律的数据层：读取项目的依赖事实 + 把 config.params 里的策略解析成强类型。
 *
 * 三个字段的语义（见 PARADIGM.md §12）：
 * - allow        运行时依赖白名单（约束 package.json 的 dependencies）
 * - deny         明确禁用（命中即错，与 allow 无关）
 * - capabilities 能力 → 首选方案（约束**代码形态**：别手搓）
 */

export interface ProjectDeps {
  /** 项目根有没有 package.json；没有就整体跳过依赖类规则 */
  hasManifest: boolean
  /** dependencies 里的包名 */
  runtime: string[]
  /** devDependencies 里的包名（工具链，不占运行时白名单） */
  dev: string[]
  /** peerDependencies 里的包名 */
  peer: string[]
  /** 三者并集 */
  declared: Set<string>
  /** 源码里真实 import 的第三方包 */
  imported: Set<string>
  /** import 了但没在任何 dependencies 段声明（幽灵依赖） */
  phantom: string[]
  /** 声明了但全项目零引用 */
  unused: string[]
}

/**
 * **自定义能力**（R-154）：`deps({ capabilities })` 的对象形态。
 *
 * 内置能力由 `data/wheel-fingerprints.ts` 提供证据；宿主自己那套（企业请求层 / 事件总线 / 内部库）
 * 没有内置条目，就用对象形态把「首选方案 + 证据 + 推荐写法」一次说完。
 * 落进生效表后与内置能力同形，P06 / P07 不区分来源。
 */
export interface CustomCapability {
  /** 首选方案（包名，或 `platform: true` 时的平台内置 API 名） */
  preferred: string
  /** 强指纹：单证据即报（形态无歧义） */
  syntax?: string[]
  /** 弱指纹：需与 `apiNames` 叠加（P07 的两类证据） */
  softSyntax?: string[]
  /** 命中行 / 下一行出现这些形态时豁免：已经在该处使用首选方案（如 `URLSearchParams`，R-165） */
  exemptSyntax?: string[]
  /** 该能力的常见公开 API 名（命名指纹，大小写不敏感） */
  apiNames?: string[]
  /** 平台内置：没有 import 可查 → 命中即报，且不要求出现在 `allow` 里 */
  platform?: boolean
  /** 允许项目自研：P06 降级为 warn */
  allowOwn?: boolean
  /** 报错时给的可执行写法 */
  hint: string
  note?: string
}

/** `capabilities` 的值：字符串 = 只声明首选（证据沿用内置表）；对象 = 连证据一起登记 */
export type CapabilityDeclaration = string | CustomCapability

export interface DepsPolicy {
  allow: string[]
  deny: string[]
  capabilities: Record<string, string>
  /**
   * 自定义能力的完整定义（与内置表同形）。
   *
   * 为什么和 `capabilities` 分开放：下游（P06 / P07 / 文档）要的仍然是「能力 → 首选方案」这张简单表；
   * 指纹证据只在构造生效表时用。两份数据由 `parseCapabilities` 从同一个对象一次拆出，不会各写一半。
   */
  customCapabilities: WheelFingerprint[]
  fingerprints: FingerprintOverride[]
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/**
 * 把覆盖作用到指纹表上：**加**在原有之后、**删**按 pattern 原文精确匹配。
 * 纯函数、不改入参（数据表是模块级常量，改它就会污染同一进程里的其它宿主）。
 */
export function applyFingerprintOverrides(
  base: readonly WheelFingerprint[],
  overrides: readonly FingerprintOverride[],
): WheelFingerprint[] {
  if (overrides.length === 0) return [...base]
  const byCapability = new Map(overrides.map((item) => [item.capability, item]))
  return base.map((entry) => {
    const override = byCapability.get(entry.capability)
    if (!override) return { ...entry }
    const merge = (current: string[] | undefined, add?: string[], remove?: string[]): string[] => {
      const removed = new Set(remove ?? [])
      return [...(current ?? []).filter((pattern) => !removed.has(pattern)), ...(add ?? [])]
    }
    return {
      ...entry,
      syntax: merge(entry.syntax, override.addSyntax, override.removeSyntax),
      softSyntax: merge(entry.softSyntax, override.addSoftSyntax, override.removeSoftSyntax),
      ...(override.apiNames ? { apiNames: [...override.apiNames] } : {}),
      ...(override.allowOwn !== undefined ? { allowOwn: override.allowOwn } : {}),
      ...(override.platform !== undefined ? { platform: override.platform } : {}),
      ...(override.hint !== undefined ? { hint: override.hint } : {}),
    }
  })
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export function readPackageJson(root: string): PackageJson | null {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

/** 依赖事实：声明了什么、真实用了什么、两边对不上的（幽灵 / 死依赖） */
export function readProjectDeps(root: string, imported: Iterable<string>): ProjectDeps {
  const manifest = readPackageJson(root)
  const pkg = manifest ?? {}
  const runtime = Object.keys(pkg.dependencies ?? {})
  const dev = Object.keys(pkg.devDependencies ?? {})
  const peer = Object.keys(pkg.peerDependencies ?? {})
  const declared = new Set([...runtime, ...dev, ...peer])
  // Node 内置模块不是依赖（node:fs / fs / node:test …）
  const importedSet = new Set(
    [...imported].filter((name) => !name.startsWith('node:') && !builtinModules.includes(name)),
  )
  return {
    // 清单文件是否存在（存在但没声明依赖，仍是有效事实：所有 import 都是幽灵）
    hasManifest: manifest !== null,
    runtime,
    dev,
    peer,
    declared,
    imported: importedSet,
    phantom: [...importedSet].filter((name) => !declared.has(name)).sort(),
    // 只报运行时依赖的"声明未用"：dev 与 peer 可能只给工具链用
    unused: runtime.filter((name) => !importedSet.has(name)).sort(),
  }
}

function readStringArray(
  raw: Record<string, unknown>,
  field: string,
  capability: string,
  problems: string[],
): string[] {
  const value = raw[field]
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    problems.push(`自定义能力「${capability}」的 ${field} 必须是字符串数组`)
    return []
  }
  return value as string[]
}

function checkPatterns(
  capability: string,
  field: string,
  patterns: readonly string[],
  problems: string[],
): void {
  for (const pattern of patterns) {
    let regex: RegExp
    try {
      regex = new RegExp(pattern)
    } catch {
      problems.push(
        `自定义能力「${capability}」的 ${field} 里「${pattern}」不是合法正则 —— 这条证据永远不会命中`,
      )
      continue
    }
    if (regex.test('')) {
      problems.push(
        `自定义能力「${capability}」的 ${field} 里「${pattern}」会匹配空串（零长命中）—— 会命中任意位置`,
      )
    }
  }
}

interface ParsedCapability {
  preferred?: string
  fingerprint?: WheelFingerprint
  problems: string[]
}

/**
 * 解析一个能力声明。字符串形态（老写法）只取首选方案；对象形态顺便校验证据。
 *
 * 非字符串、非对象的值保持**历史行为**：直接忽略（`depsPolicyFrom` 的调用方可能是旧配置）。
 * 对象形态是新契约，写错了不忽略 —— 由调用方决定抛错（`deps()` / `depsPolicyFrom`）。
 */
function parseCapability(name: string, value: unknown): ParsedCapability {
  const problems: string[] = []
  if (typeof value === 'string') {
    if (value.trim() === '') problems.push(`能力「${name}」的首选方案不能为空`)
    return { preferred: value, problems }
  }
  if (!isPlainObject(value)) return { problems }

  if (BUILTIN_CAPABILITY_NAMES.has(name)) {
    problems.push(
      `「${name}」是内置能力，不能用对象形态重新定义；改它的证据请用 deps({ fingerprints: [...] })`,
    )
  }

  const preferred = value.preferred
  if (typeof preferred !== 'string' || preferred.trim() === '') {
    problems.push(`自定义能力「${name}」的 preferred 必须是非空字符串（这个能力必须用哪个方案）`)
  }
  const hint = typeof value.hint === 'string' ? value.hint : ''
  if (hint.trim() === '') {
    problems.push(`自定义能力「${name}」缺 hint：报错必须告诉人怎么改（写成可粘贴的写法）`)
  }

  const syntax = readStringArray(value, 'syntax', name, problems)
  const softSyntax = readStringArray(value, 'softSyntax', name, problems)
  const apiNames = readStringArray(value, 'apiNames', name, problems)
  const exemptSyntax = readStringArray(value, 'exemptSyntax', name, problems)
  checkPatterns(name, 'syntax', syntax, problems)
  checkPatterns(name, 'softSyntax', softSyntax, problems)
  checkPatterns(name, 'exemptSyntax', exemptSyntax, problems)

  if (syntax.length === 0) {
    if (softSyntax.length === 0) {
      problems.push(`自定义能力「${name}」没有任何指纹：至少给 syntax，或 softSyntax + apiNames`)
    } else if (apiNames.length === 0) {
      problems.push(`自定义能力「${name}」只有 softSyntax：P07 需要弱指纹 + apiNames 两类证据`)
    }
  } else if (softSyntax.length > 0 && apiNames.length === 0) {
    problems.push(
      `自定义能力「${name}」的 softSyntax 没有 apiNames 配对 —— P07 永远读不到这条命名证据`,
    )
  }
  if (apiNames.length > 0 && softSyntax.length === 0) {
    problems.push(`自定义能力「${name}」的 apiNames 没有 softSyntax 配对 —— 只有命名证据不会命中`)
  }

  if (value.platform !== undefined && typeof value.platform !== 'boolean') {
    problems.push(`自定义能力「${name}」的 platform 必须是布尔值`)
  }
  if (value.allowOwn !== undefined && typeof value.allowOwn !== 'boolean') {
    problems.push(`自定义能力「${name}」的 allowOwn 必须是布尔值`)
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    problems.push(`自定义能力「${name}」的 note 必须是字符串`)
  }

  if (problems.length > 0 || typeof preferred !== 'string') return { problems }

  const fingerprint: WheelFingerprint = {
    capability: name,
    preferred: [preferred],
    hint,
    ...(syntax.length > 0 ? { syntax } : {}),
    ...(softSyntax.length > 0 ? { softSyntax } : {}),
    ...(exemptSyntax.length > 0 ? { exemptSyntax } : {}),
    ...(apiNames.length > 0 ? { apiNames } : {}),
    ...(value.platform === true ? { platform: true } : {}),
    ...(value.allowOwn === true ? { allowOwn: true } : {}),
    ...(typeof value.note === 'string' && value.note !== '' ? { note: value.note } : {}),
  }
  return { preferred, fingerprint, problems }
}

/**
 * 把 `deps({ capabilities })` 的原始值拆成「能力 → 首选」与「自定义能力定义」。
 *
 * 单一出处：`deps()` 用它做配置期校验，`depsPolicyFrom()` 用它构造策略 —— 两条路读同一份问题清单，
 * 不会出现「预设说合法、引擎不认」。
 */
export function parseCapabilities(raw: unknown): {
  capabilities: Record<string, string>
  customCapabilities: WheelFingerprint[]
  problems: string[]
} {
  const capabilities: Record<string, string> = {}
  const customCapabilities: WheelFingerprint[] = []
  const problems: string[] = []
  if (!isPlainObject(raw)) return { capabilities, customCapabilities, problems }

  // 对象形态登记的名字（即使该条目本身有错）—— 字符串形态引用它时不该再报"未知能力"（一次错报一处）
  const registered = new Set(
    Object.entries(raw)
      .filter(([, value]) => isPlainObject(value))
      .map(([name]) => name),
  )

  for (const [name, value] of Object.entries(raw)) {
    const parsed = parseCapability(name, value)
    problems.push(...parsed.problems)
    if (parsed.problems.length > 0 || parsed.preferred === undefined) continue
    capabilities[name] = parsed.preferred
    if (parsed.fingerprint) customCapabilities.push(parsed.fingerprint)
  }

  // R-165：能力名必须能落到生效表上。否则 P06 在内置指纹表里找不到条目就 `continue` ——
  // 覆盖为零，而报告与 `--render-docs` 的选型表照样显示它（本仓自己的 `word-forms` 就曾这样静默失效）。
  for (const name of Object.keys(capabilities)) {
    if (BUILTIN_CAPABILITY_NAMES.has(name) || registered.has(name)) continue
    problems.push(
      `能力「${name}」没有内置指纹，也没有在同一次 deps({ capabilities }) 里用对象形态登记证据 —— ` +
        `P06/P07 会静默跳过它。内置能力：${[...BUILTIN_CAPABILITY_NAMES].join(' / ')}`,
    )
  }
  return { capabilities, customCapabilities, problems }
}

export function depsPolicyFrom(params: Record<string, unknown>): DepsPolicy {
  const parsed = parseCapabilities(params.capabilities)
  const fingerprints = parseFingerprintOverrides(params.fingerprints)
  const customNames = parsed.customCapabilities.map((entry) => entry.capability)
  const problems = [
    ...parsed.problems,
    ...fingerprints.problems,
    ...validateFingerprintOverrides(fingerprints.overrides, customNames),
  ]
  if (problems.length > 0) {
    throw new Error(`依赖策略配置错误：\n  - ${problems.join('\n  - ')}`)
  }
  return {
    allow: asStringArray(params.allow),
    deny: asStringArray(params.deny),
    capabilities: parsed.capabilities,
    customCapabilities: parsed.customCapabilities,
    fingerprints: fingerprints.overrides,
  }
}

/**
 * 策略自洽性检查：**配置自相矛盾必须报错，不能默默按某一侧生效**。
 * 例如：把某能力的首选库同时写进 deny。
 */
export function policyConflicts(
  policy: DepsPolicy,
  platformCapabilities: Iterable<string> = [],
): string[] {
  const platform = new Set(platformCapabilities)
  // 自定义能力也可以声明 `platform: true`（首选是平台内置 API）—— 它同样不是依赖，
  // 不要求出现在 allow 里。只看内置表就会把这类能力误报成「首选不在白名单」。
  for (const entry of policy.customCapabilities ?? []) {
    if (entry.platform === true) platform.add(entry.capability)
  }
  // `fingerprints` 的 platform 覆盖同样要认（R-166）：宿主把某能力改成平台内置 / 取消平台身份时，
  // 对账不能还按旧身份算 —— 否则运行期误抛「首选不在 allow」。
  for (const override of policy.fingerprints ?? []) {
    if (override.platform === true) platform.add(override.capability)
    else if (override.platform === false) platform.delete(override.capability)
  }
  const conflicts: string[] = []
  for (const [capability, preferred] of Object.entries(policy.capabilities)) {
    if (platform.has(capability)) continue // 平台内置（structuredClone / Intl / URLSearchParams…）不是依赖
    if (policy.deny.includes(preferred)) {
      conflicts.push(`能力 ${capability} 的首选是 ${preferred}，但它同时出现在 deny 里`)
    }
    if (policy.allow.length > 0 && !policy.allow.includes(preferred)) {
      conflicts.push(`能力 ${capability} 的首选是 ${preferred}，但它不在 allow 白名单里`)
    }
  }
  return conflicts
}
