/**
 * S16 合规样例（R-164）：**原始行数超阈值、代码行数不超** → 不该报。
 *
 * 本夹具的 fileLines = 40。这个文件原始 42 行，但其中十几行是这段说明与空行，
 * 代码行只有 31 行 —— 体积阈值量的是代码，不是注释厚度。
 *
 * 反例见同目录的 big.ts：它没有注释，代码行本身就超过阈值。
 * 两条一起钉住「违规必报 × 合规不报」，防止哪天又退回按原始行数判。
 */
const item01 = 1
const item02 = 2
const item03 = 3
const item04 = 4
const item05 = 5
const item06 = 6
const item07 = 7
const item08 = 8
const item09 = 9
const item10 = 10
const item11 = 11
const item12 = 12
const item13 = 13
const item14 = 14
const item15 = 15
const item16 = 16
const item17 = 17
const item18 = 18
const item19 = 19
const item20 = 20
const item21 = 21
const item22 = 22
const item23 = 23
const item24 = 24
const item25 = 25
const item26 = 26
const item27 = 27
const item28 = 28
const item29 = 29
const item30 = 30

export const commented = item01
