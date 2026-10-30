# arch-guard

把架构约束写成**可判定不变量**的编码门禁：本体是通用引擎 + 数据表，宿主项目只提供一张配置表。

需求 `REQUIREMENTS.md`（**唯一来源**）｜用法 `docs/USAGE.md`（**使用说明唯一来源**）｜架构 `docs/ARCHITECTURE.md`（本体自身）｜规范 `PARADIGM.md`（宿主）｜设计 `docs/DESIGN.md`｜词汇 `CONTEXT.md`｜决策 `docs/adr/`

## 改代码前

- 动**引擎 / 规则 / 预置 / 角色表 / 判定等级** → 先读 `PARADIGM.md`，并确认新规则仍落在 L1–L3（`createRule()` 会拒绝 L4/L5 的 error 级规则）。
- 动**宿主相关的东西** → 只能进宿主的 `arch.config.mjs`；本体里出现宿主字面量会被 `pnpm self-check-portability` 拦下。
- **加规则**：id 前缀必须与域一致（S/D/C/P/H），且必须在 `__fixtures__/` 有「违规必报 × 合规不报」的夹具 —— 没有夹具的规则等于没有规则。
- **加规则之前先落盘**：需求进 `REQUIREMENTS.md`（没有就先加一条）→ 设计进 `docs/DESIGN.md`
  （架构性变更进 `docs/ARCHITECTURE.md`）→ 规格进 `.scratch/<slug>/spec.md` → 才动代码。流程见 `docs/agents/workflow.md`。

## 提交前

```bash
pnpm --filter . exec arch-guard --stats        # 看每条规则的耗时与命中（规则该不该留）
pnpm --filter . exec arch-guard --verify-deps   # 适配表 vs 实际依赖对账
pnpm check    # ★ 一条命令跑完整门禁：build → typecheck → lint → format → test → coverage
              #   → 夹具回归 → 本体自包含(P1–P4) → 文档同步(--check-docs) → 示例宿主 → 狗粮(自己查自己)
```

**发布时**：把 CHANGELOG 的 `[Unreleased]` 切分成版本段落；契约变更（`apiVersion` / `NOTICE_CODES` /
`SKIP_CODES` / 退出码语义）必须在版本段落里标注「破坏性」与迁移方式 —— 版本记录是契约变更唯一的审计落点。

**发布这一步有三条硬规矩**（都是踩出来的，别省）：

1. **别信"✅ Published"** —— 发布工具的消息不等于产物上线。**必须验权威源**（10 秒）：
   `curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@arch-guard%2Fcore/<版本>` → 期望 `200`；
   再 `curl -s .../@arch-guard%2Fcore | grep dist-tags` 看 `latest` 是否已指向它。
   实测过两种假成功：默认源是只读镜像（PUT 返回"成功"但**哪都没落**）、以及工具在发布没落地时照样提交 + 报告成功。
   **但反过来也成立：404 不等于失败** —— npm 的 packument / CDN 有缓存，新版本可能**几分钟**才可见
   （0.6.0 实测：先 404、几分钟后 200；镜像甚至可能比 npmjs 先可见）。所以先等几分钟、用
   `?t=$(date +%s)` 破缓存再验；**仍 404** 才当失败，那时看 packument 的 `time.modified` ——
   若它还停在上一版的发布时间，就是"从未写入"的决定性证据（别只看工具那句话，也别急着删标签）。
   **验"上线的是不是这一版"**：装到临时目录后，除了 `--version`，再 `grep` 几个**这一版新增的内部标识**
   （如 `es/` 里的常量名 / 信号 id）—— 比只看版本号更能证明产物就是这一版
   （0.7.0 实测：`TEST_LAYER_MIN` / `isTestPath` / `FACET_FIELDS` / `group-chain-depth` 全在 ✓）。
2. **标签在验证拿到 200 之后才打**（`git tag v<x.y.z>` + `git push origin v<x.y.z>`）。
   顺序反了就会出现"标签指向一个从没发布出去的版本"——`v0.6.0` 就这么发生过一次。
3. **版本号留给发布工具升**（它自己 `setPkgVersion` 并提交）；手动先升会让它拿到空提交而报错
   （0.5.0 那次）。**`publishConfig.registry` 必须显式指向 npmjs**（默认源是只读镜像）。

本仓库**不使用托管 CI**：门禁就是 `pnpm check`，谁提交谁在本地跑。所以别跳过它。

- **本地只跑 Node 24**（2026-09-25 定）：双 Node 的兼容性收益不抵那份时间。平时 `pnpm check` 一条就够。
- `engines: >= 22.18.0` **仍是对外承诺** → **发版前补跑一次 22**（发布是对用户唯一兑现承诺的时刻）：
  `nvm exec 22.18.0 node <pnpm 的 .cjs 路径> check` —— 要显式用 `node` 调 pnpm 入口，
  否则子进程仍是 24（见 `.scratch/face-forms/spec.md` 记的那个坑）。

两个不查文档就会踩的点：

- **`es/` 是构建产物**：源码内部 import 写 `./x.js`（TS 的 nodenext 只把 `.js` 映射回 `.ts`），所以 `node src/cli.ts` 跑不起来 —— 先 `pnpm build`，再 `node es/cli.js`。
- **狗粮**：改完引擎跑 `pnpm guard:self`（本体用 `library()` 范式检查自己）。

## 目录

> 逐文件职责见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §3（唯一来源）；这里只是速查。

| 位置              | 是什么                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/**`   | 引擎：扫描 / 事实模型 / 图 / 注册表 / 过滤器 / 报告 / scope / 依赖事实 / 自检                                                                                                                                                                                                                                       |
| `src/packs/**`    | `core/`（共享规则实现）· `registry.ts`（**源码形态的实现绑定**：`typescript` / `react` → 规则集 + 支持的面；两者今天共用 `core` 的规则集）。宿主只写 `sourceForm: 'react'`，绑定由调用方注入（ADR-0009）                                                                                                            |
| `src/presets/**`  | 预置与适配器：范式 `canonical` / `library` / `fsd`；域预设 `design-system` / `copy` / `deps` / `hygiene` / `metrics` / `stack`；方案面 `<面>-kits/*`（router / data-layer / styles / ui-kit / i18n，**纯数据**）与 `call-sites`（调用落点）                                                                         |
| `src/data/**`     | 纯数据表：组件库指纹 · 轮子指纹 · 同类方案 · 源码形态扩展名 · 样式扩展名→解析语法 · 方案面形态词汇 · 退路标记 · 词形 · 图标包 · 产物目录（引擎零库名、零逻辑）                                                                                                                                                      |
| `__fixtures__/**` | 被测项目夹具（故意含违规、坏语法、缺 `package.json` 等形态）                                                                                                                                                                                                                                                        |
| `examples/**`     | 宿主示例（都是**可跑的活样板**）：`minimal`（最短可用，71/107）· `full`（`canonical()` + 4 个域 + 12 个生效适配器 + 结构声明全配，**102/107、0 finding**）· `full-fsd`（`fsd()` 版、六层含 widgets，**92/107、0 finding**）。`pnpm guard:sample` / `guard:full` / `guard:full-fsd` 跑它们（已挂在 `pnpm check` 里） |
| `arch.config.mjs` | 门禁自己的配置（库范式 + 依赖选型 P + 度量 M07/M09）                                                                                                                                                                                                                                                                |

## 当前配置（由 `arch-guard --render-docs` 生成，**别手改**）

<!-- arch-guard:begin roles -->

| 角色          | 路径 glob                               | 层号 | 槽位    | 组  | 公开面 |
| ------------- | --------------------------------------- | ---- | ------- | --- | ------ |
| `test`        | `**/*.test.{ts,tsx,mts,cts,js,mjs,cjs}` | 99   | —       | —   | —      |
| `test`        | `**/*.spec.{ts,tsx,mts,cts,js,mjs,cjs}` | 99   | —       | —   | —      |
| `lib:entry`   | `src/index.ts`                          | 10   | `entry` | —   | —      |
| `lib:entry`   | `src/cli.ts`                            | 10   | `entry` | —   | —      |
| `lib:data`    | `src/data/**`                           | 1    | —       | —   | —      |
| `lib:engine`  | `src/engine/**`                         | 2    | —       | —   | —      |
| `lib:packs`   | `src/packs/**`                          | 4    | —       | —   | —      |
| `lib:presets` | `src/presets/**`                        | 4    | —       | —   | —      |

<!-- arch-guard:end roles -->

<!-- arch-guard:begin deps -->

**能力表**（`deps({ capabilities })`）：这个能力必须用哪个方案（驱动 P06 手搓指纹）

| 能力         | 首选方案    |
| ------------ | ----------- |
| `cli-args`   | `commander` |
| `word-forms` | `pluralize` |

**批准清单**（`deps({ allow })`，**非空才开启** P01「未登记即拒」）：

- `commander`
- `culori`
- `picomatch`
- `pluralize`
- `postcss`
- `postcss-scss`
- `postcss-less`
- `postcss-value-parser`

<!-- arch-guard:end deps -->

<!-- arch-guard:begin thresholds -->

| 阈值         | 值  | 被判的规则 |
| ------------ | --- | ---------- |
| 文件行数     | 500 | S16        |
| 页面行数     | 500 | S16        |
| 函数行数     | 150 | S16        |
| 单文件导出值 | 6   | S19        |
| 单文件组件数 | 3   | S19        |

<!-- arch-guard:end thresholds -->

## Agent skills

### 需求只讲场景

**对需求先讲场景，不讲规则**：谁在什么时候会疼、具体长什么样、现在拦不拦得住、漏掉的后果 ——
规则（id / 判据 / 实现）只在被问到时才展开。**需求的全貌与状态在 `REQUIREMENTS.md`（唯一来源）**：
新需求先写那里，再开工；`spec.md` 的「场景」一节写不出真实场景的需求先不做。
见 `docs/agents/scenario-first.md`。

### 开发流程（需求 → 设计 → 落地）

**从实际场景切入**：需求先进 `REQUIREMENTS.md`，设计进 `docs/DESIGN.md` / `docs/ARCHITECTURE.md`，
规格进 `.scratch/<slug>/spec.md`，最后才是代码 + 夹具 + 文档同步。**没落盘就不开工。**
`tests/process.test.mjs` 会查活跃规格有没有场景与需求编号、设计文档的规则数/夹具数与实际是否一致。
见 `docs/agents/workflow.md`。

### Issue tracker

特性规格写在 `.scratch/<feature-slug>/spec.md`（模板 `docs/agents/spec-template.md`），实现票号在 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`。约定见 `docs/agents/issue-tracker.md`。

### Triage labels

五个规范角色，字符串与角色名相同。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。
