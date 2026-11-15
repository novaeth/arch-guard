import { packageNameOf } from '../../../engine/graph.js'
import type { Facts } from '../../../engine/types.js'

/**
 * 指纹扫描的**行定位与豁免**（P06 / P07 共用，R-165）。
 *
 * 为什么需要：指纹从"逐行"改成"整份文件匹配"后，offset → 行号、以及"这一行已经用了首选 API"
 * 这类判断会同时出现在 P06 与 P07 里 —— 两份实现就是下一次漂移（本仓最防的形态）。
 */

/** 行首 offset 表（0 起）：整份文本匹配后把 offset 换回行号 */
export function lineStartsOf(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

/** offset → 1 起行号（二分；starts 升序） */
export function lineAt(starts: readonly number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if ((starts[mid] as number) <= offset) low = mid
    else high = mid - 1
  }
  return low + 1
}

/**
 * 命中行 / 下一行是否匹配任一条「已在用首选方案」的证据（数据表的 `exemptSyntax`）。
 *
 * 为什么不做"首选方案名字出现在同一行"的通用推断：自定义能力可能把 `localStorage` 当首选，
 * 而真违规 `localStorage.setItem(…)` 同样含这个名字 —— 通用推断会把真违规豁免掉（R-165）。
 */
export function lineMatchesAny(
  masked: string,
  starts: readonly number[],
  line: number,
  regexes: readonly RegExp[],
): boolean {
  if (regexes.length === 0) return false
  const from = starts[line - 1] as number
  const to = starts[line + 1] ?? masked.length
  const text = masked.slice(from, to)
  return regexes.some((regex) => regex.test(text))
}

/** 这个文件自己有没有 import 首选方案（平台能力没有 import 可查 → 永远 false） */
export function fileUsesPreferred(
  facts: Facts | undefined,
  preferred: string,
  platform: boolean | undefined,
): boolean {
  if (platform === true) return false
  return (facts?.imports ?? []).some(
    // `import type` 只借类型、不调用首选方案 —— 不能拿它当"已在使用"的证据（R-166）
    (item) => item.typeOnly !== true && packageNameOf(item.spec) === preferred,
  )
}
