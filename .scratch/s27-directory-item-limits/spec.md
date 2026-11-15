# S27 目录子项数上限：参数化角色与增量模式

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-168）

- 宿主用 `canonical()`，`views/` / `components/` 按域分开；某天 `src/modules/crews/components/` 堆到 20 个文件，
  宿主按文档在 `structure.directoryItemLimits` 里声明 `{ role: 'module:components', max: 15 }`，
  门禁仍然全绿 —— 因为角色 pattern 带 `{domain}`，S27 把 `src/modules/{domain}/components` 当字面目录，
  0 命中后静默跳过。**现在：不会报。**
- 同一个目录已经超限，但这次只改了其中一个文件、用 `--scope=changed` 跑：S27 锚在目录内字典序第一个文件上，
  那个文件多半不在变更集里，于是发现项被过滤掉。**现在：不报（增量模式下）。**

## 背景与问题

S27 的判据本身没问题（一级子项超过声明上限就报），问题在"哪个目录"和"报给谁"：

1. `unitDirOf` 对 `.../**` 直接去掉 `**`，返回 pattern 的字面目录。带捕获（`{domain}` / `{slice}` / `{segment}`）
   的角色因此得到一个不存在的路径，`members` 为空 → `continue`。canonical 的 `module:*` 与 FSD 的
   layer / slice 角色全部中招，只有 `fsd:shared:lib` 这类字面目录能工作。
2. 发现项不是 `global`，而 `--scope=changed` 只保留 `file` 在变更集里的发现项；目录级谓词锚在旧文件上，
   新增文件把目录顶爆时反而看不见。

## 目标

- 参数化角色按**实际目录**分别计数：`src/modules/{domain}/components/**` 展开成每个域的真实 `components/` 目录。
- 目录级发现项标记为 `global`，在 `--scope=changed` 下默认仍阻断（`--local-only` 才跳过，并按既有约定自述条数）。
- 保持既有口径：一级子项 = 文件 + 子目录；`foldersOnly: true` 只数子目录；literal 角色的行为不变。

## 非目标

- 不新增默认预算：预设仍不给 S27 默认值，阈值由宿主声明（"多少算多"随目录种类变化，见 R-167 的取舍）。
- 不新增规则、不改规则 id / 等级 / 严重度。
- 不改变"按角色声明"的入口形状（`structure.directoryItemLimits`）。

## 验收标准

- `unitDirsOf`：literal 角色返回单目录；`{domain}` 角色按记录展开成多个实际目录；目录段不够时跳过。
- S27 单测：参数化角色下，超限的域报一条、未超限的域不报；锚点是该目录内字典序最小的文件。
- 夹具 `__fixtures__/structure-limits`：`pages:ui`（`src/pages/{slice}/ui/**`）上限 1，
  `a` 切片 2 个文件 → 必报；`b` / `c` 各 1 个 → 不报；`parts` 的既有断言不变。
- `pnpm check` 全绿。

## 边界与取舍

- 多个角色解析到同一实际目录时仍会各报一条（既有语义，不在这次收口）。
- S27 只数数量，不判断"该不该合并"；默认值仍是宿主决策（N-03 的边界）。
- `global` 意味着 `--paths` 会过滤它并打出 notice —— 目录级问题本来就需要全量运行，这与 S24 一致。

## Comments

- 2026-11-15 由 R-168 落盘：先修"声明了也不生效"，默认预算另立需求。
