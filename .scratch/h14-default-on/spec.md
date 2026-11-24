# H14「零注释」默认开启

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-173；本规格取代 R-172 的「默认关闭」）

- 团队在 `arch.config.mjs` 里写了 `hygiene()`，看着规则清单里的 H14「禁止注释」，以为注释已经被拦。
- 实际 H14 还挂着一道 `requires: structure.noComments`：宿主没写 `params: { noComments: true }` 就不跑。
  AI 每轮继续写「// 导入 x」，门禁全绿 —— 这正是这条规则要防的噪声注释。
- 现在：默认关闭 + 隐式开关 `params.noComments`。默认值本身就是设计，多数接入者不会去逐条追问「为什么没跑」。

## 背景与问题

R-172 把「注释是不是噪声」判为**项目口味**，所以默认关闭、要求显式声明。实际使用里这个默认值把成本放错了地方：
想禁注释的团队（本工具的目标用户包括用 AI 写代码的团队）要发现并抄一个不在常规配置面上的参数；
而不是所有人都需要注释。默认开启后，**不要注释是默认，保留注释才是显式决定** —— 决策落在配置里、能被 review。

## 目标

- H14 **默认开启**：删除 `requires: ['structure.noComments']`，同时删除 `params.noComments` 这个开关
  （不留"能力门"和"参数开关"两份真相）。
- `hygiene()` 一引入，H14 就在 enable 名单里且没有能力门 → 真的参与判定。
- 要保留注释的项目走既有通道，不发明新概念：
  - 整条不想要 → `overrides.disable: ['H14']`（报告明列「显式停用」，不是静默通过）；
  - 只放某些文件（许可证头 / 生成物）→ `exceptions: [{ rule: 'H14', glob, reason }]`。
- 生成物（`structure.generated`）与测试脚手架不判的边界不变。
- 示例：`examples/minimal` 本来没有注释，H14 默认跑；`examples/full` / `examples/full-fsd` 用注释讲 R 编号，
  显式 `disable: ['H14']`（示例继续 0 finding）。

## 非目标

- 不判「注释写得好不好」（review 的事）。
- 不把注释分类成「许可证头 / 说明 / 噪声」：分类本身就是口味，且不可判定。
- 不保留 `params.noComments` 的兼容分支 —— 该参数只存在于 0.12.0 一个版本，且从未是默认值。

## 验收标准

- 单测：`H14` 不再有 `requires`；有注释 → 1 条 finding（汇总数 + 第一条行号）；无注释 / 生成物不报。
- `tests/stack.test.mjs`：能力齐全时 H14 **不再**出现在停用清单里。
- `tests/examples.test.mjs`：full / full-fsd 的 H14 来自显式 `disable`（不是 capability-missing）。
- 夹具 `__fixtures__/comments`：去掉 `params.noComments` 仍报 3 条（默认开的回归）。
- 示例实测：minimal 73/109 · full 102/109 · full-fsd 92/109，均 0 finding。
- `pnpm check` 全绿。

## 边界与取舍

- **默认开不是"口味变不变量"**：它仍可被整条停用或按文件豁免，只是默认值从"不判"翻成"判"。翻默认值要标破坏性。
- 示例显式停用 vs 逐文件 exceptions：示例的注释是**讲解载体**（每条都在解释对应的 R 编号），
  给几十个文件写 exceptions 只会让样板更难读；`disable` 一条就能表达「这份样板不采用零注释」。
- 保留 `requires` 并把默认值塞进预设 `params` 会留下「false 被报成能力未声明」的假自述；
  默认开启就该是规则层的默认，不是能力层的障眼法。

## Comments

- 2026-11-25 R-173：用户要求「零注释改为默认开启」；确认删除能力门，退出走 `disable` / `exceptions`。
