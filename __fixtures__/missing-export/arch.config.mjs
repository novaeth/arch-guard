import { canonical } from '../../es/index.js'

/**
 * 场景：**路径解析得到，名字却不存在**（S45）。
 *
 * 违规：`import { Good } from '../shared/lib/util'` 里 `Good` 不存在（`util.ts` 导的是 `helpful`）。
 * 合规（宁少报不误伤的五条边界）：默认导出对得上 · `export { default as X } from` 的
 * 被导入名是 `default`（走默认导出判定，不报）· `import * as ns` 不判名字 ·
 * CSS Module / 非 TS 目标没有事实可判 · 目标有 `export *` 时导出集未知（整条跳过）。
 */
export default {
  presets: [canonical()],
  overrides: { enable: ['S45'], ignore: ['arch.config.mjs', 'expect.json'] },
}
