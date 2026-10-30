# 声明过的 barrel：公开面入口与生成物

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-160；写不出这一节的需求先不做）

- **库 / 包的公开面就是一份 barrel**：`library({ entry: ['index.ts'] })` 已经把 `src/index.ts` 声明为入口，
  它的内容就是 `export * from './engine/...'` 这类再导出 —— **现在** S11 对任何 `export *` 报 error，
  于是每个包都要为"这份 barrel 是契约本身"写一条例外（多一个包多一条，理由逐字重复）。
- **生成物里的再导出**：`structure.generated` 已经声明了生成目录（H13 也要求带 `@generated` 标记），
  但生成出来的 `client.ts` 里 `export *` 是**生成器的形状** —— **现在** S11 照报，宿主只能再写例外。
- **现在拦不拦得住**：S11 想防的是"随手造 barrel 造出依赖环"，而这两类文件的 barrel 是**声明**出来的；
  用 `exceptions` 逐文件放行 = 把"禁止 barrel"的默认收窄成"没人写例外时才禁止"，且例外会随包增长。

## 背景与问题

S11 是"禁 barrel 再导出"：`export *` 会把真实依赖藏起来，使依赖图不可判定。但 barrel 本身不都是坏味道 ——
**公开面入口**就是"对外只暴露这一面"的契约，**生成物**是机器生成的形状。S08 已经负责"barrel 造出依赖环"
那一半。把"哪类 barrel 合法"写成**声明**（角色 `entry` / `structure.generated`），S11 才有可判定的边界；
按文件名猜（`index.ts` 一律放行）则会把随手加的转发层也放进去。

## 目标

- `FileRecord` 带上 `entry`（来自角色 `entry: true` 或库范式 `slot: 'entry'`）。
- S11：`entry === true` 的文件放行；`structure.generated` 命中的文件放行；其余 `export *` 照报。
- 两条都是**声明驱动**：没声明就照报（不许按文件名猜），且文档写明边界。

## 非目标

- 不做"公开面里混逻辑"的判据（S23 已负责公开面的存在性与面值；S11 只管 `export *`）。
- 不放松 S08（依赖环）：公开面 barrel 造成的环照报。
- 不改 `library()` / `canonical()` 的角色表（`entry` 本来就已声明，只是没被带进 records）。

## 验收标准

- 夹具 `__fixtures__/generated-marker`（原只判 H13）加：生成物 `client.ts` 的 `export *`、公开面入口
  `src/modules/crews/index.ts` 的 `export *` —— 两者都不产生 S11，`exact: true` 保证多报即失败。
- 单测 `tests/public-face-barrels.test.mjs`：`entry` 放行 / `structure.generated` 放行 / 没声明照报 /
  生成目录在未声明时照报（"不猜文件名"）。
- 负例仍在：`__fixtures__/violations` 的 `src/shared/lib/helpers.ts`（非入口 `export *`）继续报 S11。
- `pnpm check` 全绿。

## 边界与取舍

- **只放行再导出的形状**：公开面里混逻辑不归 S11；S23③（面值）/ S19（宽度）另管。
- **生成物放行以 `structure.generated` 为准**：它同时是 H13 的声明源，两处不各写一份。
- 被否方案：`index.ts` 一切放行。否掉的理由：随手加的转发层正是 S11 要抓的；声明才是可审计的边界。

## Comments

- 2026-10-30：落地（records 带 `entry` + S11 两类声明放行 + 夹具/单测）；示例与夹具用合成名称，不引用外部项目信息。
