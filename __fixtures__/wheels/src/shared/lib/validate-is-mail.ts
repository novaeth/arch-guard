// 自研校验：弱指纹（`.test(`）+ 命名指纹（isMail）→ P07（R-167）
export function isMail(value: string): boolean {
  return /^[^@]+@[^@]+\.[^@]+$/.test(value)
}
