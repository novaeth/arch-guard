// 合规：公开面 barrel 把默认导出再导出（`default as X`）—— 被导入名在事实里是 `default`，
// 走默认导出那一半，不该被 S45 报成"名字对不上"。
export { default as util } from '../lib/util'
