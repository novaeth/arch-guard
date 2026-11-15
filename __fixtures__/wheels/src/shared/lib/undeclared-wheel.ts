// debounce-throttle 没有被声明：P07 不该对未声明能力发提示（与 P06 同口径）
export function debounce(fn: () => void): void {
  const timer = setTimeout(fn, 100)
  clearTimeout(timer)
}
