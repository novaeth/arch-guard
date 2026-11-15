/**
 * 架构建议的**共享类型**（抽出来是为了断开 S08 依赖环：`advice.ts ↔ advice-groups.ts`）。
 *
 * 单列一个文件而不是互相 import：建议的两半（文件级 / 组级）都要用 `Advice` 与信号清单，
 * 谁 import 谁都会成环 —— 而环是自己门禁要报的东西（狗粮当场抓到了）。
 */

/** 稳定的信号 id：写进配置的 `adviceAllow` 与报告自述都用它（不是文案） */
export const ADVICE_SIGNALS = [
  'per-domain-exports',
  'group-granularity',
  'untested-logic-group',
  'peer-reuse',
  'group-chain-depth',
] as const

/** 一条候选建议：信号 id + 主体（文件 rel / 组名 / 环的成员）+ 给人看的文本 */
export interface Advice {
  signal: (typeof ADVICE_SIGNALS)[number]
  subject: string
  text: string
}
