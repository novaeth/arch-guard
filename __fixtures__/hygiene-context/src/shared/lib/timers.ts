/**
 * S15 样例：孤儿文件。
 *
 * 这里刻意不用 `debounce` / `throttle` 这类与成熟库同名的导出名 —— 那会叠加成 P07
 * （弱指纹 `setTimeout(` + 命名指纹），而本夹具只声明了 S15 一条期望。
 */
export function poll(fn: () => void, wait: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(fn, wait)
  }
}

/** H08 正例：真的内网地址照报。 */
export const lanAddress = '10.12.0.5'
