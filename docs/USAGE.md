# 使用说明（唯一来源）

> **这份文档回答"怎么用"**：装什么、`arch.config.mjs` 每个字段是什么意思、有哪些预设与参数、
> 命令怎么敲、报告怎么读、怎么接进 CI、出了问题怎么查。
>
> **「唯一来源」= 这几件事只写在这里**，别处只给指针（`README.md` 的文档地图登记了它的归属）。
> 四份姊妹文档各管一件事，本文不复制它们的内容：
>
> | 你想要的                                         | 去哪                                                                                   |
> | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
> | **契约的权威表述**                               | [`DESIGN.md`](./DESIGN.md) §6.9（JSON 字段 / notice code / `apiVersion` / 退出码语义） |
> | **宿主规范**（目录契约 / 例外语义 / 判定等级）   | [`../PARADIGM.md`](../PARADIGM.md)                                                     |
> | **这条规则为什么存在、谁在做**                   | [`../REQUIREMENTS.md`](../REQUIREMENTS.md)                                             |
> | **本体内部**（模块职责 / 数据流 / 元门禁）       | [`ARCHITECTURE.md`](./ARCHITECTURE.md)                                                 |
> | **每个规则的判据**                               | [`DESIGN.md`](./DESIGN.md) §5                                                          |
> | **词汇**（角色 / 组 / 落点 / 方案面 / 唯一出处） | [`../CONTEXT.md`](../CONTEXT.md)                                                       |

---

## 0. 三十秒

```bash
pnpm add -D @arch-guard/core        # 包名是 @arch-guard/core；命令名是 arch-guard
```

要求 **Node ≥ 22.18**、**TypeScript 5.4 – 6.x**（`typescript@7` 是原生重写，JS 侧不再暴露编译期 API，
装到它会明确报错，而不是崩在 `undefined`）。

在项目根建 `arch.config.mjs`（最小可用形态）：

```js
import { canonical, designSystem, hygiene } from '@arch-guard/core/presets'

export default {
  sourceForm: 'react', // 源码形态（标量、一处真相）：决定扩展名分派 + 内置规则集
  presets: [canonical(), designSystem(), hygiene()], // 范式（三选一）+ 域（任意子集）
}
```

```bash
npx arch-guard                    # 全项目检查
echo $?                           # 0 = 通过；1 = 有 error；2 = 请求无法满足（见 §6）
```

**包名与导入面**（`package.json` 的 `exports` 是权威）：

| 导入                                     | 是什么                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@arch-guard/core`                       | 公共 API：`runGuard` / `loadConfig` / `createRule` / `coreRules` / code 常量…                 |
| `@arch-guard/core/presets`               | **宿主最常用的面**：范式和域预设、kit 工厂                                                    |
| `@arch-guard/core/presets/*`             | 单个预设文件（按需精确引入）                                                                  |
| `@arch-guard/core/ui-kits/*` · `/data/*` | 适配器 kit / 纯数据表（自写适配器时用）；形态绑定在 `packs/registry.ts`（引擎自带，宿主不写） |

> **CLI 名与包名不是一个东西**：命令叫 `arch-guard`，包叫 `@arch-guard/core`。
> 复制配置示例时最容易踩的就是这里 —— `from 'arch-guard/presets'` 解析不到。

---

## 1. `arch.config.mjs` 全字段

```js
export default {
  specVersion: '2', // 配置格式版本：省略 = 用当前版本；写了与本工具不一致则**显式报错**，而不是猜
  sourceForm: 'react', // 源码形态：'typescript'（库 / CLI）· 'react'（React 应用）；省略 = typescript
  presets: [...], // 预设：范式 + 域 + 方案面（见 §2）
  overrides: {...}, // 项目差异只写这里（下表的每个键都是 `Config` 的逐键覆盖）
}
```

### 1.1 `overrides` 常用字段

| 字段                 | 类型                                 | 作用                                                                                                                                                         |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `include`            | `string[]`                           | **契约扫描域**（配置根相对 glob）。域外文件**不判目录契约，但仍会被解析、仍进依赖图**。空 = 全树参与                                                         |
| `ignore`             | `string[]`                           | **别碰**：不进文件集、不解析、不进依赖图（构建产物 / 示例 / 夹具 / 一次性 spike 用这个）                                                                     |
| `addRoles`           | `RoleDescriptor[]`                   | 在范式角色表**之上追加**角色（项目自己的目录 / dev-only 形态靠它）                                                                                           |
| `roles`              | `RoleDescriptor[]`                   | **整体替换**范式角色表（自写范式才用；随手写会把自己范式的角色全删掉）                                                                                       |
| `params`             | `Record<string, unknown>`            | 落点参数（`styleDir` / `i18nDir` / `paletteFile`…）。预设参数最终都并到这里                                                                                  |
| `exceptions`         | `{ rule, glob, reason, expires? }[]` | **规则级例外**（唯一的宽松通道；见 §5）                                                                                                                      |
| `aliases`            | `Record<string, string>`             | 别名映射（默认从 `tsconfig.json` 的 `paths` 读）                                                                                                             |
| `enable` · `disable` | `string[] \| 'all'`                  | 规则开关（`disable` 在 `enable` 求完之后再减）。**`disable` 是整条关掉** → 报告会自述停用了哪几条；只想对某类文件豁免，用 `exceptions`（要理由，可写到到期） |
| `thresholds`         | 对象                                 | 行数 / 导出数 / 组件数阈值（S16 / S19）                                                                                                                      |
| `naming`             | 对象                                 | `hookPrefix` / `viewSuffix`（S12 / S13 的词汇）                                                                                                              |
| `structure`          | 对象                                 | 层序 / 组隔离 / 公开面声明（S21–S23、S32、S39–S43 的判据来源）                                                                                               |
| `entries`            | `string[]`                           | 额外入口（可达性分析用）                                                                                                                                     |

### 1.2 三个通道别混（这是最容易配错的一处）

| 你的意思               | 用哪个                               | 副作用                                                                     |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| 这片树**不属于契约**   | `include`（收窄）或 `ignore`（别碰） | `include` 域外仍进图；`ignore` 的连依赖图都不进                            |
| **这条规则**对它不适用 | `exceptions`（必须写 `reason`）      | 文件照常有角色、进图、被**其它**规则判定，只摘掉指名的那条                 |
| 暂时不想修             | **没有这个通道**                     | 没有基线、没有"记下来以后再说"（见 [`../PARADIGM.md`](../PARADIGM.md) §7） |

---

## 2. 从 5 行开始（渐进接入）

**别一上来就照着 `examples/full` 抄 210 行**。这条路径是有顺序的：

| 步  | 做什么                                                                                                                                     | 你会得到             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| ①   | 抄 [`examples/minimal`](../examples/minimal/) 的 **5 行**（范式 + 反退化 + 声明空 kit）                                                    | 71/107 规则在跑，绿  |
| ②   | **看报告的停用清单**：它会说"因能力未声明而停用 N 条"，并**给出可以直接粘进配置的那一行**                                                  | 每补一行，覆盖多一层 |
| ③   | 被某条规则拦到时，按 finding 的 `hint` 把调用收进声明的落点                                                                                | 纪律开始真的生效     |
| ④   | 想要"配全长什么样"的终点形态，再看 [`examples/full`](../examples/full/)（canonical）或 [`examples/full-fsd`](../examples/full-fsd/)（FSD） | 102/107 与 91/107    |

**四笔"没跑"的账要分清**（R-142 起报告**分开说**，`skipped[].code` 一一对应）：

| 报告里长这样                                     | `skipped[].code`             | 意思                                     | 怎么让它跑                               |
| ------------------------------------------------ | ---------------------------- | ---------------------------------------- | ---------------------------------------- |
| `因能力未声明而停用 N 条规则：…`                 | `capability-missing`         | 缺声明（下一行给可粘贴的配方）           | 补那一行声明                             |
| `未启用 N 条规则（不在配置的 enable 名单里）：…` | `not-enabled`                | **注册了，但预设的清单里没有它**         | 加进 `enable`，或换范式预设              |
| `被本次运行的过滤器收窄 N 条规则`                | `filtered`                   | 你这次敲了 `--only/--domain/--min-level` | 去掉过滤器（不是它没跑，是这次没让它跑） |
| `显式停用 N 条规则`                              | （走 `rules-disabled` 自述） | 配置里 `disable` 掉了，不会自己恢复      | 删掉那个条目                             |

**账目是闭合的**：`规则 N/M` 的三个数（跑 / 没跑 / 停用）加起来就是 `M` —— 不再有"既没说跑、
也没说停"的规则。想知道**某一条**为什么没跑：`arch-guard --explain <规则 id>`（会直接写
「当前配置下：没跑 —— …」），或者 `arch-guard --list-rules` 看整表的 `[跑] / [未启用] / [缺能力]` 标注。

第 ② 步长这样（真实输出）：

```
因能力未声明而停用 5 条规则：M06 / M02 / M03 / M04 / M05
    · M06 M02 M03 M04 M05 想要就跑 → metrics({ coverage: { report: 'coverage/coverage-summary.json' } })
```

用 `library()` 这类"清单较短"的范式时，还会多一行（以前这几十条**一个字都不提**）：

```
未启用 54 条规则（不在配置的 `enable` 名单里）：C01 / C02 / … / S44
    · 不配 = 不跑，不是通过：要跑就把它们加进 `arch.config.mjs` 的 `enable`，或换一个范式预设
```

配错了也有话说 —— 「声明 0 命中」的自述会附上**正确形态参考**：

```
· 有 1 条声明 0 命中（那条纪律这次什么都没看，建议删掉或修对）：analytics.apis 的调用名 trackX
  正确形态参考：analytics({ apis: ['sendEvent'], eventSource: 'src/shared/lib/analytics/events.ts' })
```

**记住三条边界**（它们决定了配置能替你多少）：

- **库 / 平台的事实**由适配器与数据表给（`antdKit()` 的文案位、`reactQueryKit()` 的策略数字名…）——
  你不需要抄，也**不该**抄。
- **「唯一出处在哪」只能你回答**（`pathSource` / `queryKeyFrom` / `eventSource` / `endpoints.source`…）：
  那是项目的架构决定，工具猜不到，也不许猜。
- **默认错了要看得见**：报告里的自述（适配器清单 / 0 命中 / 名单来源）就是为此存在。

## 2.0 预设清单（选什么 = 配什么）

**范式三选一**；域预设任意子集叠加；方案面**一个面只能有一个方案**。

### 2.1 范式（`canonical` / `library` / `fsd`）

| 范式          | 用于                                    | 参数                                                                                                          |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `canonical()` | 前端应用（`app/` `modules/` `shared/`） | `src` · `app` · `modules` · `shared` · `lazyViews`（页面必须动态 import → S37）                               |
| `library()`   | 库 / CLI / 纯 TS 项目                   | `src` · `modules`（目录名→层号，**不传就只认入口**，其余报 S01）· `entry`（默认 `['index.ts']`）              |
| `fsd()`       | Feature-Sliced Design                   | `slicedLayers` · `appLayer` · `sharedLayer` · `segments` · `sharedSegments` · `appSegments` · `slicesGrouped` |

### 2.2 域预设（域名 = 预设名）

| 预设                | 域  | 关键参数（完整字段见 §2.4）                                                                                                                                                                                      |
| ------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `designSystem({…})` | D   | `paletteFile` · `tokenDir` · `themeFile` · `styleDir` · `vendorDir` · `storageFile` · `staticPrefix` · `valueWhitelists` · `numberHomes`（D20：哪些名字的数字必须有家）· `contrastPairs` · `themes` · `htmlKeys` |
| `copy({…})`         | C   | `messageApis` · `messageProps`（C01 的"组件库调用里的文案"那一半）—— **可以不写**：`uiKit(antdKit())` 自带 antd 那份；写了就以项目为准（`[]` = 关掉）                                                            |
| `deps({…})`         | P   | `allow`（fail-closed 白名单 → P01）· `deny` · `capabilities`（能力→首选方案 → P06，如 `{ datetime: 'dayjs' }`；值可以是**对象形态**登记自定义能力，见下）· `unusedDeps`（P08，默认关）· `fingerprints`           |
| `metrics({…})`      | M   | `coverage`（`report` / `perDirMin` / `zeroAllow` / `ratchet` / `baselineFile` / `mustCover` / `pathRewrite`）· `tests` · `depsBudget`                                                                            |
| `hygiene()`         | H   | 无参数（H06 / H07 / H08 / H09 / H12 / H13，按能力协商）                                                                                                                                                          |

**自定义能力**（R-154）：`capabilities` 的值可以是对象 —— 首选方案 + 证据 + hint，用来登记本体没有的能力：

```js
deps({
  capabilities: {
    datetime: 'dayjs',
    'http-client': {
      preferred: 'axios',
      syntax: ['\\bfetch\\s*\\('],
      hint: '请求统一走 src/shared/api/client.ts 的 axios 封装',
    },
  },
})
```

对象形态与内置能力拼成**同一张生效表**（P06 / P07 / `--render-docs` 都认，不另开消费路径）。
至少要有一条证据：`syntax`，或 `softSyntax` + `apiNames`（P07 需要两类证据叠加）；
`platform: true` 表示首选是平台内置 API（没有 import 可查 → 命中即报）。写错了（与内置能力重名 /
正则编译不了 / 没有证据 / 缺 hint）在 `deps()` 阶段直接报错。`fingerprints` 覆盖也可以指向自定义能力。

### 2.3 方案面（可替换轴）

每个面都是"**声明哪个方案 → 贡献哪些规则**"；不声明 = 那批规则**明列停用**（不是通过）。

| 面          | 声明方式                                                              | 贡献的规则（以 `requires` 为准）                                               |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 组件库      | `uiKit(antdKit() \| noneKit())`                                       | `vendorSelectors`→D10/D10b · `detachedApis`→H06 · `icons`→P05 · `packages`→P11 |
| i18n        | `i18n(i18nextKit({ languages }) \| noneI18nKit())`                    | `resourceDir`→C01–C07                                                          |
| 路由        | `router(reactRouterKit({ routeFiles }) \| noneRouterKit())`           | `pathSource`→D23；`routeFiles` 还决定 S03/S04/S05/S14/S15 的入口词汇           |
| 数据层      | `dataLayer(reactQueryKit({...}) \| noneDataLayerKit())`               | `queryKeyFrom`→D22（可多落点/glob）· `fetchIn`/`fetchApis`→S36                 |
| 样式        | `styles(cssModulesKit({...}) \| noneStylesKit())`                     | `modulePatterns`→D16/D17                                                       |
| 调用落点    | `callSites([{ name, apis \| from, in }])`                             | S38（副作用 / 配置对象的落点）                                                 |
| 埋点        | `analytics({ apis, eventSource })`                                    | D24（事件名唯一出处）                                                          |
| 环境读取    | `envReads({ apis?, in })`（缺省用平台表）                             | S44（`import.meta.env` / `process.env` 的落点）                                |
| 后端端点    | `endpoints({ apis?, from?, source: 文件或 glob 数组 })`               | D25（端点路径的唯一出处）                                                      |
| HTTP 客户端 | `http(axiosKit())` → `endpoints({ from: callSiteSources.http.apis })` | D25 认得 axios 的请求方法（库的事实进它自己的适配器）                          |
| 失败策略    | `errorPolicy({ policyIn, policyProps? })`                             | D30（重试 / 退避 / 条件重试的落点；数字型归 D20）                              |
| 权限点      | `permissions({ apis, source })`                                       | D29（权限点名的唯一出处）+ S38（判断只许在守卫落点）                           |

`callSites` 的 `from` 用**导出的常量**（编辑器可补全、拼错立刻可见）：

```js
import { callSites, callSiteSources } from '@arch-guard/core'

callSites([
  { name: '本地存储', from: callSiteSources.platform.storage, in: ['src/shared/lib/storage.ts'] },
  { name: '埋点上报', from: callSiteSources.analytics.gtag, in: ['src/shared/lib/analytics/**'] },
  {
    name: '全局单例',
    from: callSiteSources.dataLayer.singletons,
    in: ['src/shared/api/queryClient.ts'],
  },
])
```

| 来源常量                                                    | 给哪些 API 名                                                                           | 谁的事实                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `callSiteSources.platform.storage` / `.timers` / `.network` | `localStorage` `sessionStorage` / `setTimeout` `setInterval` / `fetch` `XMLHttpRequest` | 浏览器平台（数据表）                           |
| `callSiteSources.analytics.gtag` / `.segment` / `.sentry`   | `gtag` / `analytics.track` … / `Sentry.captureException` …                              | 分析 SDK（数据表）                             |
| `callSiteSources.dataLayer.singletons`                      | `QueryClient`                                                                           | **你选的 kit**（`reactQueryKit().singletons`） |

项目**自己的封装**（`appToast.success` 之类）不属于任何来源，显式写 `apis`；一组里 `apis` 与 `from` 同时给时 `apis` 优先。
常量与 id 表**同源**（`callSiteSources` 从 `CALL_SITE_SOURCE_IDS` 派生），加来源只改数据表一处。

kit 工厂与它们的参数：

| kit                                         | 参数                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `antdKit()` · `noneKit()`                   | 无                                                                                     |
| `i18nextKit({…})` · `noneI18nKit()`         | `resourceDir` · `languages` · `fn`（默认 `t`）· `hook`（默认 `useTranslation`）        |
| `reactRouterKit({…})` · `noneRouterKit()`   | `routeFiles` · `pathSource` · `pathProps` · `navigateCalls`                            |
| `reactQueryKit({…})` · `noneDataLayerKit()` | `queryKeyFrom`（字符串或数组，每项可 glob）· `queryKeyProps` · `fetchIn` · `fetchApis` |
| `endpoints({…})`                            | `apis`（哪些调用算打后端）· `source`（端点写在哪）                                     |
| `cssModulesKit({…})` · `noneStylesKit()`    | `modulePatterns` · `examples`（自定义正则**必须**给样例）                              |

### 2.4 组合糖 `stack()`

`stack()` 不含任何硬编码：组件库 / i18n 方案 / 语言 / 白名单全部由你传，
不传就是"声明空能力"（对应规则明列停用）。它返回**预设数组**，所以要展开：

```js
import { antdKit, i18nextKit, stack } from '@arch-guard/core/presets'

presets: [
  canonical(),
  ...stack({
    designSystem: { styleDir: 'src/shared/styles' },
    deps: { allow: ['react', 'react-dom', 'antd', 'i18next', 'react-i18next'] },
    uiKit: antdKit(), // 换库只改这一行；不用库写 noneKit()
    i18n: i18nextKit({ languages: ['zh-CN', 'en'] }), // 换 i18n 只改这一行
    metrics: { coverage: { report: 'coverage/coverage-summary.json' } }, // 给了才加
  }),
]
```

不用 `stack()` 就照它展开写：`designSystem(…) · copy() · deps(…) · hygiene() · i18n(kit) · uiKit(kit) · metrics(…)`。

### 2.5 声明 → 规则（照 `requires` 与"声明才判"的参数排）

> `requires` 缺了 → 规则**明列停用**（`skipped[]` / `capability-missing`）；
> 表里带"声明才判"的参数（`valueWhitelists` / `numberHomes` / `staticPrefix`…）缺了 → 规则在跑，
> 但那一族/那一半不产生结论（例如 `valueWhitelists` 只声明 D13 时，长度与时长的数值不判）。

| 声明                                       | 打开的规则                                              |
| ------------------------------------------ | ------------------------------------------------------- |
| `designSystem.paletteFile`                 | D01 · D02 · D03 · D21                                   |
| `designSystem.tokenDir`                    | D01 · D21                                               |
| `designSystem.staticPrefix`                | D02 · D18                                               |
| `designSystem.themeFile`                   | D06 · D07                                               |
| `designSystem.styleDir`                    | D12 · D13 · D14 · D15 · D16                             |
| `designSystem.valueWhitelists`             | D12 · D13 · D14 · D15（内联 `style` 与 CSS 同一套刻度） |
| `designSystem.numberHomes`                 | D20                                                     |
| `designSystem.vendorDir`                   | D09 · D10 · D10b                                        |
| `designSystem.storageFile`                 | D08                                                     |
| `i18n.resourceDir`                         | C01–C07                                                 |
| `router.pathSource`                        | D23                                                     |
| `dataLayer.queryKeyFrom`                   | D22                                                     |
| `dataLayer.fetchIn` · `fetchApis`          | S36                                                     |
| `callSites.groups`                         | S38                                                     |
| `analytics.apis` · `analytics.eventSource` | D24                                                     |
| `envReads.apis` · `envReads.in`            | S44                                                     |
| `uiKit.vendorSelectors`                    | D10 · D10b                                              |
| `uiKit.detachedApis`                       | H06                                                     |
| `uiKit.icons`                              | P05                                                     |
| `uiKit.packages`                           | P11                                                     |
| `metrics.coverage`                         | M02–M06                                                 |
| `metrics.tests`                            | M08                                                     |
| `metrics.checkChain`                       | M09                                                     |
| `structure.lazyViews`                      | S37                                                     |

**没声明的能力 = 规则不跑，并在报告里明列**（`skipped[]` + `code: 'capability-missing'`）。
"明列停用"是刻意的：安静地少跑一批规则，比多报更危险。

---

### 2.6 文案的复数形态（i18next）

`t('orders.count', { count })` 取的是 `count_one` / `count_other` 这类键；**各语言的复数分类本来就不同**
（英文 `_one` + `_other`，中文只有 `_other`），所以：

| 规则              | 复数口径                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| C02（键必须存在） | `t('orders.count')` 认 `orders.count_one` / `_other` —— 不会因为"基键没写"报错 |
| C03（两语言同构） | 按**基键**对账：两边都有 `orders.count` 就算齐（不要求逐键全等）               |
| C06（死键）       | 复数变体由基键的使用点亮，不会被当成死键                                       |

```ts
// locales/en/orders.ts
export default { count_one: '{{count}} order', count_other: '{{count}} orders' }
// locales/zh-CN/orders.ts（CLDR：中文只有 other）
export default { count_other: '共 {{count}} 个订单' }
```

### 2.7 切片互引：`@x`（FSD）

同层切片默认不许互引；官方留的唯一出口是 `<provider>/@x/<consumer>.ts`（只放行被指名的那一侧；引用走别名：`@/entities/<provider>/@x/<consumer>`）。
详见 [`PARADIGM.md`](../PARADIGM.md) §6.10 —— 规则侧是 S22 / S23 的同一条例外。

### 2.8 权限点与租户上下文（R-110）

这两件事企业里最常出事故，各有**一个落点**：

```js
permissions({ apis: ['can'], source: 'src/shared/auth/permissions.ts' }),  // 权限点名的唯一出处（D29）
callSites([
  { name: '权限判断', apis: ['permissions.includes'], in: ['src/shared/auth/**'] },   // 判断写在哪儿（S38）
  { name: '租户上下文', apis: ['searchParams.get'],
    args: ['tenantId', 'tenant'], in: ['src/shared/tenant/**'] },                     // 租户从哪儿拿（S38 + args）
]),
```

- `can('crew:edit')` 写字面量 → D29 报；`can(PERMISSIONS.crewEdit)` 合规。
- 页面里 `searchParams.get('tenantId')` → S38 报；`get('page')` **不报**（`args` 把泛 API 收窄了）。
- **不判的**（判据不稳）：`user.role === 'admin'` 这类**比较**形态（事实模型看不见，且展示与决策不可区分）、
  请求有没有带租户维度（租户可能在 header / cookie / token 里、由服务端定）—— 那两半交给 review 与 E2E。

### 2.9 失败处理的策略（R-111）

`retry: 3` 这类**数字**已经有家（D20 `numberHomes`），但**形态**它看不见：

```js
errorPolicy({ policyIn: ['src/shared/api/policy.ts', 'src/modules/<域>/model/query.ts'] }),
// 名字可以不写 —— 装了 react-query kit 就由它的 policyProps 给（retry / retryDelay / backoff / shouldRetry）
```

- 家里写 `retry: (count, err) => count < 3 && err.status >= 500`、`backoff: 'exponential'` → 合规；
- 家外（`useQuery({ retry: (n) => n < 5 })`）→ D30 报；
- **数字型**（`retry: 3`）归 D20，**引用**（`retry: RETRY_LIMIT`）不报 —— 同一处不会两条都报；
- **边界（实测逼出来的）**：只判"策略对象**作为调用实参**"。`retry` 这个名字会撞 —— 示例里
  `queryState.ts` 的 UI 回调、i18n 的 `retry: '重试'` 都叫 retry，误报了两处，于是收窄到调用实参。

### 2.10 E2E / 契约测试的落点（R-112）

`metrics({ tests: { homes: [...] } })` 给**每一层**测试一个落点：

```js
metrics({
  tests: {
    testGlobs: ['src/**/*.test.ts'],
    homes: [
      { name: 'e2e', glob: 'e2e/**/*.spec.ts', imports: 'public' },
      { name: 'contract', glob: 'tests/contract/**', mustImport: ['src/shared/api/generated/**'] },
    ],
  },
}),
// 别忘了 `include: ['src/**', 'e2e/**', 'tests/**']` —— 测试层不进契约域，落点会被当成空的
// 应用入口要进 `entries`（`app:bootstrap` 只是 slot，没标 entry）：
//   overrides: { entries: ['src/app/main.tsx'], addRoles: [{ id: 'e2e', pattern: 'e2e/**', layer: 99 }] }
```

- `imports: 'public'`：e2e 只许经**公开面 / 应用入口** —— 直引域内组件即报（M10）；
- `mustImport`：契约测试必须**真的引用**生成的契约产物，否则后端加字段没人发现（M10）；
- 声明的落点一个文件都没匹配到 → 点名（声明了却没建目录 = 这条纪律没在跑）；
- **边界**：同层内部的 import（e2e 引 e2e 的 helper）放行；目标是 `test` 角色放行；
  `mustImport` 的产物还不存在时放过（"还没生成" ≠ "没对账"）；`imports` 缺省 = 不限制（单测）。

## 3. 命令参考

```bash
arch-guard [options]
```

| 选项                           | 作用                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--config <path>`              | 配置文件路径（默认 `arch.config.mjs`）                                                                                                                                         |
| `--scope <mode>`               | `full`（默认）· `changed` · `staged` · `since:<ref>`（见 §4）                                                                                                                  |
| `--paths <globs>`              | 只报告匹配路径（逗号分隔）；**零匹配 = 退出码 2**                                                                                                                              |
| `--domain <letters>`           | 只跑指定域：`S,D,C,P,H,M`                                                                                                                                                      |
| `--only <ids>`                 | 只跑指定规则（逗号分隔）                                                                                                                                                       |
| `--min-level <level>`          | 只跑判定等级不低于下限的规则：`L1`（路径级）· `L2`（单文件 AST）· `L3`（依赖图）                                                                                               |
| `--severity <s>`               | 只报告 `error` 或 `warn`                                                                                                                                                       |
| `--format <f>`                 | `pretty`（默认）· `json` · `github`（CI 注解）                                                                                                                                 |
| `--brief`                      | 附录只给一行摘要（自述 / 停用 / 例外各有几条，去掉 `--brief` 展开）                                                                                                            |
| 颜色                           | 自动：`NO_COLOR` 非空即无色（最高优先级）· `FORCE_COLOR` 非空就表态（`0` / `false` = 显式关色，其余强制有色）· `TERM=dumb` 视为无色 · 都没有时只在终端上色（管道 / CI 里无色） |
| `--stats`                      | 每条规则的耗时与命中数（排查"为什么这么慢"/"这条规则该不该留"）                                                                                                                |
| `--no-cache`                   | 不做 facts 持久缓存（每轮全量解析）                                                                                                                                            |
| `--verify-deps`                | 只对账：适配表声明的包 vs `package.json` 实际依赖（不跑规则）                                                                                                                  |
| `--explain <paths 或规则 id>`  | **写代码之前**问契约（角色 / 能依赖谁 / 该放哪 / 适用规则）；退出码恒 0                                                                                                        |
| `--list-rules`                 | **规则目录**：当前规则集里有哪些规则（`id` / 等级 / 严重度 / 标题 / 需要什么声明），按域分组；配 `--format=json` 给 agent 读；退出码恒 0                                       |
| `--report-only`                | 只报告，不因 error 退出非零                                                                                                                                                    |
| `--local-only`                 | `scope` 非全量时允许跳过不可归属的全局违规（会打印跳过条数）                                                                                                                   |
| `--coverage-report <path>`     | 覆盖率产物路径（覆盖 metrics 适配器里的配置）                                                                                                                                  |
| `--update-coverage`            | 刷新覆盖率棘轮快照（M04）；**与"豁免违规"无关**                                                                                                                                |
| `--render-docs`                | 把文档里的管理块按 `arch.config.mjs` 重写（见 §7）                                                                                                                             |
| `--check-docs`                 | 只校验管理块：漂移即失败                                                                                                                                                       |
| `--self-test`                  | 夹具回归（维护本体用）                                                                                                                                                         |
| `--self-check-portability`     | 本体自包含 P1–P4（维护本体用）                                                                                                                                                 |
| `arch-guard init`              | 生成起点配置：`--paradigm canonical\|fsd\|library` · `--ui antd\|none` · `--data react-query\|none` · `--i18n i18next\|none` · `--langs zh-CN,en` · `--out` · `--force`        |
| `-v, --version` · `-h, --help` | 版本 / 帮助                                                                                                                                                                    |

### 3.1 常用组合

```bash
# CI（提交前 / PR）
arch-guard --scope=full --format=github     # GitHub 注解
arch-guard --scope=since:origin/main        # 只看这次 PR 动过的
arch-guard --format=json > guard.json       # 给 bot / 插件消费

# 本地
arch-guard --scope=changed                  # agent 迭代：只报告变更（含未跟踪）
arch-guard --scope=staged                   # pre-commit：读 index 内容，不读工作区
arch-guard --domain=D --min-level=L2        # 只看设计系统，跳过纯路径规则
arch-guard --explain src/modules/crews/views/CrewsList.tsx   # ★ 写之前先问
arch-guard --list-rules                     # 当前规则集有哪些（含配置里自定义 pack 的规则）

# 排查
arch-guard --stats                          # 哪条规则最贵 / 命中最多
arch-guard --verify-deps                    # 适配表 vs package.json
arch-guard --no-cache                       # 怀疑缓存时
```

---

## 4. 检测范围（`--scope`）

> **scope 只过滤报告，不过滤正确性。**语义的权威表述在 [`../PARADIGM.md`](../PARADIGM.md) §9。

| 场景        | 命令                        | 说明                          |
| ----------- | --------------------------- | ----------------------------- |
| CI / 提交前 | `--scope=full`（默认）      | 全项目                        |
| pre-commit  | `--scope=staged`            | 读 **index** 内容，不读工作区 |
| agent 迭代  | `--scope=changed`           | 含未跟踪文件                  |
| PR          | `--scope=since:origin/main` | 与某个 ref 的差异             |

**安全语义**（这几条是不能省的）：

- facts **按文件缓存**（增量），**图与全局谓词每轮全量重建** —— 所以不会出现 stale-cache 假绿；
- **不可归属的全局违规默认仍然失败**（只有显式 `--local-only` 才允许跳过，且会打印跳过条数）；
- 无 git / 空 diff / staged 失败都有明确提示（`scope-degraded-no-git` / `staged-fallback` 等 notice），**绝不静默降级**；
- `include` 非空却 0 个文件 → 由 **S24** 直接报错。

---

## 5. 例外（唯一的宽松通道）

> 语义权威在 [`../PARADIGM.md`](../PARADIGM.md) §7；这里只讲怎么写、什么时候写。

```js
overrides: {
  exceptions: [
    // 「这条规则对这类文件不适用」—— 不是「这个文件免检」
    { rule: 'H08', glob: 'src/shared/config/**', reason: '地址唯一出处（本地兜底值）', expires: '2026-12-31' },
  ],
}
```

- `rule` 拼错 → **直接报错**（否则"例外没生效"是假绿）；`reason` 必填；`expires` 写了就**过期即红**；
- 每次运行都会**点名**每条例外（命中几处 / 未命中），未命中的提示"可能可以删掉"；
- 实现是**后置过滤**：文件照常有角色、进依赖图、被其它规则判定；
- **没有内联豁免注释**（连 `eslint-disable` 本身都是红线 H02）。

### 5.1 三个高频场景

| 场景                                            | 怎么写                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目自己的目录（`src/features/**`）             | `addRoles: [{ id: 'module:views', pattern: '…', layer: 10, slot: 'views' }]`，**不是** `roles`                                                    |
| dev-only 形态（Storybook 故事 / dev-only 模块） | `addRoles: [{ id: 'test', pattern: '**/*.stories.{ts,tsx}', layer: 99, exclusive: true }]` —— 这条"非生产"豁免被 H07/H08/H09/C01/S36/S38/S44 共用 |
| 确实要留在代码里的本地地址兜底值                | 规则级 `exceptions`（首选仍是**地址进环境变量**，见 [`../PARADIGM.md`](../PARADIGM.md) §7.1）                                                     |

> 别和**覆盖率棘轮**（M04）混淆：它比的是覆盖率快照（`--update-coverage` 维护），不豁免任何违规。

---

## 6. 退出码与 `ok`（两者故意不同）

| 场景                             | 退出码                                           |
| -------------------------------- | ------------------------------------------------ |
| full / changed，有 error         | 非零（`1`）                                      |
| changed，仅全局 error（默认）    | 非零                                             |
| `--local-only` 且有全局 error    | 零（打印跳过条数）                               |
| `--report-only`                  | 零（仅警告）                                     |
| `--paths` **一个文件都没匹配上** | **2**（请求无法满足）                            |
| 配置错 / 未知等级 / 未知格式     | **2**                                            |
| 扫描到的文件语法坏了             | **2**（fail-closed，信息带 `文件:行:列 + 原因`） |
| 引擎 / 解析异常                  | **永远非零**                                     |
| `--explain`                      | 恒 `0`（这是查询，不是判决）                     |

- **退出码回答"要不要拦"**；JSON 里的 **`ok` 回答"结论是不是通过"** —— 两者不一致是**设计**：
  `ok` 的两条判据是"判过的东西没有 error"**且**"确实判了"（`paths === null` 或 `matched > 0`，且 `scopeFiles > 0`）。
- 只读 stdout 的消费方以 `ok` 为准，别把两者对齐（对齐会产生 `ok: true` 与 `errors: 3` 并存）。

---

## 7. 读报告

### 7.1 三种格式

| `--format=` | 用途                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `pretty`    | 人读（默认）：按域分组、给出修法提示、末尾摘要 + 停用规则 + 例外点名 |
| `json`      | 机读契约：给 CI / PR bot / IDE 插件 / agent                          |
| `github`    | GitHub Actions 注解（纯文本，**没有 code**；要判状态请用 `json`）    |

**给编码 agent 的三条**：① 断言 `apiVersion`；② 结论看 `ok` + `errors`，**不要**只匹配文案；
③ `skipped[].recipe` 是"可以直接粘进配置的那一行"（agent 补能力时不必再跑一次 pretty）—— 但**按
`rule` / `missing` 判**，别匹配 `recipe` 的措辞（它是内部细节）。定位用 `findings[].file/line/column`

- `hint`（怎么改），退出码 0/1/2 分别代表通过 / 有 error / 用法或配置错。

**机读出口的 stdout 是干净的**：`--format=json` 产出一个完整 JSON 文档、`--format=github` 产出注解，
两者都不会被别的东西污染 —— `--stats` 在机读格式下走 **stderr**（人仍看得见，解析器不受影响）。

### 7.2 JSON 顶层字段（19 个，被 `tests/report-contract.test.mjs` 冻结）

`apiVersion` · `ok` · `scope` · `scopeFiles` · `contractScope` · `rulesEnabled` · `rulesTotal` ·
`findings` · `errors` · `warnings` · `globalFindings` · `outsideContract` · `skipped` ·
`skippedGlobals` · `filteredBySeverity` · `exceptions` · `paths` · `notices` · `durationMs`

要点：

- **`notices: [{ code, text }]`**：按 `code` 判，**文案不是契约**（随时可改）；`code` 清单在 `src/engine/codes.ts`，
  经 `NOTICE_CODES` / `isNoticeCode` 导出。消费方三条纪律（断言 `apiVersion` · 未知 code 明说 · 已知 code 用穷举映射）
  见 [`DESIGN.md`](./DESIGN.md) §6.9 与 `README.md` 的示例。
- **`code: 'declaration-no-match'`**：**声明配了却 0 命中** —— 那条纪律这次什么都没看（`structure.*` 的 glob / 维度，
  以及方案面的 `callSites` / `envReads` / `analytics` / `router.pathSource` / `dataLayer.queryKeyFrom` /
  `designSystem.numberHomes`）。名字或路径写错一个字母就会命中它：**先看这条，再看 findings** ——
  否则"生效的适配器：analytics=declared"会让你以为纪律在跑。
- **`code: 'copy-list-source'`**：C01 的「组件库调用里的文案」那一半**名单取自哪里** ——
  `copy({ messageApis }) 项目声明` / `uiKit(antd) 默认` / `copy({ messageApis: [] }) 显式关掉` /
  `无 —— 这一半没在判`。**换组件库时看这一行**：换到一个没声明 `messageApis` 的 kit，那一半会安静关掉，
  报告不会报错（这条自述就是为了让"少判一半"看得见）。
- **机读 ⊇ 人读**：摘要行里的每个数字 JSON 里都有。
- **`skipped[]`**：本次**没跑**的规则，每条带稳定 `code`（R-142 起三种：`capability-missing` 缺能力 /
  `not-enabled` 不在 `enable` 名单里 / `filtered` 被 CLI 过滤器收窄），`reason` 只给人看。
  `missing` **当且仅当** `capability-missing` 时非空 —— 机读侧按 `code` 分支，不要解析中文 `reason`。
- **`exceptions[]`**：每条例外的命中数（0 = 未命中，提示可以删）。
- **`paths: { requested, matched }`**：`null` = 没问；`matched: 0` = 问了没命中（退出码 2 + `ok: false`）。

### 7.3 `apiVersion` 变更分级

| 级别           | 例子                                               | `apiVersion`  | 消费方会怎样                                 |
| -------------- | -------------------------------------------------- | ------------- | -------------------------------------------- |
| **破坏性**     | 删/改名 code、改字段含义、删顶层字段、改退出码语义 | **必须 bump** | 断言版本 → 直接拒绝运行                      |
| **兼容性新增** | 新增 code、新增顶层字段                            | 不 bump       | 穷举映射的编译期就红；**CHANGELOG 单独标注** |

当前 `apiVersion = 2`（v2 把 `ok` 语义收窄，属**破坏性**变更）。权威表述见 [`DESIGN.md`](./DESIGN.md) §6.9。

---

## 7.3 给编码 agent / 编辑器 hook 的接入

这个工具的主要用法是**编码 agent 触发自动诊断**（非 TTY、读 stdout、token 敏感）。所以分**两层**：
**编辑时单文件快查**（快、反馈落在刚写的代码上）+ **收尾/提交前全量**（跨文件规则只有全量才看得见）。

### 编辑 hook（每个文件写入后触发）

```bash
# $FILE = 被改文件的**绝对路径**（--paths 收绝对路径）
pnpm exec arch-guard --paths "$FILE" --brief --format=json
```

- 实测：热缓存 **约 0.65s**（含 node 启动）；非 TTY 自动无色 ✓；输出**确定**（除 `durationMs` 外逐字节一致，可 diff）
- 退出码：`0` 通过（只有 warn 也算）· `1` 有 error 级违规 · `2` 用法/配置错（**不是代码问题**）
- **为什么 hook 只查单文件**：快，且反馈正好落在刚写的那段。但**声明类**违规（如"shared 只被一个域用"
  → 报在**那个 shared 文件**上）单文件查不到 → 所以**收尾必须跑全量**。

### 收尾 / 提交前（全量）

```bash
pnpm exec arch-guard                 # 全量；项目若接进 check，直接 pnpm check
pnpm exec arch-guard --scope=staged  # pre-commit：读 **index** 内容，不是工作区（hook 经典坑）
```

### agent 该读什么

| 字段                                           | 用途                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `ok` + `errors` / `warnings`                   | 结论。**别匹配文案**（文案随时可改）                                  |
| `findings[].file` / `line` / `column` + `hint` | 哪里、怎么改（`hint` 是可直接执行的那句话）                           |
| `skipped[].recipe`                             | 缺能力时**可以直接粘进配置的那一行**（agent 自服务，不必再跑 pretty） |
| `notices[].code`                               | 自述按 **code** 判；`--brief` 下只给 code（`text` 不是契约）          |
| `apiVersion`                                   | 启动时断言；不认识就明说"不认识这版报告"，别少读几个字段装绿          |

### 写代码**之前**先问（比事后修便宜）

```bash
pnpm exec arch-guard --explain src/modules/crews/views/CrewsPage.tsx  # 这个文件该放哪、能依赖谁
pnpm exec arch-guard --explain D29                                    # 这条规则管什么、要我声明什么
```

### 可直接粘的 hook 脚本

```bash
#!/usr/bin/env bash
# 编辑/写入 hook：给一个被改文件的绝对路径。永远 exit 0 —— hook 不该阻断编辑器，
# 把 JSON 交给 agent 让它自己决定改不改。
set -u
file="${1:?用法: guard-hook.sh <被改文件的绝对路径>}"
out="$(pnpm exec arch-guard --paths "$file" --brief --format=json 2>&1)"
code=$?
printf '%s\n' "$out"
if [ "$code" = "2" ]; then
  echo "⚠ arch-guard 用法/配置有问题（不是刚改的代码的问题）" >&2
fi
exit 0
```

> 首次跑一次 `pnpm exec arch-guard` 让缓存热起来（之后每个文件的解析结果都有缓存）；
> 缓存位置跟 Vite 同一策略：优先 `node_modules/.arch-guard-cache`，没有 `node_modules` 时退回项目根
> （那种情况记得加进 `.gitignore`）。

## 8. 接进项目（宿主侧清单）

### 8.1 该装哪些工具（委派出去的覆盖责任）

本体**不做**单文件语法卫生，那部分委派给 eslint；其余生态工具是**补充**（0.4.0 已把 D01/D02/D09/D12–D14/P03/P08 收回本体）：

| 工具                       | 管什么                                                  | 必需？               |
| -------------------------- | ------------------------------------------------------- | -------------------- |
| eslint + typescript-eslint | H01–H05（`any` / 非空断言 / console / TODO / 空 catch） | **必需**（本体不做） |
| stylelint                  | 颜色 / `!important` / 数值白名单的**补充**              | 可选                 |
| dependency-cruiser         | 环 / 孤儿文件的**补充**（本体 S08 / S15 已判）          | 可选                 |
| knip / depcheck            | 幽灵依赖 / 声明未用的**补充**（本体 P03 / P08 已判）    | 可选                 |

> **委派 ≠ 有人在管**：宿主没装、没配、没跑，那一类就是零覆盖。逐条评估见
> [`DELEGATION-REVIEW.md`](./DELEGATION-REVIEW.md)。

### 8.2 scripts 与门禁链路

```json
{
  "scripts": {
    "guard": "arch-guard",
    "guard:changed": "arch-guard --scope=changed",
    "guard:docs": "arch-guard --check-docs",
    "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm coverage && pnpm guard && pnpm guard:docs"
  }
}
```

把 `guard` 放进你已有的 `check` 链路（跟 lint / test 并列），而不是另开一个没人跑的命令。
用 `metrics({ tests: { checkChain: { script: 'check', require: ['test', 'coverage'] } } })` 让 **M09** 盯着
"test / coverage 有没有被从 check 里摘掉" —— 这类漏跑只有门禁自己能查。

### 8.3 CI（GitHub Actions 示例）

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm check
- run: npx arch-guard --scope=since:origin/main --format=github
```

### 8.4 让文档与配置同一份真相

`arch.config.mjs` 是唯一机读真相，但文档里的角色表 / 阈值 / 选型表是**手抄**的 —— 用管理块消掉这层手抄：

```md
<!-- arch-guard:begin roles -->

（本节由 `arch-guard --render-docs` 生成，别手改）
<!-- arch-guard:end roles -->
```

```bash
arch-guard --render-docs    # 按配置重写块内容
arch-guard --check-docs     # 只校验：不一致即红
```

可用块名：`deps` · `thresholds` · `layout` · `structure` · `scan-scope` · `roles` · `params` · `exceptions`。
**块名拼错直接报错**（否则"文档已同步"是假象）。宿主架构说明的起手模板见
[`templates/ARCHITECTURE.md.template`](./templates/ARCHITECTURE.md.template)。

### 8.5 缓存与速度

- 解析（把每个文件拆成事实）是唯一昂贵的一步，结果**按文件缓存**：
  键 = `rel + role + 文件内容哈希`，整份缓存的键 = 事实模型版本 + TypeScript 版本 —— 内容或角色一变就重算，
  **不会读到旧结果**；图与全局谓词每轮全量重建。
- 位置跟 Vite 一样：有 `node_modules` 就写 `node_modules/.arch-guard-cache/facts.json.gz`，
  否则退回项目根 `.arch-guard-cache/`；每次运行打印命中数与路径；`--no-cache` 可关。
- 实测（3043 个 ts 文件 / 21.5 万行）：冷跑 5.9s → 热跑 **1.2s**。

---

## 9. 常见任务

| 任务                             | 怎么做                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **新项目从零接入**               | ① 选范式（`canonical` / `library` / `fsd`）② 加域预设（`designSystem` / `copy` / `deps` / `metrics` / `hygiene`）③ 加方案面（`uiKit` / `i18n` …）④ 补 `params` 落点 ⑤ 进 CI ⑥ `--render-docs` 同步文档                                                                                                                                                                                                                                                                                                                                     |
| **想看「配全」长什么样**         | 两份对称的活样板：[`examples/full/`](../examples/full/)（`canonical()` 三根拓扑，**102/107 在跑**）与 [`examples/full-fsd/`](../examples/full-fsd/)（`fsd()` 六层切片，**91/107**）。两者都是 0 finding；差的那几条：M02–M06 覆盖率五条要一份比 HEAD 新的产物（入库的必然过期，本仓自己也不声明 `coverage`），FSD 另有 S13 / S37 明列停用 + 9 条应用专属规则不适用。最短可用看 [`examples/minimal/`](../examples/minimal/)（71/107）                                                                                                       |
| **已有项目接入（存量很多违规）** | 没有基线可刷：先用 `include` 把契约域**收窄到已经守得住的部分**，再逐块放开；`--explain` 先问清落点；确实不适用的写 `exceptions`（带理由）                                                                                                                                                                                                                                                                                                                                                                                                 |
| **换组件库 / 不用组件库**        | 改 `uiKit(antdKit() → 你的 kit → noneKit())` 一行；适配器约 30 行（`packages` / `vendorSelectors` / `detachedApis` / `examples`）。**换完旧库残留一条不剩**是可判定验收条件                                                                                                                                                                                                                                                                                                                                                                |
| **换 i18n / 不用 i18n**          | `i18n(i18nextKit({…}) → 你的 kit → noneI18nKit())`；不用 i18n 时 C 域整体不注册                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **迁移到 FSD**                   | 换 `canonical()` → `fsd()`，按层声明 `slicedLayers` / `segments`；分组切片要显式开 `slicesGrouped`（两种形态无法用一组 glob 同时表达）                                                                                                                                                                                                                                                                                                                                                                                                     |
| **写代码前问契约**               | `arch-guard --explain <路径>`（路径还没写也能问：它会告诉你该放哪）                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **加一条自己的规则**             | 需求进 `REQUIREMENTS.md` → 设计进 `docs/DESIGN.md` → 规格进 `.scratch/<slug>/spec.md` → `createRule()` + `__fixtures__/` 夹具（违规必报 × 合规不报）→ 见 [`../AGENTS.md`](../AGENTS.md)。**加自己的规则只写一行**：`overrides: { customRules: [自己的规则] }`（`createRule()` 产出）—— 与内置规则集**并集**，同 id 同 title 幂等、不同 title 配置期报错；`--explain <id>` / `--list-rules` 直接看得到。程序化调用要**整体替换**规则集时用 `runGuard({ ruleSet })`（CLI 看不到那种规则集，自己调 `explainRules()` / `renderRuleCatalog()`） |
| **本地地址 / dev-only 形态**     | 见 §5.1 与 [`../PARADIGM.md`](../PARADIGM.md) §7.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## 9.1 配置写错会在**配置期**报错（不是静默忽略）

如果键名拼错、或者**放错一层**（`addRoles` / `include` / `entries` 属于 `overrides`，不是 `overrides.structure`），
加载时就会失败并列出可用键：

```
✖ 引擎异常：overrides.structure 里有不认识的键：addRoles
可用：order / isolate / publicApi / … / generated
提示：结构声明（层序 / 隔离 / 公开面…）写在 `structure` 里；`addRoles` 在它**外面**（overrides 层）。
```

"声明 0 命中"覆盖的**名字清单**（拼错一个字母 = 那条规则静默不判）：`analytics.apis` ·
`endpoints.apis` · `permissions.apis` · `callSites[].apis` · `callSites[].args` · `errorPolicy.policyProps`
（以及各落点 glob）。**边界**：用 `from:` / kit 给的**既有清单**不报 —— 它们天然包含"这次没用到"的项，
报了只会逼宿主把清单收窄（R-92）。

同一类校验还有：适配器字段（`defineAdapter` 的白名单）、未知 facet / 未知配置键（R-113）、
`specVersion` 不匹配。**边界**：`params` 里的键由范式 / kit 决定，不在此列。

### 9.1.1 双运行时：面在哪、谁能进（`runtimes` / `faces`）

宿主半侧（Node）+ 浏览器半侧的项目，一个域往往有**两个面**：宿主面 `index.ts`、浏览器面 `client.ts`。
层号只能表达"向下依赖"，表达不了"两个运行时互相隔离"（R-139 / R-140，见 [`adr/0008`](./adr/0008-runtime-faces-and-face-values.md)）：

```js
structure: {
  runtimes: [
    { name: 'host',   entries: ['src/app/host.ts'] },
    { name: 'client', entries: ['src/app/client.tsx'] },
  ],
  faces: [
    { pattern: 'src/modules/*/index.ts',  runtime: 'host',   value: '*Host' },
    { pattern: 'src/modules/*/client.ts', runtime: 'client', value: '*Client' },
  ],
}
```

- **消费者的运行时按可达性推导**：文件从哪个入口可达就属于哪个运行时 —— 于是**同构模块**
  （两个入口都可达）可以用任意面；孤儿不判（那是 S15 的事）。
- **面文件只许导出匹配 `value` 的值**（类型导出豁免）：内部实现从面里去掉，组内直接引内部文件 ——
  于是"面外拿到内部实现"在**提供侧**就不可能发生，不必逐 import 对账。
- **不判完备性**：只有宿主面的域、只有业务公开面的域都合法 —— 所以别把"业务公开面"
  （被两个运行时共用的域模型）列进 `faces`。
- 两条都是**空声明即不判**；`faces[].runtime` 指向没声明过的运行时会**在配置期报错**
  （否则那一档静默不生效）。

## 9.2 `apis` 的匹配形态（同名不同义时怎么收窄）

| 声明                | 命中                                             |
| ------------------- | ------------------------------------------------ |
| `fetch`             | `fetch(...)`                                     |
| `localStorage`      | `localStorage.getItem(...)`（对象前缀）          |
| `invalidateQueries` | `queryClient.invalidateQueries(...)`（方法后缀） |

**不是子串**（`can` 不吃 `cancel`）；一个调用声明命中多个时取**声明顺序里的第一个**。

**端点表跟域走还是集中？** `source` 收**一个文件或一组文件（glob）**：
`source: 'src/shared/api/endpoints.ts'`（集中）或 `source: ['src/modules/<域>/model/endpoints.ts']`（跟域走）。

判据要问**三件事**：① 谁发起下一次变更（外部批量 → 集中；本域迭代 → 跟域走）② 加一个域是**加文件**还是**改共享登记表** ③ 名空间是**全局**（URL / i18n 键 / 事件名 → 必须集中）还是**局部**（缓存键 / 分页大小 / 领域模型 → 跟域走）。速记：**外部（后端 / SDK / 分析团队）发起、一次改多个域 → 集中**
（一次后端发布 = 一个可整体审阅的 PR）；本域功能迭代天天改 → **跟域走**（域自治，别去敲共享文件）；
迁移中两种都写（数组）先立基线再逐域搬。**不变的一条**：同一份知识只能有一个家（D22–D26 在管）。
对照：缓存键 / 请求策略 / mapper 是前端自己的约定 → 一律跟域走（R-97 / A2）。
名字太泛（`get` / `can` / `track`）时不要靠匹配形态分辨，声明 `args: ['tenantId']` 把这一类收窄
（`callSites` 组支持 `args`；`endpoints` 用 `from` 拿来源表）。

**违规的定位是 `file:line:col`**（能拿到列号时）—— CI 注解也用 `col=`，编辑器点进去落在那一列。

## 9.3 架构建议（不阻断）

报告偶尔会多出一节建议 —— 它是从**已有事实**算出来的**可核对信号**，附**处方选项**，
**不影响退出码**（门禁该绿还是绿）：

```
· src/shared/api/client.ts 里有 4 个导出**各归各域**（fetchCrews→crews · fetchOrders→orders · …）：
  加 / 下线一个域都要改这个文件。
  常见处置：① 下沉到各自的域（跟着域走，判据见 PARADIGM §6.15）
            ② 若它确实是跨域中立的，把归属声明出来即可消掉这条建议
```

五条信号（每条都有保守阈值与"不报"边界）：

| 信号                                                                                               | 触发                                                                     | 提示什么                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| **各归各域**                                                                                       | 一个文件里 ≥3 个导出各自只被一个域用                                     | 这些东西跟域走更省心                           |
| **组粒度**                                                                                         | 某个组只有 1 个源文件 / >20 个                                           | "组"其实是一个文件 / 一个组装了俩业务          |
| **未测试的逻辑组**                                                                                 | 组里有逻辑（`lib`/`model`/`api`/`hooks` 里的非 JSX 文件）却整组 0 个测试 | 补一组测试，并纳入 `requireTestsFor`           |
| **同层组复用**                                                                                     | 一个组被 ≥3 个**同级或更内层**的组引用                                   | 它已经是公共依赖：提升到共享层，或明确声明     |
| **组级依赖环**                                                                                     | 组边图里的环（文件级可能没环，S08 看不见）                               | 共用部分下沉，或一侧单向依赖                   |
| **组间依赖链过深**                                                                                 | 链上 **≥4 个组**（每一跳都合法、也没有环）                               | 把链中间那组提升为共享层，让两端直接依赖公共件 |
| 为什么它不红：**规则**是"违规 → 红"，必须机械可判定、零误报；而"这坨东西该不该跟域走"是**判断** —— |
| 所以只给证据（谁 → 谁）和两条常见处置，由你决定。边界：纯类型导出不算（DTO 按域命名却该集中）、    |
| 被多个域共用不算（真跨域中立）、只数具名导入、公开面入口不算。                                     |

**确认某条建议不适用时，声明豁免（要写理由，报告里会自述"被豁免了几条"）**：

```js
overrides: {
  adviceAllow: [
    { signal: 'per-domain-exports', glob: 'src/shared/api/transport.ts',
      reason: '单文件传输层，四个域都只经它打后端', expires: '2099-01-01' },
  ],
}
```

形状与 `exceptions` 一致：**信号 id 拼错 → 配置期直接拒**；**写了到期就必过期**；
"声明了却没命中任何建议"的豁免会被点名（可能可以删掉）—— **豁免是可见的，不是关掉提示**。

## 10. 排查（症状 → 原因 → 怎么办）

| 症状                                      | 多半是                                                                                          | 怎么办                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 报告一片绿，但明显有问题                  | `include` 把它划出契约域 / `ignore` 吃掉 / 角色未命中                                           | 看摘要里的 `outsideContract` 与 `scan-empty` / `scan-scope-outside` notice         |
| 明明违规却没报                            | ① 能力未声明（规则**停用**）② `--min-level` / `--paths` / `--severity` 过滤 ③ 命中 `exceptions` | 看 `skipped[]`（`capability-missing`）· `filteredBySeverity` · `exceptions[]` 命中 |
| 报了"文件不在目录契约内"（S01）           | 目录没进角色表（新目录 / dev-only 形态）                                                        | `addRoles`（追加）；`--explain <路径>` 会告诉你该放哪                              |
| 退出码 0 但有 error                       | 用了 `--report-only`（或 `--local-only` 跳过全局违规）                                          | 看 `ok`：它才是"结论是否通过"                                                      |
| 退出码 2                                  | `--paths` 零匹配 / 配置错 / 未知等级或格式                                                      | 看 `notices[].code === 'paths-no-match'` 与 `paths.matched`                        |
| 例外写了却"未命中（可能可以删掉）"        | `glob` 没匹配到文件，或那条规则本来就没在这些文件上报                                           | 收紧/删掉它 —— 未命中的例外会被点名                                                |
| 变慢                                      | 冷缓存（解析是唯一昂贵的一步）                                                                  | 第二次跑看命中数；`--stats` 找最贵的规则                                           |
| 怀疑缓存读到旧结果                        | 不该发生（键含内容哈希 + 事实版本 + TS 版本）                                                   | `--no-cache` 复现一次；仍不一致请当 bug 报                                         |
| `Cannot find module 'arch-guard/presets'` | 包名写成 CLI 名了                                                                               | 用 `@arch-guard/core/presets`（§0）                                                |
| 装 `typescript@7` 报错                    | v7 是原生重写，JS 侧不再暴露编译期 API                                                          | 用 TS 5.4 – 6.x                                                                    |
| `--check-docs` 失败                       | 文档里的管理块与 `arch.config.mjs` 漂移，或块名拼错                                             | `--render-docs` 重写；块名清单见 §8.4                                              |

---

## 11. 谁来回答什么（别在两处找同一个答案）

| 问题                                                 | 去哪                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| 这个字段什么意思 / 这个选项怎么用                    | **本文**                                   |
| JSON 里这个 code 什么意思、能不能改、改了要不要 bump | [`DESIGN.md`](./DESIGN.md) §6.9            |
| 这条规则的判据、等级、为什么是这个等级               | [`DESIGN.md`](./DESIGN.md) §5              |
| 目录该怎么摆、角色 / 组 / 落点怎么定                 | [`../PARADIGM.md`](../PARADIGM.md)         |
| 某个词是什么意思（角色 / 组 / 方案面 / 唯一出处）    | [`../CONTEXT.md`](../CONTEXT.md)           |
| 这个痛点有没有被覆盖、谁在做                         | [`../REQUIREMENTS.md`](../REQUIREMENTS.md) |
| 本体内部怎么实现、哪些边界不能破                     | [`ARCHITECTURE.md`](./ARCHITECTURE.md)     |
| 每个版本实际改了什么                                 | [`../CHANGELOG.md`](../CHANGELOG.md)       |
