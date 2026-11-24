import { parseCss } from '../../../engine/css.js'
import type { Finding, Rule } from '../../../engine/types.js'
import { globToRegExp } from '../../../engine/util.js'

import { finding } from './structure-util.js'

/**
 * **H14 禁止注释**（R-172，R-173 起**默认开启**）。
 *
 * 场景：团队认为注释会腐烂（尤其是 AI 写的"// 导入 x"这类噪声），要求代码只靠命名与类型表达。
 * 它是**项目口味**，但默认值站在"禁注释"这一侧：`hygiene()` 一引入就判，保留注释才是显式决定 ——
 * 整条不想要写 `overrides.disable: ['H14']`（报告明列停用），个别文件用 `exceptions`。
 *
 * 边界：
 * - 判 **ts / js 家族与 css**（`.ts` / `.tsx` / `.mts` / `.cts` / `.js` / `.jsx` / `.mjs` / `.cjs`
 *   在扫描里同属 `kind: 'ts'`；CSS / SCSS / Less 按扩展名选解析语法）；JSON 没有注释语法，不在对象里；
 * - **生成物跳过**：`structure.generated` 命中的文件必须带 `@generated`（H13），与"禁止注释"天然冲突；
 * - 测试脚手架不判（`appliesTo: 'product'`）；
 * - 确实要保留的注释（许可证头 / 特殊指令）用 `exceptions` 声明 H14（写理由）。
 */
export const noComments: Rule = {
  id: 'H14',
  domain: 'hygiene',
  level: 'L2',
  severity: 'error',
  appliesTo: 'product',
  title: '禁止注释',
  hint: '本项目禁止注释（H14 默认开启）：删掉注释；确实要保留的（许可证头 / 特殊指令）用 overrides.exceptions 声明 H14 并写 reason；整个项目不采用零注释则 overrides.disable: ["H14"]',
  run: (ctx) => {
    const generated = (ctx.config.structure.generated ?? []).map(globToRegExp)
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (generated.some((pattern) => pattern.test(record.rel))) continue
      const comments =
        record.kind === 'ts'
          ? (ctx.facts.get(record.rel)?.comments ?? [])
          : record.kind === 'css'
            ? parseCss(record.rel, ctx.sourceOf(record.rel) ?? '').comments
            : []
      const first = comments[0]
      if (first === undefined) continue
      out.push(
        finding(
          'H14',
          record.rel,
          first,
          `文件里有 ${comments.length} 条注释（第一条在第 ${first.line} 行）：H14 默认禁止注释`,
          '删掉注释；确实要保留的（许可证头 / 特殊指令）用 exceptions 声明 H14 并写 reason（整个项目不采用零注释则 disable: ["H14"]）',
        ),
      )
    }
    return out
  },
}
