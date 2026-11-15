// 跨行解析：`new Date(` 与字面量被折成两行 —— 整份匹配仍要抓到（P06 datetime）
export const readDate = (): Date =>
  new Date(
    '2020-01-01',
  )
