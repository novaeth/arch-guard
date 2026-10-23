import { wheelFingerprints } from '../../../data/wheel-fingerprints.js'
import type { WheelFingerprint } from '../../../data/wheel-fingerprints.js'
import { applyFingerprintOverrides } from '../../../engine/deps.js'
import type { FingerprintOverride } from '../../../engine/deps.js'

/**
 * **生效的指纹表** = 内置数据表 + 宿主自定义能力 + 本项目声明的覆盖（R-73 / R-154）。
 *
 * 规则只读这里，不直接读 `data/wheel-fingerprints.ts` —— 否则"项目能覆盖指纹"与"能登记自定义能力"
 * 会在两个消费者（P06 强指纹 / P07 弱指纹 + 命名指纹）里各实现一遍，迟早走偏。
 */
export function effectiveFingerprints(policy: {
  fingerprints?: readonly FingerprintOverride[]
  customCapabilities?: readonly WheelFingerprint[]
}): WheelFingerprint[] {
  const base = [...wheelFingerprints, ...(policy.customCapabilities ?? [])]
  return applyFingerprintOverrides(base, policy.fingerprints ?? [])
}
