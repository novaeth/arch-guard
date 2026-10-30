# 渐进接入：逐规则严重度 + 间接测试覆盖

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-162；写不出这一节的需求先不做）

- **刚接进门禁的项目有一批历史债**：M08（该有测试的文件必须有测试）在存量项目上一报就是几十条；
  宿主只有两个极端选择 —— 保持 error（门禁全红、没人能合代码）或 `disable: ['M08']`（连"哪些文件
  还欠测试"都看不见了，还债没有进度条）。想"先看见、暂不拦"只能整轮 `--report-only`（把别的规则也一起放过）。
- **测试只测公开面，M08 却按"文件有没有被测试直接 import"算**：`shared/api/index.ts` 的 `export *`
  把实现再导出，测试 import 的是这个 barrel —— 实现明明被测试覆盖了，M08 照报"没有测试"。
  宿主只能把 `requireTestsFor` 收缩成"每个文件都直连测试"，那不是更严，是更假。

## 背景与问题

两条都是"门禁只认一种接入形态"的问题：严重度全由规则写死（error/warn），没有逐规则档位；
测试覆盖只认**直接 import**，不认**公开面 barrel** 这一层。渐进接入缺的是"先看见"的机制，
而不是"关掉"的机制。

## 目标

- `overrides.severity: Record<规则 id, 'error' | 'warn'>`：**只项目层能写**，逐规则覆盖严重度；
  报告 / 退出码 / JSON 都走同一处 `severityOf`（不许两套）。配置期 fail-closed：值非法、规则 id 不存在直接报错。
- M08 增加**间接覆盖**：测试 import 的若是"只有再导出的 barrel"，被它再导出的实现算"有测试"。
  只穿**再导出文件**（`facts.exports` 全是 re-export / star），不穿任意 import 链。
- 不新增配置文件版本（`severity` 是可选加法键，旧配置行为不变）。

## 非目标

- 不做"按文件 / 按目录"的严重度（那是 `exceptions` 的领域：要理由、可到期）。
- 不把 M08 的判据放宽成"有任意测试文件存在"：barrel 必须真的再导出到它。
- 不改 `--report-only`（整轮降级）与 `--severity`（报告过滤）的语义。

## 验收标准

- `overrides.severity: { S11: 'warn' }` → 同一份代码：默认红；覆盖后 JSON 里 `severity: 'warn'`、退出码 0。
- `severity: { S999: ... }` / `severity: { S11: 'fatal' }` → 配置期报错、退出 2。
- M08：测试只 import `src/shared/api/index.ts`（`export * from './http'`）→ `http.ts` 不报；
  把 barrel 改成不再导出 → 必须报。
- 单测 `tests/adoption.test.mjs`；`pnpm check` 全绿。

## 边界与取舍

- **严重度覆盖只改"显示与拦截"，不改"判不判"**：规则照跑、命中照记，JSON 里仍是 `severity: 'warn'`。
- **barrel 间接覆盖只穿再导出文件**：任意 import 链会让"测试 import 了入口"变成"全树覆盖"——
  那是把 M08 变成"有入口测试就全绿"，比误报更糟。
- 被否方案：给 M08 加 `exceptions` 让宿主逐文件豁免。否掉的理由：豁免按文件写，barrel 变化后没人清理；
  而"再导出就是覆盖"是**可判定的事实**。

## Comments

- 2026-10-30：落地（`overrides.severity` + `severityOf` 单点 + M08 穿 barrel）；示例与夹具用合成名称，不引用外部项目信息。
