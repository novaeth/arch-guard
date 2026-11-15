// 跨行写法：格式化工具会把深拷贝拆成多行 —— 整份匹配要能抓到（P06），逐行扫描会漏
export const clone = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value),
  )
