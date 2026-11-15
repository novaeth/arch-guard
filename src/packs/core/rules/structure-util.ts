import { TEST_LAYER_MIN } from '../../../engine/defaults.js'
import type { FileRecord } from '../../../engine/types.js'

/**
 * 声明驱动结构规则的**共用零件**：报错构造、角色目录推导、分桶。
 *
 * 抽出来的唯一理由是"分桶口径只有一处真相" —— S26 / S29 / S30 / S31 都按「层 + 父桶」看组，
 * 各写一遍迟早会走偏（比如一个按 captures 排序、另一个不排）。
 */

export { finding, type FindingPosition } from './finding.js'

/**
 * 单元目录：优先从角色 pattern 的 `dir/**` 形态取；pattern 不是这个形态时，
 * 退回"命中该角色的文件的公共目录"。两者都拿不到就跳过（宁少报不误报）。
 */
export function unitDirOf(
  roles: { id: string; pattern: string }[],
  roleId: string,
  records: { rel: string }[],
): string | null {
  const pattern = roles.find((role) => role.id === roleId)?.pattern
  const suffix = '/**'
  if (pattern?.endsWith(suffix)) return pattern.slice(0, -suffix.length)
  const dirs = records.map((record) => {
    const index = record.rel.lastIndexOf('/')
    return index === -1 ? '' : record.rel.slice(0, index)
  })
  const first = dirs[0]
  if (first === undefined) return null
  let common = first
  for (const dir of dirs) {
    while (common !== '' && !dir.startsWith(common)) {
      const index = common.lastIndexOf('/')
      common = index === -1 ? '' : common.slice(0, index)
    }
  }
  return common === '' ? null : common
}

/**
 * 角色 pattern 的**目录部分**（去掉 `/**`，或去掉文件名那一段），按路径段返回。
 * 例如 `src/pages/{slice}/ui/**` → `['src','pages','{slice}','ui']`；`src/a/index.ts` → `['src','a']`。
 */
export function dirPatternSegments(pattern: string): string[] | null {
  const suffix = '/**'
  const dir = pattern.endsWith(suffix)
    ? pattern.slice(0, -suffix.length)
    : pattern.slice(0, pattern.lastIndexOf('/'))
  const segments = dir.split('/')
  return segments.length >= 2 && segments[0] !== '' ? segments : null
}

/**
 * 角色 pattern 下**实际存在的单元目录**（S27）：把 pattern 的目录段按记录展开成真实路径。
 *
 * 为什么不能只用 `unitDirOf`：它把 `src/modules/{domain}/components/**` 直接去掉 `**`，
 * 得到带 `{domain}` 的字面路径 —— 拿它去匹配记录永远 0 命中，规则静默空转。
 * 这里按 pattern 的目录段数取每条记录的前 N 段：
 * `src/modules/{domain}/components/**` → `src/modules/crews/components`、`src/modules/orders/components`。
 * pattern 拿不到目录段时退回 `unitDirOf`（字面目录 / 公共目录），两者都拿不到就跳过。
 */
export function unitDirsOf(
  roles: { id: string; pattern: string }[],
  roleId: string,
  records: { rel: string }[],
): string[] {
  const pattern = roles.find((role) => role.id === roleId)?.pattern
  const segments = pattern === undefined ? null : dirPatternSegments(pattern)
  if (segments === null) {
    const dir = unitDirOf(roles, roleId, records)
    return dir === null ? [] : [dir]
  }
  const dirs = new Set<string>()
  for (const record of records) {
    const parts = record.rel.split('/')
    // 最后一段是文件名；目录段不够时说明这条记录不在角色目录下，跳过
    if (parts.length <= segments.length) continue
    // pattern 与路径对不上（角色表被改过 / 记录不是这条角色的）时跳过 —— 与 extraDirsOf 同口径
    if (!segments.every((segment, index) => segmentMatches(segment, parts[index] as string)))
      continue
    dirs.add(parts.slice(0, segments.length).join('/'))
  }
  return [...dirs].sort()
}

/** 一个路径段能否被 pattern 里的段匹配（`{name}` 匹配任意一段；`{a,b}` 按枚举匹配） */
export function segmentMatches(patternSegment: string, actual: string): boolean {
  if (!patternSegment.includes('{')) return patternSegment === '*' || patternSegment === actual
  const inner = patternSegment.slice(
    patternSegment.indexOf('{') + 1,
    patternSegment.lastIndexOf('}'),
  )
  const options = inner.split(',').map((item) => item.trim())
  if (options.length === 1) return true
  const suffix = patternSegment.slice(patternSegment.lastIndexOf('}') + 1)
  return options.some((option) => `${option}${suffix}` === actual)
}

/**
 * 文件路径里**超出角色 pattern 目录部分**的那些目录（相对根的全路径）。
 * pattern 与路径对不上（角色表被改过、pattern 形态奇特）时返回 `null` —— 宁少报不误报。
 */
export function extraDirsOf(rel: string, pattern: string): string[] | null {
  const expected = dirPatternSegments(pattern)
  if (expected === null) return null
  const dirs = rel.split('/').slice(0, -1)
  if (dirs.length < expected.length) return null
  for (const [index, segment] of expected.entries()) {
    const actual = dirs[index]
    if (actual === undefined || !segmentMatches(segment, actual)) return null
  }
  const out: string[] = []
  for (let index = expected.length; index < dirs.length; index += 1) {
    out.push(dirs.slice(0, index + 1).join('/'))
  }
  return out
}

export function bucketsOf(
  ctx: { records: FileRecord[] },
  dimension: string,
  layers: Set<number> | null = null,
): Map<
  string,
  { layer: number; bucket: string; anchor: string; names: Set<string>; ancestors: string[] }
> {
  const buckets = new Map<
    string,
    { layer: number; bucket: string; anchor: string; names: Set<string>; ancestors: string[] }
  >()
  for (const record of ctx.records) {
    if (record.layer >= TEST_LAYER_MIN) continue
    if (record.groupName !== dimension || !record.group) continue
    if (layers !== null && !layers.has(record.layer)) continue
    const captures = record.captures ?? {}
    const others = Object.keys(captures)
      .filter((name) => name !== dimension)
      .sort()
      .map((name) => `${name}=${captures[name]}`)
    const key = `${record.layer}|${others.join('&')}`
    const seen = buckets.get(key) ?? {
      layer: record.layer,
      bucket: others.join('&'),
      anchor: record.rel,
      names: new Set<string>(),
      // 祖先捕获值（如分组切片的 `{group}`）：完整切片路径 = 祖先段 + 叶子名，S29 要逐段比对
      ancestors: Object.keys(captures)
        .filter((name) => name !== dimension)
        .sort()
        .map((name) => captures[name] ?? '')
        .filter((value) => value !== ''),
    }
    if (record.rel < seen.anchor) seen.anchor = record.rel
    seen.names.add(record.group.slice(record.group.lastIndexOf('/') + 1))
    buckets.set(key, seen)
  }
  return buckets
}

/** 角色 pattern 的 `dir/**` 形态 → 目录；不是这个形态时返回 null */
export function dirOfPattern(pattern: string): string | null {
  return pattern.endsWith('/**') ? pattern.slice(0, -3) : null
}
