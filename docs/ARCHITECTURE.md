# 本体架构

> **这份文档是「arch-guard 自身」架构设计的唯一来源。**
> 谁能改什么、模块怎么分层、数据怎么流、哪些边界不能破 —— 都在这里。
> 相邻文档各管一摊：宿主的目录契约在 `PARADIGM.md`｜规则清单与判定细节在 `docs/DESIGN.md`｜
> 要做什么在 `REQUIREMENTS.md`｜词汇在 `CONTEXT.md`｜决策理由在 `docs/adr/`。
>
> **改动架构（不是加一条规则）时**：先读这份 → 改这份 → 再改代码。DESIGN 里的架构性内容
> 已经收敛到这里（那几节现在只留指针），避免同一件事两处存放。

## 1. 三层分离

| 层       | 内容                                                    | 与宿主的关系                       |
| -------- | ------------------------------------------------------- | ---------------------------------- |
| 通用范式 | 三条公理 + 10 个检测原语（分类词汇）+ 四张表 + 豁免通道 | 写在 `PARADIGM.md`，**整篇可搬**   |
| 通用引擎 | `src/`，解析 / 建图 / 规则 / 报告                       | **零项目字面量**（P2/P3 自检强制） |
| 项目实例 | 宿主的 `arch.config.mjs`（填表）+ 自己的架构说明文档    | 每个宿主仓库一份，引擎不为它改一行 |

推论：**宿主换目录规范 = 换预设（数据）；换元框架 = 换 pack（代码）；换库 = 换适配器（数据）**。
三层里任何一层都不许越界去实现另一层的知识 —— 这是本仓所有"不许写死"纪律的总根。

## 2. 分层与数据流

```
cli.ts            解析参数 → 载配置 → 编排（--stats / scope / 过滤器）
  └ config.ts     预设合并 + overrides → Config（**所有 fail-closed 校验在这一站**）
      └ scan.ts   遍历文件 + 角色判定（L1）→ records / missing / ambiguous / outside / foreign
          └ collect.ts   读源 + extractFacts（+ facts 持久缓存）
              └ graph.ts     import 图 + 令牌引用图（可达 / 环 / 入度来源）
                  └ registry.ts  能力协商：requires 未满足的规则**不注册**并记入 skipped
                      └ rules（纯函数：只读 facts / graph / config / scan / deps）
                          └ filters.ts  scope / --paths / --severity（**只过滤报告，且必须自述**）
                              └ report.ts   pretty / json / github + 退出码 + notices
```

每个阶段一条不变量：

| 阶段       | 唯一真相 / 纪律                                                                                 | fail-closed 点                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `scan`     | 角色表（来自范式预设）决定"这个文件是什么"；三层"别碰"（宿主 ignore / .gitignore / 产物目录表） | 未命中任何角色 → `missing`（S01 报）；角色歧义 → `ambiguous`                            |
| `collect`  | **事实模型是 parser ↔ 规则之间唯一的契约**（规则不碰 AST）                                      | 解析失败 → `parseErrors` → S00 直接报（该文件失去全部检查）                             |
| `graph`    | 边只来自**解析成功**的 import；解析不到的边不存在                                               | 解析不到的说明符 → `unresolved`（引擎事实；门禁不报，交 eslint `import/no-unresolved`） |
| `registry` | 规则是否注册只由**能力**决定（适配器声明了什么）                                                | 缺能力 → 不注册 + `skipped`（报告里逐条明列，不静默通过）                               |
| `rules`    | 纯函数：无 IO、无状态、不读原始文本（除 `sourceOf` 取行文本做锚点）                             | 规则抛异常 → 记为该规则失败，**绝不静默通过**                                           |
| `filters`  | 过滤只影响报告，不改变判定结论                                                                  | 被过滤的必须进 `notices`（`paths-no-match` / `severity-filtered`…）                     |
| `report`   | 报告是**对外契约**（`apiVersion` / code 清单 / 退出码语义）                                     | 契约变更必须 bump 或在 CHANGELOG 标注（DESIGN §6.9）                                    |

## 3. 模块职责（唯一来源）

```
src/
  index.ts        公共 API —— 宿主与本包内部唯一约定的导入面（`exports` 不暴露 ./engine/*）
  cli.ts          CLI：参数 → 配置 → 扫描 → 解析 → 建图 → 规则 → 报告；--stats / --explain / --verify-deps…
  engine/         **零宿主依赖**：不认框架、不认目录布局、不认库名
    types.ts          规则面向的契约（事实模型 / 配置 / 规则 / 发现项 / 适配器）
    rule.ts           createRule：域 ↔ id 前缀、**error 只落 L1–L3**（代码强制）
    defaults.ts       阈值与命名契约的**唯一默认值**
    config.ts         配置加载与合并（预设 + overrides）；specVersion / pack / 适配面校验都在这
    scan.ts           遍历 + 角色判定 + 扫描域（include）与三层"别碰"
    collect.ts        读源 + 提事实 + facts 缓存接线（契约域内与域外都解析）
    facts.ts          AST/JSON → 事实模型（imports / exports / strings / calls / functions / comments）
    facts-cache.ts    facts 持久缓存（单文件键 = rel + role + 内容哈希）
    graph.ts          import 图 + 令牌引用图（含 resolveSpecifier）
    registry.ts       能力协商（requires ↔ 适配器声明）→ enabled / skipped
    adapters.ts       defineFacet / defineAdapter：白名单、类型、正则、键与 facet 一致、冻结
    source-form.ts    defineSourceForm / mergeRules：源码形态绑定（规则集 + 支持的面）与规则合并
    run.ts            编排；notices 由 notices.ts 统一生成
    notices.ts        自述（扫描域 / 边界 / 阈值不生效 / 生效的适配器…）
    filters.ts        scope / --paths / --severity
    report.ts         渲染（pretty / json / github）+ counts + 退出码
    codes.ts          对外契约枚举：NOTICE_CODES / SKIP_CODES（数组 + 派生常量表 + 守卫）
    docs.ts           文档管理块渲染（--render-docs / --check-docs）
    explain.ts        --explain：角色 / 依赖 / 落点 / 适用规则
    deps.ts           依赖事实与策略（allow / deny / capabilities；capability 可为自定义能力对象）
    deps-audit.ts     --verify-deps：适配表 vs package.json + 适配表全表
    i18n.ts          文案资源索引        css.ts  postcss 解析（按扩展名选语法）+ 令牌 / 颜色求值
    coverage.ts      M 域产物解析        git.ts  scope 的 git 事实 + .gitignore 基础层
    portability.ts   P1–P4 自包含自检    self-test.ts  夹具回归
    structure.ts / structure-spec.ts     结构声明（structure as data）的解析与校验
    output.ts / util.ts / ts-api.ts      输出、工具、TS Compiler API 薄封装
  packs/        源码形态的实现绑定（registry.ts：形态 → 规则集 + 支持的面）+ 共享规则
    core/           共享规则实现（框架无关）
      index.ts        组装 coreRules（今天 tsPack / reactPack 共用同一份）
      rules/          107 条规则的实现：structure / structure-graph / structure-imports / structure-declared /
                      structure-groups / structure-locality / structure-routes / structure-scan /
                      structure-call-sites / structure-util / placement / face-forms /
                      design-tokens / design-vendor / design-styles / design-inline / design-numbers /
                      design-sources / design-shared /
                      copy / deps / deps-adapters / deps-fingerprints / structure-discipline / hygiene-context / hygiene-retired / metrics
    typescript/     tsPack（framework: typescript）——库 / CLI / 纯 TS 项目
    react/          reactPack（framework: react）——React 应用；JSX 专属规则将来的家
  presets/      范式与预设：canonical / library / fsd（范式）+ design-system / copy / deps / hygiene /
                metrics / kit / call-sites / stack（域与方案面）+ <面>-kits/*（纯数据适配器）
  data/         纯数据表（**库名只许出现在这里与 presets/<面>/*.ts**）：
                kit-fingerprints（组件库指纹）· wheel-fingerprints（轮子指纹）·
                solution-alternatives（同类方案）· framework-sources（源码形态扩展名）·
                face-forms（方案面形态词汇）· css-value-families（CSS 数值三族）· css-syntaxes（样式扩展名 → 解析语法）· retired-names（退路标记）· plural-forms（词形）·
                icon-packages · build-output-dirs（产物目录兜底跳过名单）
__fixtures__/   100 个夹具项目：每条规则一对「违规必报 × 合规不报」，全部 exact
examples/minimal/  干净的宿主示例（可搬运性验证）
arch.config.mjs    门禁自己的配置（库范式 + 依赖选型 + 度量）
```

**稳定 vs 易变**：`types.ts` / `codes.ts` / `facts.ts` 的产出形状是**契约**（改动要 bump 版本或标注）；
`rules/**` 与 `data/**` 是**易变层**（加规则、加数据表是日常）。

## 4. 关键边界（改代码时最容易破的几条）

1. **规则不消费 TS AST**：规则只读事实模型（`facts`）与图。好处是换 parser 只重写 pack 的解析 +
   事实提取层，**规则一行不改**。（事实模型形状见 DESIGN §6.1.1；`strings[].prop` 的透传语义是
   D22 的前提。）
2. **引擎零宿主字面量**：`src/engine/**`、`src/packs/**` 与**通用预设**里不许出现具体框架 / 库名，
   只许出现在 `src/data/*` 与 `src/presets/<面>/*.ts`；由 `--self-check-portability`（P2/P4）强制。
3. **面（facet）是开放的**：引擎只预注册"自己有消费者"的核心面，新面由预设 `defineFacet` 登记；
   引擎里没有面清单（E2）。一个面只能有一个方案（两份不同的 kit 直接报错）。
4. **数据 vs 逻辑**：适配器与数据表是**纯数据**（经 `defineAdapter` 校验并冻结），引擎从不回调宿主 ——
   配置里不能写函数（ADR-0002 / ADR-0006）。
5. **唯一真相源**：

   | 事实                                   | 唯一出处                                      |
   | -------------------------------------- | --------------------------------------------- |
   | 阈值与命名契约的默认值                 | `engine/defaults.ts`（预设不抄第二份）        |
   | 角色表 / 层号 / 槽位                   | 范式预设（`canonical` / `library` / `fsd`）   |
   | 方案面形态（入口名 / 样式形态 / 落点） | `data/face-forms.ts` + 适配器声明（规则只读） |
   | 库名                                   | `data/*` 与 `presets/<面>/*.ts`               |
   | 文档里的角色表 / 选型表 / 阈值表       | 由 `--render-docs` 从 `arch.config.mjs` 生成  |
   | 对外 code 清单                         | `engine/codes.ts`（数组派生常量表与守卫）     |

6. **判据机制**（为什么是它，不是正则）：

| 判据族                                       | 机制                                               |
| -------------------------------------------- | -------------------------------------------------- |
| 导入 / 依赖方向 / 公开面 / 环 / 可达         | TS AST + 自建 resolver → 文件图                    |
| 导出形态                                     | TS AST（`ExportDeclaration` / modifiers / kind）   |
| 字面量唯一出处（颜色 / 路由 / 缓存键…）      | TS AST + CSS 扫描器，**带上下文**（属性名 / 参数） |
| 目录白名单 / 深度 / 槽位 / 命名 / 配对       | 路径正则（这里正则 100% 正确）                     |
| CSS 令牌 / 长度 / `!important` / vendor 前缀 | 自带 CSS 结构化扫描器 + 令牌引用图                 |
| TODO / 抑制注释                              | 注释正则（AST 不保留注释节点）                     |
| 依赖选型                                     | `JSON.parse` + 白名单                              |

## 5. 契约面（对外，不能随便改）

| 契约                          | 位置                    | 改动的规矩                                                        |
| ----------------------------- | ----------------------- | ----------------------------------------------------------------- |
| JSON 报告（`apiVersion`）     | DESIGN §6.9             | 破坏性 → bump；兼容性新增 → 不 bump 但要冻结测试 + CHANGELOG 标注 |
| `NOTICE_CODES` / `SKIP_CODES` | `engine/codes.ts`       | 增删改名都算契约变更（消费方可能穷举）                            |
| 退出码 / `ok` 语义            | DESIGN §6.9             | 语义变了必须写进版本段落                                          |
| 配置 `specVersion`            | `engine/config.ts`      | 不匹配直接报错，不猜                                              |
| 适配器 `specVersion`          | `defineAdapter`         | 同上                                                              |
| facts 缓存 `FACTS_CACHE_SPEC` | `engine/facts-cache.ts` | **改事实形状必须 +1**，否则旧缓存被复用 → 静默失能                |
| CLI 选项与 `--format`         | `cli.ts`                | 对外用法，改要写 CHANGELOG                                        |

## 6. 扩展点（三条路径，以及最少要动的文件）

| 加什么           | 最少要动                                                                                                       | 别忘了                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **一条规则**     | `packs/core/rules/<域>.ts`（`createRule`，id 前缀 = 域，error 只落 L1–L3）                                     | `__fixtures__/` 一对夹具 · 谁来 `enable` 它 · 需要哪些 `requires` · DESIGN §5 · README 规则数 |
| **一个方案面**   | `presets/<面>-kits/*.ts`（`defineFacet` + `defineAdapter`）· `presets/kit.ts` 的预设                           | `packs/registry.ts` 的适配面白名单 · 消费者的规则 · `--verify-deps` 的形态字段                |
| **一个源码形态** | `data/framework-sources.ts` 加一行扩展名 + `packs/registry.ts` 加一份绑定 + parser 与角色表变体 + 语言专属规则 | 自带夹具 · `implemented` 是派生量（别手写）· 量级 ≈ 半个引擎                                  |

## 7. 元门禁（管门禁自己的门禁）

| 检查                               | 在哪                                | 防什么                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 每条规则违规必报 × 合规不报        | 夹具回归（`--self-test`）+ 覆盖测试 | 加了规则没夹具 = 没有规则                                                                                                                                                                               |
| 域预设必须列全本域规则             | `tests/engine-unit`                 | 加了规则没挂进预设（空转）                                                                                                                                                                              |
| 范式预设的结构词汇必须完整         | `tests/paradigm-coverage`           | 删了 `group` / `entry` → 一批规则在前端应用里集体沉默                                                                                                                                                   |
| 冻结 `NOTICE_CODES` / 报告顶层字段 | `tests/report-contract`             | 契约偷偷漂移                                                                                                                                                                                            |
| P1–P4 自包含                       | `--self-check-portability`          | 引擎依赖宿主 / 库名漏进引擎 / 布局假设                                                                                                                                                                  |
| 文档管理块一致                     | `--check-docs`                      | 人读文档与机读配置两处真相                                                                                                                                                                              |
| 依赖清单与白名单                   | `tests/engine-runtime` + P01 + M07  | 依赖悄悄变多 / 未登记                                                                                                                                                                                   |
| 覆盖率棘轮                         | M 域                                | 覆盖率倒退 / 产物过期                                                                                                                                                                                   |
| 门禁链路真的跑测试与覆盖率         | M09                                 | 把 test / coverage 从 `check` 里摘掉                                                                                                                                                                    |
| 需求口径 ↔ 设计/代码逐条一致       | `tests/process`                     | 状态说"已完成 · 本体"、期望却写"交给生态 / 本体不做"；DESIGN §5 的已实现清单、判定等级与 `coreRules` 对不上；需求小结的数字与实际条目数不符                                                             |
| 用法文档可用                       | `tests/process`                     | 文档里的包名写成 bin 名（照抄的人第一步就解析不到）；README / USAGE 的相对链接指向不存在的文件                                                                                                          |
| 范式无关的规则不许"静默消失"       | `tests/paradigm-coverage`           | 某个范式下**根本没注册**（既不跑、也不在"停用"清单里）—— 宿主配了声明也毫无作用，报告一字不提（R-87；实测 `fsd()` 少了 9 条）                                                                           |
| 示例是活样板 + 规则真的有效        | `tests/examples`                    | 示例烂掉（不再 98/98 · 不再 0 finding）；`minimal` 的停用条数变多（少配一个面 = 悄悄少一层覆盖）；**规则悄悄失效**（35 个变异改了示例，该抓的没抓到 —— 夹具管的是"规则写对了"，变异管的是"规则还有效"） |

## 8. 性能与缓存

- **解析是唯一昂贵的一步**：parser-only（`ts.createSourceFile`，`setParentNodes: false`）约
  「100 文件 < 300ms、1k 文件 ~1s」量级；选型对比与实现坑见 DESIGN §6.1.1。
- **facts 按文件缓存**（`rel + role + 内容哈希`），**图与全局谓词每轮重建**（便宜，且 scope 语义要求如此）。
- 撞性能墙时的换 parser 代价 = 重写事实提取层，**规则一行不改**（oxc 的再评估条件见 `.scratch/oxc-spike/`）。

## 9. 已知边界与技术债

- `createSourceFile` 的语法诊断挂在**非公开字段**（`parseDiagnostics`）→ 必须有"坏语法必报"的夹具兜住。
- `strings[].prop` 是**透传**语义（数组 / 对象 / 括号 / 断言 / 展开 / 三元不改变它，函数体与调用实参断开）；
  改它会影响 D22 这类"唯一出处"规则。
- 委派给生态的那半（DESIGN §4.9）：**宿主没装工具就等于没有那层覆盖**（本工具不判"跑没跑"：原计划的 R-51 已判不做 —— 委派 = 覆盖责任交给宿主）。
- v1 明确不支持的边界（文件路由的域结构、CSS-in-JS 写法、位置参数形态的缓存键…）见 DESIGN §7.2(4)。

## 10. 文档分工

> **文档地图（谁回答什么、谁是唯一来源）在 [`README.md`](../README.md) 的「文档地图」一节** ——
> 这里只强调两条与本文件相关的分工：
>
> - **架构问题**（分层 / 数据流 / 模块职责 / 边界 / 扩展点）看本文件；**规则怎么判**看 `docs/DESIGN.md`。
> - `docs/adr/**` 是**不可变记录**（决策的理由）；里面的数量（如"55 条规则"）是当时的快照，别当现状。
