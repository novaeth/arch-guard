// 随机颜色不是 ID 生成 → unique-id 同行豁免（R-167）
export const randomColor = (): string => '#' + Math.random().toString(16).slice(2, 8)
