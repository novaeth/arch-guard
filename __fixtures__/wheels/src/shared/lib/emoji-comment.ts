// 注释之前的 emoji 会让码点下标整体左移：下面的注释会被露出来（误报 P06）
export const faces =
  '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀'
// JSON.parse(JSON.stringify(value)) 是禁止写法
export const clone = <T>(value: T): T => structuredClone(value)
