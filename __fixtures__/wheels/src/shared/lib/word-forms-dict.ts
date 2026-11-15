// 业务字典（HR）：数据里有不规则复数，但不是自研词形表 → 不报（R-167）
export const headcount: Record<string, string> = {
  person: 'people',
  child: 'children',
}
