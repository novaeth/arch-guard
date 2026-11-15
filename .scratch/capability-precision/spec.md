# 能力指纹的精度与覆盖面

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-165）

- **跨行写法**：格式化工具把 `JSON.parse(JSON.stringify(x))` 拆成三行、把 `'?' + parts.join('&')`
  折成两行 → 逐行指纹一条都不命中，P06 显示通过。**现在：漏判。**
- **数字被当日期**：`amount.toLocaleString()` 是数字千分位的标准写法，却命中 datetime 强指纹
  → 报「手搓了 datetime 的活」并让人改用 dayjs。**现在：error 级误伤。**
- **打码被当千分位**：`phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')` 命中 number-format 强指纹。
  **现在：error 级误伤。**
- **推荐写法被当手搓**：`'?' + new URLSearchParams(parts).toString()` 用的就是首选平台 API，
  仍被 query-string 强指纹报。**现在：error 级误伤。**
- **统一封装被当轮子**：`export const formatDate = (x) => dayjs(x).format('YYYY-MM-DD')` 自己 import 了
  dayjs，P07 仍报「疑似自造轮子」。**现在：warn 级误伤。**
- **死声明**：`capabilities: { 'word-forms': 'pluralize' }` 在内置表里没有对应条目，P06 找不到就 `continue`
  —— 覆盖为零，而选型表还写着它。**现在：静默失能（本仓自己的配置就是这样）。**

## 背景与问题

P06 / P07 的判据是「强指纹 / 弱指纹 + 命名指纹」，但实现有三个结构性问题：

1. **逐行匹配**：跨行调用（格式化工具的默认输出）全部漏判 —— 已知边界，但代价越来越大。
2. **强指纹里混入了无法排除同形合法写法的模式**：`toLocaleString(` 分不清数字与日期；
   `replace(/\d{3}/…)` 分不清千分位与打码。它们在数据表里被标成"形态无歧义"，实际不是。
3. **声明与生效不对账**：能力名在内置表里不存在时没有任何提示；`platform` 能力又完全不做
   "同一行已经在用首选 API"的豁免，于是最推荐的写法被当成违规。

## 目标

- 指纹按**整份遮罩后的文件**匹配：跨行写法照报，行号取命中起始行；正则按行锚点语义编译（`gm`）。
- 平台能力在命中行 / 下一行匹配数据表的 `exemptSyntax` 时豁免（内置 query-string 声明 `URLSearchParams`，
  `'?' + new URLSearchParams(…)` 是推荐写法）。不做"首选方案名字出现在同一行"的通用推断：
  自定义能力可能把 `localStorage` 当首选，真违规 `localStorage.setItem(…)` 同样含这个名字。
- `toLocaleString(`（datetime）与"千分位泛正则"（number-format）从强指纹降为弱指纹。
- P07 跳过「文件已 import 首选方案」与「纯再导出名」；标 `appliesTo: 'product'`。
- 新增内置能力 `word-forms`（`pluralize`），并让配置里的能力名必须能落到生效表上：未知名字配置期报错。
- 每个行为都有「违规必报 × 合规不报」夹具。

## 非目标

- 不改 `capabilities` 的"声明才判"语义：不声明仍不跑 P06（不需要日期库的项目是正当的）。
- 不做类型推断（`toLocaleString` 的主人是 Date 还是 Number 静态判不出 → 降级而不是猜）。
- 不新增 notice code / `apiVersion`（能力名校验是配置期抛错，报告契约不变）。

## 验收标准

- `__fixtures__/wheels`：跨行 `JSON.parse(\n JSON.stringify(…)` 报 P06；跨行 `'?' +\n …` 报 P06。
- 同一夹具里 four 种合规写法（数字 `toLocaleString` / 打码 `replace(/\d{3}/)` /
  `'?' + new URLSearchParams(…)` / 包装 dayjs 的 `formatDate`）零命中。
- `word-forms` 的手抄不规则复数表报 P06；`import pluralize` 的文件不报。
- `deps({ capabilities: { datetme: 'dayjs' } })` 与 `depsPolicyFrom` 同一份参数都直接报错；
  对象形态登记的自定义能力名仍然合法。
- `pnpm check` 全绿（含狗粮：本仓 `word-forms` 声明从死声明变成真覆盖）。

## 边界与取舍

- 平台能力的同行豁免只看"首选 API 的末段名"（`structuredClone` / `URLSearchParams` / `NumberFormat`…），
  宁可少豁免：同行同时出现真违规时可能漏一条，换取推荐写法不再被误伤。
- 弱指纹降级意味着"匿名手搓千分位 / 匿名 `toLocaleString` 日期格式化"不再报 error；P07 仍能在
  有命名证据时给 warn —— 与"宁可漏报，不可误伤"一致。
- 整份匹配让 `\s*` 这类模式可以跨行；如果宿主自定义 pattern 依赖 `^`/`$`，`gm` 保持逐行语义。

## Comments

- 2026-11-15 用户要求「深度优化 capabilities，减少误判和判定覆盖面」→ 先审计出三类问题
  （跨行漏判 / 强指纹同形误伤 / 死声明），按上述六条落地。
