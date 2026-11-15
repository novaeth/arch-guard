# 能力指纹的数据精度与覆盖（批 2 + 批 3）

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-167）

- **HTTP 头 / 格式常量**：`res.setHeader('Last-Modified', d.toUTCString())`、`<DatePicker format="YYYY-MM-DD" />`
  —— 都不是"手搓日期库"，却被 datetime 强指纹报 error（`toUTCString` 没有 dayjs 等价物）。
- **随机颜色**：`'#' + Math.random().toString(16).slice(2, 8)` 被 unique-id 当成手搓 UUID。
- **业务字典**：HR / 家谱数据 `{ person: 'people' }` 被 word-forms 当成手抄词形表。
- **JSON-safe 快照**：`localStorage.setItem(key, JSON.parse(JSON.stringify(x)))` 是刻意把值变成
  JSON 可序列化，却被 deep-clone 报 error（它此处不是 bug）。
- **漏判**：`process.argv.at(2)` / `for (const a of process.argv)`；参数里有嵌套括号的
  `JSON.stringify(pick(a, b)) == JSON.stringify(c)`、`encodeURIComponent(String(v)) + '='`；
  用 `Object.keys` / `typeof x === 'object'` 写的递归 clone；`isMail` 命名的校验函数。

## 目标

- 数据层：把 `toUTCString` / `YYYY-MM-DD` 降为弱指纹；unique-id 豁免随机颜色；
  word-forms 去掉强指纹（只在弱形态 + 自研同名时 P07）；deep-clone 对存储 API 同行豁免。
- 扫描范围：P06 只扫 ts —— CSS/SCSS 的 `//` 注释不再被当成代码（facts 只对 ts 提取）。
- 覆盖：cli-args 加 `.at` / `for...of` / 跨行点号；嵌套括号改有界匹配；递归 clone/equal 补弱指纹；
  debounce / validation 补常见命名。

## 非目标

- 不新增内置能力（`camel-case` / `html-escape` 等留到有真实宿主场景时再加）。
- 不做 P07 命名归一化（`useDebounce` 之外的前后缀需要事实模型级改动，先补数据表）。
- 不改 `Intl.DateTimeFormat` / `new Date('ISO')` 的判定（声明 dayjs 就该用 dayjs，属选型策略）。

## 验收标准

- `__fixtures__/wheels`：`datetime-tokens.ts` / `random-color.ts` / `word-forms-dict.ts` /
  `clone-for-storage.ts` 零命中；`argv-at.ts` / `nested-parens.ts` / `clone-recursive-keys.ts` /
  `validate-is-mail.ts` 命中；`word-forms.ts` 改由 P07 报。
- 单测：P06 对 `kind==='css'` 的合成记录零命中。
- `pnpm check` 全绿（含狗粮）。

## 边界与取舍

- 有界匹配 `[\s\S]{0,200}?` 只跨一个"合理表达式"；超过 200 字符的怪物参数仍会漏（宁可漏）。
- `localStorage` 豁免只看命中行 / 下一行；跨多行构造的 JSON 快照仍可能被报。
- word-forms 去掉强指纹后，"手抄表但没导出 apiNames" 不再提示 —— 与"宁可漏报，不可误伤"一致。

## Comments

- 2026-11-15 用户要求"一步到位"：把评估报告里的批 2（数据精度）与批 3（覆盖增强）一次做完。
