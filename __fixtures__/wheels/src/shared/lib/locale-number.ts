// 合规：数字的千分位展示 —— `toLocaleString` 同时是数字的合法写法，不该被当成手搓日期
export const money = (amount: number): string => amount.toLocaleString()
