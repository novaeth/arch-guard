// 递归 clone 用 Object.keys / typeof === 'object'：补弱指纹后 → P07（R-167）
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as T
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      out[key] = deepClone((value as Record<string, unknown>)[key])
    }
    return out as T
  }
  return value
}
