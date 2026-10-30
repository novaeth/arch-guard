import { resolveSpecifier } from '../../../engine/graph.js'
import type { Finding, Rule } from '../../../engine/types.js'

import { finding } from './structure-util.js'

/**
 * 导入 / 导出**名字对账**的规则（S45）。
 *
 * 与 `structure-graph` 那一组的区别：那组判**依赖方向**（谁能引谁），这条判**名字存不存在**
 * —— 路径解析得到、名字却对不上，是最容易发生、而此前完全没人管的一类假绿。
 */

/* ---------------- S45 本地 import 的具名成员必须真的被导出 ---------------- */

/**
 * 判据：路径能解析到项目里的某个文件，但导入的名字**不在它的导出集里** → 报。
 *
 * 为什么单列一条：这是**最容易发生、而此前完全没人管**的一类假绿 —— 目标文件存在、路径也没写错，
 * 只是名字没被导出：TS 编译不过 / 运行时 `undefined`，而架构门禁一路显示通过（实测：本仓示例里
 * 4 个 hook 这么引、另一个示例的测试引了不存在的常量，坏了很久没人知道）。
 *
 * 边界（宁少报不误伤）：目标解析不到（第三方 / 域外）不判 · 目标没有事实（CSS 等非 TS）不判 ·
 * 目标有 `export *` 时导出集未知（整条跳过，S11 本来也禁它）· `import * as ns` 不判名字。
 */
export const resolvableImports: Rule = {
  id: 'S45',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '导入的成员必须真的被导出',
  hint: '路径解析得到、名字却不存在：TS 编译不过 / 运行时 undefined —— 静态可判定，别等构建时才炸',
  run: (ctx) => {
    const files = new Set(ctx.records.map((record) => record.rel))
    const out: Finding[] = []
    for (const record of ctx.records) {
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      for (const imported of facts.imports) {
        if (imported.star) continue
        const target = resolveSpecifier(imported.spec, record.rel, ctx.config, files)
        if (target === null || target === record.rel) continue
        const targetFacts = ctx.facts.get(target)
        if (!targetFacts) continue
        if (targetFacts.exports.some((item) => item.isStar)) continue
        /**
         * `export default function App()` 在事实里是 `{ name: 'App', isDefault: true }` ——
         * 它**只有**默认导出，没有具名导出 `App`。所以两个集合要分开算：
         * 具名可导入集排除"带名字的 default"，默认导出看 `isDefault`（或 `name === 'default'`）。
         *
         * `export { default as X } from './x'`（以及 `import { default as X } from './x'`）在事实里
         * 被导入名是 **`default`**（`facts.ts` 取的是 `propertyName ?? name`），走的是默认导出那一半，
         * 不是具名导出集 —— 少了这个分支就会把"默认导出再导出"误报成"名字对不上"
         * （`export { default as X } from './x'` 是公开面 barrel 的标准写法）。
         */
        const named = new Set(
          targetFacts.exports
            .filter((item) => !item.isStar && !(item.isDefault && item.name !== 'default'))
            .map((item) => item.name),
        )
        const hasDefault = targetFacts.exports.some(
          (item) => item.isDefault || item.name === 'default',
        )
        for (const name of imported.names ?? []) {
          const ok = name === 'default' ? hasDefault : named.has(name)
          if (ok) continue
          out.push(
            name === 'default'
              ? finding(
                  'S45',
                  record.rel,
                  imported,
                  `默认导入在 ${target} 里没有 default 导出`,
                  `改成具名导入（或给 ${target} 加 default 导出）`,
                )
              : finding(
                  'S45',
                  record.rel,
                  imported,
                  `导入的 ${name} 在 ${target} 里没有导出：路径解析得到，名字对不上`,
                  `改成 ${target} 真正导出的名字，或把它加进那个文件的导出`,
                ),
          )
        }
        if (imported.hasDefault && !hasDefault) {
          out.push(
            finding(
              'S45',
              record.rel,
              imported,
              `默认导入在 ${target} 里没有 default 导出`,
              `改成具名导入（或给 ${target} 加 default 导出）`,
            ),
          )
        }
      }
    }
    return out
  },
}

export const structureImportRules: Rule[] = [resolvableImports]
