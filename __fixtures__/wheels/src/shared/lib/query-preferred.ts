// 合规：`'?' + new URLSearchParams(…)` 是推荐写法（首选 API 就在同一行）→ 不报 query-string
export const query = (parts: Record<string, string>): string =>
  '?' + new URLSearchParams(parts).toString()
