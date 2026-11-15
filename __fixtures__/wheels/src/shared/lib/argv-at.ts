// argv 的 `.at()` 与 `for...of` 同样是手写 argv 解析 → P06（R-167）
export const third = process.argv.at(2)

export function flags(): string[] {
  const out: string[] = []
  for (const arg of process.argv) out.push(arg)
  return out
}
