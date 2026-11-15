# arch-guard

把**架构**写成**可判定不变量**的编码门禁：分层与边界、唯一出处、状态纪律、设计系统与魔法数字、文案契约、依赖选型、反退化。

**本工具不是 linter**：单文件语法卫生（any、console、`!important`、颜色字面量、行数上限…）交给
eslint / oxlint / stylelint / knip；我们只做它们做不到的事 —— **跨文件契约与可判定架构红线**
（角色表、域边界、令牌图、CSS Module 双向契约、多语言同构、能力指纹…）。

它不是又一个 linter —— **红线只落在可判定的等级上（L1 路径 / L2 单文件 AST / L3 依赖图），语义判断（「命名好不好」「该不该拆」）一律不写进红线**，所以它零误报，能长期活在 CI 里。

> 有骨架、可跑、已发布形态就绪；规则集在持续补齐（见文末 Roadmap）。
>
> **用法只有一处**：[`docs/USAGE.md`](./docs/USAGE.md)（安装 / 配置全字段 / 预设与参数 / 命令 / 报告 / CI / 排查）。
> 本文只留最短可用的一份与文档地图。

## 为什么需要它

agent 写代码最典型的退化不是语法错误，而是**结构退化**：

- 把业务逻辑塞进 `shared/lib` 的一个「通用」函数文件（依赖规则全过）
- 复制粘贴一份实现，而不是把共用逻辑提升到共享层
- 在组件里直接 `fetch`，query key 随手写字面量
- 顺手留 `TODO` / `console.log` / `as any` / 空 `catch`
- 一个文件长到 800 行

这些 eslint 与 tsc 都管不到。arch-guard 把它们变成可执行的检查。

## 安装与运行

```bash
pnpm add -D @arch-guard/core        # 包名；命令名是 arch-guard
```

要求 **Node ≥ 22.18**、**TypeScript 5.4 – 6.x**（`typescript@7` 是原生重写，JS 侧不再暴露编译期 API，
装到它会明确报错而不是崩在 `undefined`）。

在项目根建 `arch.config.mjs`（最小可用形态）：

```js
import { canonical, designSystem, hygiene, reactPack } from '@arch-guard/core/presets'

export default {
  sourceForm: 'react', // 框架包：声明的是**源码形态**，一个项目一个（React 用 reactPack，库 / CLI 用 tsPack）
  presets: [canonical(), designSystem(), hygiene()], // 范式三选一 + 域预设任意子集
}
```

```bash
npx arch-guard                          # 全项目检查（0 = 通过 / 1 = 有 error / 2 = 请求无法满足）
npx arch-guard --scope=changed          # 只报告 git 变更文件（含未跟踪）
npx arch-guard --domain=D --format=json # 只看设计系统，输出 JSON（给 agent / CI；带 apiVersion 契约）
npx arch-guard --explain src/modules/crews/views/CrewsList.tsx  # ★ 写之前问契约
```

## 三种用法：用库 / 换库 / 不用库

组件库是**可选、可替换**的配置轴。引擎里不允许出现任何具体库名：

```js
uiKit(antdKit()) // 用 antd
uiKit(noneKit()) // 不用组件库：vendor / 全局 API / 图标来源相关规则不注册
```

换库 = 写一份约 30 行的适配器（`packages` / `vendorSelectors` / `detachedApis` / `examples`）。
`data/kit-fingerprints.ts` 内置已知组件库指纹，于是**换库后旧库残留一条不剩是可判定验收条件**。

同形的可替换轴还有 i18n / 路由 / 数据层 / 样式 —— 逐轴的适配器字段与"不声明就明列停用"的规则对照表见 [`docs/USAGE.md`](./docs/USAGE.md) §2。

## JSON 报告是对外契约（`apiVersion`）

> **契约的权威表述（字段 / code / 退出码语义与变更分级）在 [`docs/DESIGN.md`](./docs/DESIGN.md) §6.9**；
> 消费方的接法（穷举映射 / 未知 code 守卫）见 [`docs/USAGE.md`](./docs/USAGE.md) §7。

`--format=json` 给 CI 注解 / PR bot / IDE 插件 / agent 用，所以它和规则一样是契约：

- **带 `apiVersion`**（当前 `2`）：消费方启动时断言自己认识的版本；不认识就明说"不认识这版报告"，别少读几个字段装绿。
- **自述是结构不是散文**：`notices: [{ code, text }]` —— 按 `code` 判，**文案随便改都不破坏契约**；
  `code` 清单由 `NOTICE_CODES` / `isNoticeCode` 导出（消费方用穷举映射，我们新增 code 时它的构建会红）。
- **机读 ⊇ 人读**：摘要行里的每个数字，JSON 里都有。
- **`ok` ≠ 退出码**：`ok` 答"**结论是不是通过**"（判过的没 error **且确实判了**）；退出码答"**要不要拦**"
  （受 `--report-only` / `--local-only` 影响）。只看 stdout 的消费方以 `ok` 为准。
- **「没判任何东西」可判定**：`--paths` 一个都没匹配上 → `paths.matched = 0` + `code: 'paths-no-match'` +
  **退出码 2** + **`ok: false`**。
- 契约变更（增删顶层字段 / 增删 code）**必须动 `apiVersion`**，而这是被 `tests/report-contract.test.mjs` **冻结**住的。

## 文档与门禁同一份真相

`arch.config.mjs` 是唯一机读真相，但文档里的表是**手抄**的 —— 改一处忘一处就漂移。把要同步的片段包起来：

```md
<!-- arch-guard:begin deps -->

（本节由 `arch-guard --render-docs` 生成，别手改）
<!-- arch-guard:end deps -->
```

```bash
arch-guard --render-docs   # 按 arch.config.mjs 重写块内容
arch-guard --check-docs    # 只校验：不一致即红（进 pnpm check 链路）
```

可用块名：`deps` · `thresholds` · `layout` · `structure` · `scan-scope` · `roles` · `params` · `exceptions`。
**块名拼错直接报错**（否则"文档已同步"是假象）。宿主架构说明的起手模板见 [`docs/templates/ARCHITECTURE.md.template`](./docs/templates/ARCHITECTURE.md.template)。

## 写之前问契约（`--explain`）

门禁平时只在**事后**说"你错了"，agent 于是靠试错逼近规范。`--explain` 把约束前移：

```bash
arch-guard --explain src/modules/crews/views/CrewsList.tsx
#    角色       module:views · 层 10 · 槽位 views · 域 crews · 组 crews
#    依赖       层序单向：只许依赖层号 ≤ 10 的文件（S21）
#    命名       hook 前缀 `use` · 页面后缀 `Page`
#    启用规则   18 条（结构 11 · 依赖 5 · 度量 2）→ 逐条给出 id / 标题 / 修法
#    因能力停用 P05 / P11 / …（缺能力，不是通过）
```

- **一条规则都不用跑**：数据全部来自角色表 + 布局 + 结构声明 + `params`，所以**零误报**；
- 路径还**没写**也照样能问：命中不了任何角色 → 它会告诉你**该放哪**；
- 域外 / `ignore` / 歧义都会明确说清（歧义会点出全部命中角色）；
- `--format=json` 输出结构化结果，适合 agent 消费；退出码恒为 0（这是查询，不是判决）。

## 检测范围（scope）

> **scope 只过滤报告，不过滤正确性。**语义的权威表述在 [`PARADIGM.md`](./PARADIGM.md) §9，
> 缓存与增量机制在 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §8。

| 场景        | 命令                                          |
| ----------- | --------------------------------------------- |
| CI / 提交前 | `--scope=full`（默认）                        |
| pre-commit  | `--scope=staged`（读 index 内容，不读工作区） |
| agent 迭代  | `--scope=changed`（含未跟踪文件）             |
| PR          | `--scope=since:origin/main`                   |

facts 按文件缓存（增量），**图与全局谓词每轮全量重建**（不会 stale-cache 假绿）；
**不可归属的全局违规默认仍然失败**（只有显式 `--local-only` 才允许跳过并列出条数）；无 git / 空 diff 会明确提示降级，绝不静默。

## 例外：规则级，且必须指名

> **权威在 [`PARADIGM.md`](./PARADIGM.md) §7**：规则级例外是唯一的宽松通道，且必须指名。

**违规没有存量豁免**：没有基线、没有"一键把当前违规记下来"。不合规就是红 —— 这是刻意的取舍，
因为任何"先把存量记下来"的通道最终都会变成日常动作，而不是例外。

```js
overrides: {
  exceptions: [
    // 「这条规则对这类文件不适用」——不是「这个文件免检」
    { rule: 'H03', glob: 'src/engine/output.ts', reason: '门禁的唯一输出出口', expires: '2026-12-31' },
  ],
}
```

- `rule` 必须真实存在（拼错直接报错）；`reason` 必填；`expires` 写了就**过期即红**；
- 文件照常有角色、进依赖图、被**其它**规则判定 —— 只有指名的那条规则被摘掉；
- 每次运行都会指名列出每条例外（命中几处）；**0 命中直接报错**（R-171：声明必须有消费者）；
- **没有内联豁免注释**（连 `eslint-disable` 都是红线 H02）。

> 别和 **覆盖率棘轮**（M04）混淆：它比的是覆盖率快照（`--update-coverage` 维护），不豁免任何违规。

## 引擎不绑宿主

> **为什么 P1 是审查门而不是「零依赖洁癖」见 [`docs/DESIGN.md`](./docs/DESIGN.md) §1.2**；检查清单本身见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §7。

本包以 npm 包发布，宿主只写 `arch.config.mjs`。**四条**可机检的不变式由 `arch-guard --self-check-portability` 强制：

| 不变式 | 内容                                                               | 为什么                                                                |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| P1     | 依赖必须**显式登记**（`node:*` 与白名单第三方）                    | 门禁读你全量源码、跑在 CI：新增依赖要有理由，且不得把宿主拖进版本冲突 |
| P2     | 不得出现宿主项目字面量（宿主名、绝对路径）                         | 换宿主不用改引擎                                                      |
| P3     | 引擎层不得假设项目布局（`engine/**` 不许出现 `'src/'` 这类字面量） | 范式可换：`canonical` / `library` / 自定义目录都靠它                  |
| P4     | 库名只许出现在数据表（`data/*`）与适配器面（`presets/<面>/*`）     | 同一引擎要能服务多种宿主与技术选型；名单从允许位置自己长出来          |

**P1 是审查门，不是"零依赖"洁癖**：要加依赖就改 [portability.ts](./src/engine/portability.ts) 的白名单并说清理由 ——
它挡的是"顺手引进来的依赖没人看过"。P2/P3 与发布方式无关，是引擎能同时服务多种范式的根本；P4 是"同一引擎服务多种技术选型"的总保证。

于是「换一个宿主」是加法：换 `arch.config.mjs` 即可，引擎一行不改。

## 速度

解析（把每个文件拆成规则能读的事实）是全流程里唯一昂贵的一步，所以它的结果**按文件缓存** ——
键 = `rel + role + 文件内容哈希`，整份缓存的键 = 事实模型版本 + TypeScript 版本；图与全局谓词每轮全量重建。
缓存位置跟 Vite 一样（`node_modules/.arch-guard-cache/facts.json.gz`，没有 `node_modules` 就退回项目根），
`--no-cache` 可关。实测（3043 个 ts 文件 / 21.5 万行）：冷跑 5.9s → 热跑 **1.2s**。

> 测量方法与「换 parser 的代价」见 [`docs/DESIGN.md`](./docs/DESIGN.md) §6.1.1 · [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §8。

## 质量保障

> 这些命令各自防什么、由谁强制，见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §7（元门禁）。

```bash
pnpm build                     # pagoda-cli 构建（es/ ESM + lib/ CJS + d.ts）
pnpm typecheck                 # tsc --noEmit
pnpm lint                      # eslint（禁 any / 非空断言 / console）
pnpm test                      # node --test（引擎 API + 夹具端到端 + 单元分支）
pnpm coverage                  # 覆盖率报告（Node 内置）
pnpm check                     # ★ 提交前的完整门禁：build + 类型 + lint + 格式 + 测试 + 覆盖率 + 三项自检 + 示例宿主 + 狗粮
pnpm self-test                 # 夹具回归：每条规则违规必报 × 合规不报
pnpm self-check-portability    # P1 / P2 / P3 / P4
pnpm guard:sample              # 拿 examples/minimal 当宿主跑一遍
pnpm guard:self                # 狗粮：门禁跑自己（library() 范式）
```

## 文档地图

> **这份表是文档地图的唯一来源**（`docs/ARCHITECTURE.md` §10 与 `REQUIREMENTS.md` 附录都只给指针）。
> 「唯一来源」= 那件事只在那里写，别处不许复制第二份。

| 文档                                                                                                 | 读者         | 回答什么                                                                           | 唯一来源范围 |
| ---------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------- | ------------ |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md)                                                               | 所有人       | 痛点（带例子）/ 期望行为 / 状态 / 这条由谁来做（本体 or 委派）                     | ✅ 需求      |
| [`docs/USAGE.md`](./docs/USAGE.md)                                                                   | 宿主团队     | **怎么用**：安装 / 配置全字段 / 预设与参数 / 命令 / 报告 / CI / 排查               | ✅ 使用说明  |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                                                     | 改本体的人   | 三层分离 / 数据流 / 模块职责 / 不能破的边界 / 扩展点 / 元门禁                      | ✅ 本体架构  |
| [`PARADIGM.md`](./PARADIGM.md)                                                                       | 宿主团队     | 目录契约 / 三条公理 / 原语 / 判定等级 / 适配器契约（可整篇搬走）                   | ✅ 宿主规范  |
| [`docs/DESIGN.md`](./docs/DESIGN.md)                                                                 | 改规则的人   | 规则清单 / 判定等级 / 配置协议 / 报告契约 / 选型纪律                               | 规则与协议   |
| [`CONTEXT.md`](./CONTEXT.md)                                                                         | 所有人       | 词汇表（角色 / 组 / 落点 / 方案面 / 唯一出处…）                                    | ✅ 词汇      |
| [`docs/adr/`](./docs/adr/)                                                                           | 所有人       | 决策的**理由**（不可变记录；其中的数量是当时快照）                                 | ✅ 决策      |
| [`docs/ALTERNATIVES.md`](./docs/ALTERNATIVES.md) · [`ECOSYSTEM-AUDIT.md`](./docs/ECOSYSTEM-AUDIT.md) | 选型的人     | 与生态的对比 / 逐条覆盖审计（0.3.x 快照 + 修订段）                                 | 分析         |
| [`docs/DELEGATION-REVIEW.md`](./docs/DELEGATION-REVIEW.md)                                           | 选型的人     | **委派评审**：委出去的那几条，宿主开启可能性多高、哪几条该收回来                   | 分析         |
| [`docs/agents/`](./docs/agents/)                                                                     | agent        | 协作约定（**开发流程** / 需求只讲场景 / issue tracker / triage / domain）          | ✅ 约定      |
| [`.scratch/<slug>/spec.md`](./.scratch)                                                              | 做那件事的人 | 单个需求的实现规格（场景 / 验收 / 边界 / Comments）                                | 单特性       |
| [`docs/templates/ARCHITECTURE.md.template`](./docs/templates/ARCHITECTURE.md.template)               | 宿主团队     | **宿主架构说明的模板**（约 60 行，带可渲染块）：抄到仓库根，人读文档与机读配置同源 | 模板         |
| [`AGENTS.md`](./AGENTS.md)                                                                           | agent        | 改代码前 / 提交前怎么做（含 `--render-docs` 生成的配置块）                         | 操作指南     |
| [`README.md`](./README.md) · [`CHANGELOG.md`](./CHANGELOG.md)                                        | 外部读者     | 概览与进度 / 每个版本实际发生了什么                                                | 概览与历史   |

## Roadmap

> 需求的全貌（痛点 / 期望行为 / 状态 / 由谁来做）在 [`REQUIREMENTS.md`](./REQUIREMENTS.md)（**唯一来源**）；
> 每条规则的判据在 [`docs/DESIGN.md`](./docs/DESIGN.md) §5。这里只记**里程碑**，不逐条抄规则。

- [x] **P0 骨架**：配置 / 扫描 / 事实模型 / 图 / 适配器 / 能力协商 / 例外通道 / scope / 自检
- [x] **六个域全部落地**（结构 · 设计系统 · 文案 · 依赖 · 反退化 · 度量）：共 **109 条规则**，**109/109 有夹具**（夹具全部 `exact`：多报也报错）
- [x] **声明驱动**：目录契约、结构阈值、方案面形态都是数据（`canonical` / `library` / `fsd` 三范式 + `stack()` 组合）
- [x] **可替换面 + 开放注册**：`ui-kit` · `i18n` · `router` · `data-layer` · `styles` · `call-sites`（新面由预设登记，加面不改引擎；一个面只能有一个方案）
- [x] **唯一出处**：色值 · 令牌 · 路由路径 · 缓存键 · 副作用调用 · 策略数字 —— 手写第二处就报
- [x] **与 lint 生态不交叉**：单文件语法卫生、颜色 / `!important` / 数值白名单、幽灵依赖、裸文案等按 `docs/DESIGN.md` §4.9 委派出去
- [ ] **待做与优先级**：见 [`REQUIREMENTS.md`](./REQUIREMENTS.md) 第七节（上帝域 · 状态纪律 · 权限散落 · 路由守卫 · 迁移单向 · monorepo…）

## 许可

MIT
