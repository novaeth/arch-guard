# S47 组级依赖环（建议升门禁）

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-170）

- 两个切片 / 域互相经公开面引用（FSD 里两个切片互开 `@x`）。文件级可能没有环，所以 S08 看不见。
  报告里只有一条"架构建议"：AI 读到也不会改 —— 它的目标是让门禁通过，不是让建议消失。
- 结果是组级成环后两边再也拆不开，而门禁全绿；退化只能靠人 review（人不会看）。

## 背景与问题

建议层（`pushAdviceNotices`）明确"永不阻断"，这在有人的场景里是合理的；但本工具面向 AI，
非阻断信号不在 AI 的必做项里（R-169 同一条理由）。组级环是**图属性**，没有口味成分，
与"该不该跟域走"那类判断不同 —— 它应该和 S08 文件级环一样是红线。

## 目标

- 新增 **S47**（L3 / error）：组边图里的环逐条报；测试 / 组外文件不计；单文件环仍归 S08。
- 发现项标 `global`：`--scope=changed` 默认仍阻断；合法双向依赖用 `exceptions`（`rule: 'S47'`）。
- 建议层不再报同一事实：从 `ADVICE_SIGNALS` 移除 `group-cycles`，组图逻辑抽到
  `src/engine/group-graph.ts` 供规则与建议共用。
- 夹具 `__fixtures__/structure-groups` 补「组级环但文件级无环」；单向依赖不报。

## 非目标

- 不把其余建议信号升门禁（`per-domain-exports` / `group-granularity` / `untested-logic-group` /
  `peer-reuse` / `group-chain-depth` 都是判断，升了会误伤）。
- 不改 S08 的文件级环语义，也不把组级环并进 S08（例外粒度会连带豁免文件级环）。
- 不新增默认阈值：组级环没有"多少算多"。

## 验收标准

- 单测：A ↔ B 组级互相依赖 → 1 条 S47（global）；单向 → 0 条；测试文件不进组。
- 夹具：`__fixtures__/structure-groups` 的 a/b 两组经 `A1→B1`、`B2→A2` 成组级环但文件级无环，
  S47 必报；单向的 crews/empty 不报。
- 建议层：`group-cycles` 信号不再产出建议；`adviceAllow` 里写它 → 配置期报错（破坏性，已记 CHANGELOG）。
- `pnpm check` 全绿（规则总数 107 → 108，三个示例的启用数同步）。

## 边界与取舍

- 组级环只在声明了组维度（`groupName` + `group`）的项目里有意义；没有组就 0 条。
- 合法双向依赖（确实互相需要）用 `exceptions` 声明，不发明新的豁免语言。
- 移除建议信号是破坏性配置变更：`adviceAllow` 的 `group-cycles` 条目改为 `exceptions` 的 S47。

## Comments

- 2026-11-15 R-170：从 R-124 的建议信号升格；其余五条建议保留。
