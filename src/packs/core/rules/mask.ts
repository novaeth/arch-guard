import type { Facts } from '../../../engine/types.js'

/**
 * **按注释区间把注释遮罩成等长空格（保留换行）** —— 全仓唯一实现。
 *
 * 为什么要有它：指纹类的判据（P06 手搓检测、H06 全局 API、依赖名对账）只看**真实代码**，
 * 注释里出现的示例（`// message.success('x')`）不该被当成调用。
 *
 * 以前有三份（`design-shared.maskTs` + `deps` / `deps-adapters` 各一份 `maskComments`），
 * 而且 `deps` 那份**多一层正则兜底**（facts 拿不到或没有注释区间时，用「块注释」正则兜）——
 * 合并时取并集：**有事实走事实、没有才走正则**，这样两边行为都不丢。
 */
export function maskTs(text: string, facts: Facts | undefined): string {
  if (facts && facts.comments.length > 0) {
    // 必须按 **UTF-16 下标**拆分：`facts.comments` 的 pos/end 来自 TS scanner（UTF-16 offset），
    // 而 `[...text]` 是**码点**数组 —— 文件里有一个 emoji 就会整体错位，注释后的首字符被吃掉
    // （实测 `// 😀\nJSON.parse(JSON.stringify(v))` 遮罩成 `SON.parse(...)`，P06 直接漏报）。
    const chars = text.split('')
    for (const comment of facts.comments) {
      for (let index = comment.pos; index < comment.end && index < chars.length; index += 1) {
        if (chars[index] !== '\n') chars[index] = ' '
      }
    }
    return chars.join('')
  }
  // 兜底：facts 拿不到（未解析 / 非 TS 文件）时按语法形态遮罩
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
}
