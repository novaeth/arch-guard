// 参数里有嵌套括号：有界匹配要能跨过去 → P06（R-167）
const pick = (value: unknown, _fallback: unknown): unknown => value

export const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(pick(a, b)) == JSON.stringify(pick(b, a))

export const encode = (value: unknown): string =>
  encodeURIComponent(String(value)) + '=' + String(value)
