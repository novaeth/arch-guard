# 能力指纹加固（批 0 + 批 1）

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-166）

- **emoji 注释**：文案/夹具里写 `// 😀 别用 JSON.parse(JSON.stringify(x))`，下一行就是真实深拷贝 ——
  遮罩按码点算，注释后首字符被吃掉 → P06 漏报；反过来注释里的指纹可能被报。**现在：会错位。**
- **P07 口径**：宿主没声明任何能力（`capabilities: {}`），P07 仍对 `deepEqual` 提示「疑似自造轮子」；
  声明 `datetime: 'date-fns'` 并 import date-fns，P07 仍按内置 dayjs 判「没在用首选」。
  **现在：P06 与 P07 不是同一套口径。**
- **覆盖写错**：`fingerprints: [{ capability: 'datetme' }]` 静默无效；坏正则在规则执行时才崩；
  `platform: true` 的覆盖改不动 `policyConflicts`，运行期误抛「首选不在 allow」。
  **现在：`deps()` 报、`depsPolicyFrom` 不报，两条路不一致。**

## 背景与问题

三轮评估确认：R-165 的整份匹配方向正确，但机制层还有四处裂缝 —— 遮罩单位错位、P07 未跟随
声明能力与宿主 preferred、覆盖校验只在一半入口生效、若干小口径（typeOnly / 零长 / 行号）。

## 目标

- `maskTs` 按 UTF-16 下标遮罩，emoji / 增补平面字符不影响任何指纹判定。
- P07 只判 `capabilities` 里声明过的能力；import 豁免用宿主声明的 preferred。
- `deps()` 与 `depsPolicyFrom` 共用一份 fingerprints 校验：形状 / 未知能力 / 坏正则 / 零长模式。
- `policyConflicts` 认 `fingerprints[].platform`（true 并入、false 剔除）。
- `import type` 不算"在用首选"；P06 行号取全文最早命中；P07 跳过零长匹配。

## 非目标

- 不动数据层指纹（`toUTCString` / `YYYY-MM-DD` / 随机颜色等留到批 2）。
- 不扩大 `exemptSyntax` 的行窗口（刻意近似，扩大会放过无关写法）。
- 不把 P07 的命名匹配做前缀/后缀归一（需要事实模型级别的改动）。

## 验收标准

- `__fixtures__/wheels`：`emoji-spill.ts` 报 P06；`emoji-comment.ts` 不报；`type-only-dayjs.ts` 报 P06；
  `undeclared-wheel.ts` 不报 P07。
- 单测：P07 在 `capabilities` 未声明时不跑；宿主 preferred 为 date-fns 时 import date-fns 豁免；
  `depsPolicyFrom` 对未知能力 / 坏正则 / 非数组 / 零长模式抛错；`policyConflicts` 认 platform 覆盖。
- `pnpm check` 全绿（含狗粮）。

## 边界与取舍

- `maskTs` 改 `text.split('')` 是 O(n) 的 UTF-16 数组；与 `facts-syntax` 的遮罩实现单位一致。
- `depsPolicyFrom` 变严格后，既有坏配置会在加载期报错（fail-closed）；`deps()` 早就是这样。
- 零长模式一律拒绝：它在 P06 会静默跳过、在 P07 会命中任意位置 —— 两种都不是可用证据。

## Comments

- 2026-11-15 三轮评估（误判 / 覆盖 / 健壮性 → 独立复现 → 修复方案评审）后，用户批准先做批 0 + 批 1。
