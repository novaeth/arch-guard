# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

> **发布流程（从 0.4.0 起严格执行）**
>
> - 发布时把 `[Unreleased]` 按类型**切分成版本段落**（`## [x.y.z] - YYYY-MM-DD`），不要留在 `Unreleased` 里。
> - **契约变更必须单独标注**：JSON 报告动过 `apiVersion`、`NOTICE_CODES` / `SKIP_CODES`，
>   或退出码语义有变 → 在该版本段落里写明「破坏性」与迁移方式（参照 `[0.3.5]` 那节的写法）。
> - **0.3.0–0.3.3 的章节是按 git 标签区间事后回填的**（此前全堆在 `[Unreleased]` 里，版本无从回溯）；
>   回填只搬位置、不改内容，归属依据是「该小节首次出现在哪个标签区间」。
> - **0.3.4–0.3.8 也是同样办法回填的**：切 `[0.4.0]` 时发现这几节其实早已随那些标签发布，只是堆在
>   `[Unreleased]` 里（归属按 `git tag --contains <引入该节的提交>` 判定）。
> - 理由：**0.3.0 / 0.3.1 / 0.3.2 没有独立章节**（内容都还堆在 `[Unreleased]` 里，事后无从回溯哪个版本动了什么）。
>   那次恰好一口气给 JSON 加了五个字段而无人可察 —— 消费方只能靠猜。版本记录是契约变更唯一的审计落点，
>   没有它，`apiVersion` 也只是一句口号。

## [Unreleased]

### Added（R-154：自定义 capability —— 宿主可以登记本体没有的能力）

- `deps({ capabilities })` 的值除字符串（`{ datetime: 'dayjs' }`）外，新增**对象形态**：

  ```js
  deps({
    capabilities: {
      'http-client': {
        preferred: 'axios',
        syntax: ['\\bfetch\\s*\\('],
        hint: '请求统一走 src/shared/api/client.ts 的 axios 封装',
      },
    },
  })
  ```

  对象可以带 `syntax`（强指纹）或 `softSyntax` + `apiNames`（P07 的两类证据）、`platform`、`allowOwn`、`note`。
  自定义能力与内置能力拼成**同一张生效表**：P06 / P07 / `policyConflicts` / `--render-docs` / `--verify-deps`
  不区分来源；`fingerprints` 覆盖也可以指向自定义能力。

- **配置阶段 fail-closed**：与内置能力重名（改内置证据请用 `fingerprints`）、pattern 编译不了、
  没有证据、`apiNames` 与 `softSyntax` 不成对、缺 `hint` —— 都在 `deps()` 抛错，不留「看起来能配」的口子。
- 新增夹具 `custom-capability`（自定义 `http-client`：裸 `fetch(` 违规必报 × import axios 的合规文件不报）
  与解析 / P06 / P07 / 校验单测；`docs/USAGE.md`、`docs/DESIGN.md` §16.1、`PARADIGM.md` §12.2 同步。

## [0.11.0] - 2026-10-08

> **契约与迁移（这一版必读 —— 退出码语义扩展 + 运行时依赖 2 → 8）**
>
> - **契约面**：`REPORT_API_VERSION` / JSON 顶层字段集 / `NOTICE_CODES` / `SKIP_CODES` **均未变**，
>   消费方不用改解析。
> - **退出码 2 的语义扩展（会对 CI 生效）**：扫描到的 `.css` / `.scss` / `.less` **语法坏了**现在**抛错并退 2**
>   （以前静默错解、照常 ✔）。CI 里的表现是"以前绿的仓库可能红"——那是修好了，不是回归。
>   **迁移**：先修语法；确实要把某份文件移出扫描范围就写进 `ignore`（那是项目边界）。
> - **运行时依赖 2 → 8**：`postcss` / `postcss-scss` / `postcss-less`（CSS 解析）·
>   `picomatch`（glob）· `postcss-value-parser`（CSS 值的词法）· `culori`（颜色与 WCAG）。
>   **宿主若开了 `deps({ allow })`，要把这几个加进白名单**，否则 P01「未登记即拒」会报。
> - **行为变更方向一律是"多报"**：以前**静默漏判 / 错判**的写法现在会显形 ——
>   glob 的字符类与 extglob 真的能用（`include` 欠匹配 = 静默不判）· `calc()` / `min()` / `var()` 回退里的数值
>   进 D12–D14 · `rgb()` / `hsl()` / 具名色 / `oklch()` 的颜色值进 D07 与 D03 ·
>   覆盖率产物读不懂时 fail-closed · 目录符号链接成环不再产出幻影路径。

### Changed（R-145：CSS 解析换成 postcss —— 手搓扫描器会静默错解，且是 O(n²)）

> **升级注意（行为变更，两处；`apiVersion` / `NOTICE_CODES` / `SKIP_CODES` 与退出码枚举均未变）**
>
> - **坏语法不再静默通过**：`.css` / `.scss` / `.less` 的语法错误（未闭合块 / 未闭合注释 / 未知词）
>   现在**抛错并以退出码 2 结束**，信息带 `文件:行:列 + 原因`。
>   **迁移**：先修语法；确实要把某份文件移出扫描范围就写进 `ignore`（那是项目边界）。
>   受影响的只可能是本来就解析不了的文件 —— 旧实现会把它静默错解（少判 + 照常 ✔）。
> - **at-rule 前奏不再算选择器**：`@media (…)` / `@layer …` 不再进 `selectors`，D10 / D10b / P11 的
>   vendor 选择器模式命中面收窄到**真选择器**。更正确，但若你的模式原本靠命中 at-rule 前奏生效会看到变化。

- **`parseCss` 改由 `postcss` 实现**（`src/engine/css.ts`）：导出 API 形状与行号语义不变，**规则层一行未改**
  （与 DESIGN §6.1.1「规则不消费 AST」同一口径）。按扩展名选语法，映射在纯数据表 `src/data/css-syntaxes.ts`：
  `.css` → postcss · `.scss` → `postcss-scss` · `.less` → `postcss-less`。
- **修掉三处静默错解**：值里的 `;` / `}` / `url(data:…)` 不再截断声明
  （旧实现 `.b{content:";}";background:url(data:…;base64,AAA=)}` 会丢掉整条 `background`）；
  at-rule 前奏不再污染选择器；`!important` 仍留在声明值里（D09 是拿 `value` 正则判的）。
- **性能**：行号不再逐条从头 `slice().split()` 算 → 从 **O(文件长度²)** 降到线性。
  实测同一批合成 CSS：46KB 70ms → 8ms · 139KB 568ms → 22ms · 279KB 2217ms → 29ms；
  而 `cssFiles(ctx)` 全仓 18 处调用、每次调用都重解析全部 CSS。
- **运行时依赖 2 → 5**：`postcss`（自身带 `nanoid` / `picocolors` / `source-map-js` 三个传递依赖）
  - `postcss-scss` + `postcss-less`（各 0 依赖）。三者已同时登记进 `deps({ allow })`、
    `metrics({ depsBudget })` 与 `portability.ts` 的 `ALLOWED_BARE_IMPORTS`，理由见 DESIGN §6.1.2。
    后两个是 Sass / Less 专有语法（`#{$x}` / `@{x}`）的托底 —— 不带它们等于"宿主用了 Sass 就直接红"。
- `CSS_EXTENSIONS` 改为由 `src/data/css-syntaxes.ts` 派生：扩展名与解析语法的**唯一出处**，
  不再一处写在 `scan.ts`、一处写在解析器里。
- 新增盘点文档 [`docs/DEPENDENCY-REVIEW.md`](./docs/DEPENDENCY-REVIEW.md)：
  引擎内部还有哪些手搓实现该换库（glob → picomatch、ANSI 颜色、色彩 NaN、`numericTokens`…），逐条带实测证据。
  其中**阶段一的三条 0 依赖问题已在本版修掉**，见下。

### Changed（R-149：glob 匹配换成 picomatch —— 手搓 glob 的欠匹配 = 静默不判）

> **升级注意**：唯一的行为变化是**"以前静默匹配不上的 glob，现在能匹配上了"** ——
> 原来写错或写宽的模式（字符类、extglob）会开始生效，报告可能多出条目；那是修复，不是回归。
> **点文件、尾随 `/**`、首字符 `!` 的语义都没变**（见下）。

- **`globToRegExp` 的实现改由 `picomatch` 承担**（`src/engine/util.ts`）：导出 API 不变（仍是 `(glob) => RegExp`），
  **全仓 23 个调用点零改动**。新增能力：`[...]` 字符类、extglob。
  修的是**静默不判** —— 手搓版把 `src/**/[a-z]*.ts` 的方括号转义成字面量 → 永不匹配，
  实测同一宿主换成这种同义写法后 `[S05]` 与 `[S08]` 两条 error 一起消失，
  而 S24 只在**整个**扫描域为空时才报（**部分欠匹配零诊断**）。
- **三个兼容口径显式定住**：`dot: true`（点文件仍被 `**` 命中，picomatch 默认不命中）；
  尾随 `/**` 再补一层 `/*`（标准 globstar 里 `a/**` 也匹配目录 `a` 本身，会让
  `src/features/{slice}/{segment}/**` 把 `index.tsx` 吃成 `segment = index.tsx`，与切片入口角色撞车 → S01 歧义，
  实测在 `fsd()` 的 pages/features 层成立）；`nonegate: true`（**不引入** `!` 取反语法）。
- 夹具 `include-custom` 改用 `include: ['src/**', 'scripts/**/[a-z]*.ts']` 并加一个 `Gen.ts` 作域外对照 ——
  旧实现下这条夹具会**少报 S01**，是端到端回归锁。
- **运行时依赖 5 → 6**（`deps({ allow })` / `metrics({ depsBudget })` / `portability.ts` 三处同步）。
- **加一层 glob 编译缓存**：picomatch 的编译比手搓慢约 4×（8 个 glob 一轮 14.8µs → 58µs），
  而仓里有几处是**按文件**调 `globToRegExp` 的（`structure-discipline` 的 `globs.some(...)` 每条记录一次）——
  缓存后同一轮 **2.2µs**，热路径比旧实现还快 ~7×；返回的仍是新 RegExp 实例，调用方互不影响。

### Changed（R-153：色彩词法与 WCAG 数学换成 culori —— 只认 hex 等于把 `rgb()` 令牌从判定面里删掉）

> **升级注意（行为变更，方向是"多报"）**：以前**只认 hex** 的颜色值现在按 CSS 全语法解析 ——
> 色板里用 `rgb()` / `hsl()` / 具名色 / `oklch()` 写的令牌，从此会真的进 D07（对比度）与 D03（色值唯一）。
> 受影响的宿主本来就在**静默漏判**（`contrastPairs` 里声明过的对，一对都没算）；
> 另外 D03 的色值身份从"hex 的拼写"变成"解析后的颜色" → `rgb(255, 90, 31)` 与 `#ff5a1f` 从此算同一个色值。

- **`src/engine/css.ts` 的颜色求值改由 `culori` 承担**：hex（3/4/6/8）· `rgb()` · `hsl()` · `hwb()` ·
  `lab()` / `lch()` / `oklab()` / `oklch()` · `color(display-p3 …)` · **具名色** · `transparent`。
  旧实现只认 `#hex`：色板写 `rgb(255, 90, 31)` 的令牌 `resolveColor` 返回 `null`，D07 直接 `continue` ——
  白字压这个品牌色只有 **3.12:1**，一条不报（新夹具 `contrast-syntax` 就是这条静默假绿）。
- **WCAG 对比度换成 `wcagContrast`**：与手搓那份（gamma 展开 + 0.03928 阈值）**逐位一致** ——
  729 组网格采样差 < 1e-12，黑白仍是 21:1。于是删掉自己那份数学，只留"0..255 整数 → culori 颜色"的适配。
- **`color-mix` 按 CSS 的 premultiplied alpha 算**：两个都带 alpha 的操作数以前直接返回 `null`（"不猜"）→
  从此真算（`#00000080` 各半 `#ffffff40` → `rgb(85,85,85)` alpha 0.37647，与规范手算吻合）；
  操作数也不再限定 hex / `var()`，任意 CSS 颜色都行。
- **超出 sRGB 色域的值按渲染器裁剪**（`color(display-p3 1 0 0)` → `rgb(255, 0, 0)`）：
  返回 `null` 等于这一对彻底不判。解析不了的（`currentColor` / `var()` / 裸 hex 词如 `abcdef`）仍是 `null`，
  **绝不产出 NaN**（R-148 的保证不变）。
- **D03 的色值身份改用 `colorKey`**（解析后的 `rrggbb[aa]`，取代 `normalizeHex`）：`rgb(255, 90, 31)` 与
  `#ff5a1f` 是同一个色值；`var()` 别名与 `color-mix()` 照旧不算（前者是官方推荐的共用方式）。
- **运行时依赖 7 → 8**（culori，自身 0 依赖、MIT；**不自带类型声明**，`@types/culori` 走 devDep）。
  新夹具 `contrast-syntax`（夹具数 97 → 98）。

### Fixed（H07 / H08 / H09 把 `__tests__/` 当生产路径）

> **误报**，不改变判定口径：判据里写的"测试文件"本来就包含 `__tests__/`（`isTestPath` 的注释与
> H09 的 hint 都这么写），只是这三条规则各自留了一份只认 `.test.` 的正则。

- 三条规则改用引擎里**唯一**的 `isTestPath`（`src/engine/test-paths.ts`）：`.test.` / `.spec.`
  **或**落在 `__tests__/` 里。以前 `__tests__/fake-opencli.ts` 这种夹具会被 H09 报成
  "假数据进了生产路径"，测试里 `new Promise` + `setTimeout` 的等待会被 H07 报成假异步。
- 夹具补一例：`__fixtures__/hygiene-context/src/shared/lib/__tests__/fake-opencli.ts`
  （H09 不报；S15 仍按孤儿报，夹具只是不配角色）。

### Fixed（H08 的私网正则把版本号当成内网地址）

> **误报**，不改变判定口径：只有"少报误报"，没有"多报"。

- **正则要求四段**：`10.x.x.x` / `192.168.x.x` / `172.16–31.x.x`。以前 `10` 那一支只要求三段，
  于是 `npm@10.9.4`、`pkg@10.2.7` 这类版本号会被当成 `10.x.x.x` 报 H08（实测拦过一条启动页夹具文案）。
- **夹具补正反两例**（`__fixtures__/hygiene-context`）：`datetime.ts` 里的 `装本地 npm@10.9.4`
  **不**报；`timers.ts` 里的 `10.12.0.5` 照报 —— 正例防"把正则收得什么都不认"。

### Fixed（R-152：覆盖率产物读不懂时的**静默 0%** / 幻影文件）

> **升级注意（行为变更）**：以前"是 JSON 就当覆盖率摘要"，现在**读不懂就报**（M06，error 级）。
> 受影响的只可能是**本来就指错文件或用了不支持格式**的配置 —— 旧行为是拿假数据静默放行。

- **`readCoverageReport` 的嗅探与 istanbul 分支改为 fail-closed**（`src/engine/coverage.ts`，**0 新依赖**）：
  - `coverage-final.json`（istanbul 的**原始**格式）以前被算成**四个 0** → 现在明确报错并指出
    "改用摘要报告（vitest `--coverage.reporter=json-summary` / c8 `--reporter=json-summary`）"；
  - 指到 `package.json` 以前会把 `name` / `version` / `private` 当成**三个文件**算 0% → 现在报"不是覆盖率摘要"；
  - `{}` / `[]` / 任意文本（README、lcov）以前静默给**空文件集** → 现在报"不是覆盖率产物：既不是 JSON 摘要，
    也不是 Node 覆盖率表格"。
  - 错误由 **M06** 呈现（与"产物读不到"同一条通道），修法跟着一起到报告里。
- **能力边界**：本次**不**新增"解析 `coverage-final.json` / lcov"的能力（那是能力新增，需另开需求 + 依赖）。

### Fixed（R-151：目录符号链接成环时 `walk` 无限下降，报告被幻影路径淹没）

- **`walk` 增加环检测**（`src/engine/util.ts`）：宿主里一个指回祖先的目录链接（`ln -s .. src/back`）
  以前会让遍历**无限下降**，到 `ENAMETOOLONG` 才被 catch 终止 —— 同一棵只有 2 个真文件的树返回 **32 个文件**
  （30 个幻影，形如 `src/back/src/a.ts`），而幻影路径落在 `src/**` 契约域内会被当真文件判角色
  （盘点时在真宿主上实测 **66 个 error**，报告不可用）。
- **跟随链接的语义不变**（workspace / monorepo 会链接源码目录，不跟随 = 少判 = 静默假绿）：
  只对符号链接付一次 `realpath`，沿"当前路径已走过的真实目录"链判环；不成环的"两条路到同一个目录"
  照旧两边都收。非链接子目录**零额外 syscall**。
- **已知边界（本次不改）**：指向**项目根之外**的链接仍被跟随（同上），其路径为 `../…`，
  以"域外文件不判契约"在报告里显形（响，不静默）。

### Fixed（R-150：`calc()` 是 D12–D14 的逃生门 —— 取值器读不到函数里的数值）

- **`numericTokens` 改用 `postcss-value-parser` 取值 AST**（`packs/core/rules/design-shared.ts`，D12–D14 / D15 / D19 共用）：
  旧实现是 `split(/\s+/)` + 正则，**函数里的值一个都取不到** —— `padding: calc(100% - 13px)` 声明了刻度也
  **一条不报**，而 `padding: 13px` 会报（D19 反倒显式跳过 calc，两条规则态度不一致）。
  现在函数里也进去：`calc` / `min` / `max` / `clamp` / `var(--gap, 13px)` 的回退值都算数。
- 顺带修掉三处同类静默：**单位大小写不敏感**（`13PX` / `150MS` 以前取不到，既不报也不说）、
  **数值归一化**（`+13px` → `13px`、`2.0rem` → `2rem`、`0px` → `0` —— 白名单按"值"写，归一后的 `0`
  由调用方按"零到处都在"放过）、`url(...)` 与字符串不再被当成数值。
- **不误报**：单位族仍要求带单位（`line-height: 1.5` 的无单位倍数是正常写法）、`z-index` 仍只认整数、
  `cubic-bezier(0.4, 0, 0.2, 1)` 的参数不算时长。
- 夹具 `value-whitelists` 加 `CalcBad.module.css`（必报）与 `CalcGood.module.css`（不报）；
  新增 `tests/design-value-tokens.test.mjs`（4 组）。**运行时依赖 6 → 7**。

### Fixed（R-146 / R-147 / R-148：三条"静默失真"，全部 0 新依赖、不动依赖预算）

- **R-146 `FORCE_COLOR=0` 在真 TTY 下仍然上色**：实现是"非空**且非 `0`** 才强制开"，于是 `0` 会掉到
  `return process.stdout.isTTY === true` —— CI / 日志采集器用来**显式关色**的标准开关在真终端里失效
  （只在管道里"看起来对"；项目自己的测试断言了相反结果，靠"`node --test` 子进程 stdout 是管道"才没红）。
  现在：`FORCE_COLOR` 非空即**表态**（`0` / `false` = 显式关闭，其余强制有色），`TERM=dumb` 视为无色，
  `NO_COLOR` 仍是最高优先级（与文档承诺一致）。`--help` 与 `docs/USAGE.md` 的口径同步。
- **R-147 Node 覆盖率表格解析在 Node 22 上全军覆没**：报告行前缀随 Node 版本变（24 是 `ℹ `、**22 是 `# `**），
  旧实现只剥 `ℹ` → 在 `engines` 下限 22.18.0 上解出 `"#  engine/#   a.mjs"` 这种全错路径，且一条不报；
  文件行判据还带扩展名白名单（漏 `.mts` / `.cts` / `.svelte`，与 `data/framework-sources.ts` 自相矛盾）——
  实测把**文件行**当目录压栈：它自己消失、**后面每一行的路径都被它污染**。
  现在：前缀按 `[ℹ#]` 通吃（保留缩进），文件行判据改成「前三列都是数字」（目录行没有数字，22.18.0 / 24.13.0 实测一致），
  **删掉扩展名白名单**，`all files` 汇总行显式排除。
- **R-148 4 位 hex 让 D07 对比度静默失效**：`toRgb('#0008')` → `[0, 8, NaN]` → `contrastRatio = NaN`，
  而 D07 的判据 `ratio + 1e-9 < pair.min` 对 NaN **恒为 false** → **一条不报**
  （`#RGBA` 是 CSS Color 4 的标准写法）；`#RRGGBBAA`（Tailwind 的 `/50` 惯用）则把 alpha 当成 rgb 的一部分，
  比值算错同样不报。现在：hex 支持 `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` 且 **alpha 真的参与求值**，
  解析不了（含通道 / alpha 非有限）返回 `null` 让规则跳过，**绝不产出 NaN**；带 alpha 的两色 `color-mix`
  直接跳过（要 premultiplied alpha，不猜）。新夹具 `contrast-alpha`（夹具数 96 → 97）。

## [0.10.1] - 2026-09-28

> **契约与迁移**：`contrastPairs` 增一个**可选**字段 `parent`（兼容性新增）——
> `REPORT_API_VERSION` / JSON 顶层字段集 / `NOTICE_CODES` / `SKIP_CODES` / 退出码语义**均不变**，
> 旧配置原样可用。TS 宿主从这一版起可以合法地写 `parent`（此前它只活在内部规则的类型里，
> 公开类型漏了它，写出来是编译期红）。

### Fixed（`ContrastPair` 的形状只有一份 —— 公开的那份曾漏了 `parent`）

- **症状**：`designSystem({ contrastPairs })` 的公开类型 `ContrastPair` 只声明 `fg / bg / usage / min`，
  而 `parent` 是引擎实打实在读的：D07 用它把半透明柔底**压到实际那张面上**再算比值
  （`packs/core/rules/design-vendor.ts`），D05 把它算作"被引用"（`design-tokens.ts`）。
  于是 TS 宿主想写 `parent` 直接编译期红，用 JS 写的人则根本不知道有这个字段 ——
  半透明底一律退回**压白色**，暗色主题下算出假通过（`4.5` 的尺子量在一个不存在的面上）。
- **根因**：同一形状在两处各写一份（公开的 `presets/design-system.ts` 有四个字段、
  内部的 `packs/core/rules/design-shared.ts` 有五个），内部那份额外长了 `parent` —— 双定义必然这样漂移。
- **改成**：内部那份复用公开那份（`export type { ContrastPair }`），并把 `ContrastPair`
  加进 `tests/process.test.mjs` 的「同一事实只许一处定义」冻结清单（接口从此只许出现在公开那份）；
  补一条 D07 回归：声明 `parent` → 按压底后的实际面色算、这一对过关；不声明 → 退回压白色、同一对报错。
- **契约**：`contrastPairs` 增一个**可选**字段（兼容性新增；`apiVersion` / `NOTICE_CODES` /
  `SKIP_CODES` / JSON 顶层字段 / 退出码语义**均不变**），`ContrastPair` 同时从 `@arch-guard/core/presets` 导出。

## [0.10.0] - 2026-09-27

> **契约与迁移（这一版必读 —— 配置格式与公共 API 都有破坏性变更）**
>
> - **配置格式**：`CONFIG_SPEC_VERSION` `'1'` → **`'2'`**（这正是那个通道的用途，见 ADR-0005 的后续记录）。
>   写 `specVersion: '1'` 会在配置期拿到明确报错，不会静默按新语义解释。
>
> | 今天                                                                  | 改成                                                                                      |
> | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
> | `packs: [reactPack]` / `[tsPack]`                                     | `sourceForm: 'react'` / `'typescript'`（省略 = `typescript`）                             |
> | `overrides: { metaFramework: 'vue' }`                                 | `sourceForm: 'vue'`（顶层；未实现 → 现有 fail-closed 照旧）                               |
> | 自造包 `definePack({ framework, rules:[...内置, ...own], adapters })` | `overrides: { customRules: [...own] }` —— **不必再 spread 内置规则、不必再转发 adapters** |
> | `runGuard({ rules })`                                                 | `runGuard({ ruleSet })`（**完整替换**；追加用配置里的 `customRules`）                     |
> | `loadConfig({ fallbackPacks })`                                       | `loadConfig({ sourceForms })`（CLI 自己注入；宿主不写）                                   |
> | `import { definePack, PackError, tsPack, reactPack }`                 | `defineSourceForm` · `SourceFormError` · `builtinSourceForms`（宿主通常一个都不需要）     |
> | `config.metaFramework`                                                | `config.sourceForm`；新增 `config.rules`（解析期算定的规则集）                            |
>
> - **`overrides` 的键从 `Partial<Config>` 改成显式枚举**：`root` / `paradigm` 以前"可写但没人读"
>   （静默忽略），现在会作为不认识的键报错；新增 `customRules`；**`autoFix` 删除**（全仓零消费者的死键）。
> - **`NOTICE_CODES` 新增 `source-form-missing`**（兼容性新增，`apiVersion` 不动）：调用方没注入实现时
>   规则集为空会自述，而不是静默跑 0 条。`SKIP_CODES` / JSON 顶层字段 / 退出码语义均不变。
> - **顺手修掉一个真 bug（0.8.0 / 0.9.0 存在）**：R-138 加的 `http` 面**漏在框架包的适配面白名单里** ——
>   同时声明 `packs: [reactPack]` 与 `http(axiosKit())` 会被 facet 校验拒掉。现在白名单在
>   `packs/registry.ts` 一处维护。
> - **规模**：规则 **107**（本版**未新增规则**）· 夹具 **96** · 需求 → **141**
>   （`已完成` 130 / `已委派` 4 / `不做` 7）。
>
> **发布前必做（本版已做）**：Node **24.13.0** 与 **22.18.0** 上各跑一次完整 `pnpm check`，都 **EXIT=0**。
> **版本号留给发布工具 bump**（本版选 **minor** → `0.10.0`）。

### Added（R-144：配置键的合并语义表 —— 表即实现即文档）

- **症状**：同一把键在两层语义不同，而配置里看不出来 —— `library({ enable: ['S45'] })` 是**加一条**，
  `overrides: { enable: ['S45'] }` 是**把预设给的清单整个换掉**；`entries` / `include` / `layout` 同理
  （预设之间拼接/逐键，项目层替换）。语义各自都说得通，但只活在 `mergePresets` 与 `config.ts` 的写法里。
- **改成**：`src/engine/merge-spec.ts` 的 `MERGE_SPEC`（键 × 两根轴）是**唯一真相** ——
  `mergePresets` 与 `config.ts` **读表合并**（`mergeByKind` 一份实现，`special` 的键在 `SPECIAL_MERGERS` 里点名）；
  文档块 `<!-- arch-guard:begin merge-spec -->` **由表渲染**（`--check-docs` 盯漂移）；
  守卫测试要求：每个可写键都在表里 · `special` 必须有名字 · 非 `special` 的项目层键必须真的被读。
  R-113 的报错文案同时补上判据：**要选片段 → `presets`；要选源码形态 → `sourceForm`；其余全是 `overrides`**。
- **顺带修一个真 bug（一直都在）**：`docs.ts` 的围栏配对按"首字符"比较，` ```` ` 里嵌 ` ``` ` 的常规写法
  会被当成闭合 → **它后面的管理块整段被当成"围栏内"，静默不渲染也不校验**（DESIGN.md 加 `merge-spec` 块时实测消失）。
  按 CommonMark 规则修（同字符且不短于开启串才闭合）+ 回归测试。

### Changed（R-143：源码形态是标量，规则是追加 —— `packs` 退场）

- **症状**：宿主想加自己的规则，只能 ① 自造一个"框架包"（必须**自称实现某个源码形态**、必须手工转发
  `adapters`，否则 facet 校验报错）；或 ② 走程序化入口 `runGuard({ rules })` —— 而 CLI 从此**看不见**
  这些规则（`--explain` / `--list-rules` / `--stats` / `--render-docs` 全盲）。写
  `packs: [reactPack, ownRules]` 会被 `packs.length > 1` 抛掉。
- **病根（见 ADR-0009）**：`packs` 一个字段捆了三件事，而**数组形状在诱导误用**：
  1. 数组传递的信息量 = **一个枚举值**（两个包 `rules` 是同一份 `coreRules`、`adapters` 是同一张清单）；
  2. 源码形态**三处可写**：`Pack.framework` / `overrides.metaFramework`（还要互校）/
     **`Preset.metaFramework`（死声明）** —— `mergePresets` 把它搬进 `out.metaFramework`，而 `config.ts`
     从不读它，**没有任何预设声明过、没有测试覆盖**；机械比对"merge 写出 16 个字段 / config 读入 15 个"才发现；
  3. "能不能跑"取决于宿主有没有手递那个对象：省略 `packs` 时靠 **CLI 的 `fallbackPacks` 补丁**，
     程序化调用方没有补丁 → 直接"没有任何可跑的规则"。
- **改成**：顶层 `sourceForm`（**标量**、缺省 = 数据表第一条）+ `overrides.customRules`（**追加**）。
  注册表按层拆：`data/framework-sources.ts`（层 1）只留 `{ id, extensions }`；`{ rules, adapters }` 的实现绑定
  在 `packs/registry.ts`（层 4）**由调用方注入**（取代 `fallbackPacks`）—— data 引 `coreRules` 就是反向依赖。
  于是：非法状态不可表达（标量取代"数组里的一个"）、形态只剩一处真相、宿主不再需要接触"包"、
  规则集**在配置解析期算定**（`Config.rules`，CLI 与 runner 读同一份，不再各推一遍）。
- **附带**：新增**元守卫**测试 —— 机械比对 `mergePresets` 写出的字段集合 vs `config.ts` 读入的字段集合，
  两个方向都不许有差集（"写出没人读" = 死声明；"读了没人写" = 永远是 `undefined`）。
  `Preset.metaFramework` 就是靠手工比对才发现的，做成守卫后不必再靠谁"仔细"。
- 决策与迁移见 [`docs/adr/0009`](docs/adr/0009-source-form-is-a-scalar.md) 与
  [`.scratch/rule-sources/spec.md`](.scratch/rule-sources/spec.md)；夹具 `custom-rules`（追加的规则真的在判）。

## [0.9.0] - 2026-09-27

> **契约与迁移（这一版必读）**
>
> - **契约变更（兼容性新增，`apiVersion` 不动）**：`SKIP_CODES` 加两项 —— `not-enabled`（注册了，
>   但不在 `enable` 名单里）与 `filtered`（被 `--only` / `--domain` / `--min-level` 收窄）。
>   **对 `skipped[].code` 做穷举映射的 TS 消费方会编译期红**（这是设计，见 DESIGN §6.9）；
>   `.mjs` / CI 脚本请用 `isSkipCode()` fail-closed，别去解析中文 `reason`。
>   同时 `SkippedRule.missing` 收紧为「**当且仅当** `code === 'capability-missing'` 时非空」。
> - **行为变化（输出文案变了，有断言输出的消费方要留意）**：
>   1. 报告多两段自述：`未启用 N 条规则（不在配置的 enable 名单里）：…` 与
>      `被本次运行的过滤器收窄 N 条规则（--only / --domain / --min-level）`。
>   2. `--brief` 的折叠行从「因能力停用 N 条规则」改成按原因给条数：
>      `没跑 N 条（能力 X · 未启用 Y · 收窄 Z）`。
>   3. `--explain <规则 id>` 多一行「当前配置下：会跑 / 没跑 —— 为什么」；
>      `--list-rules` 每条多一个状态标注（`[跑] / [未启用] / [缺能力] / [收窄] / [停用]`），
>      机读多一个 `state` 字段（兼容性新增）。
> - **规模**：规则 **107**（本版**未新增规则**）· 夹具 **95** · 需求 → **139**
>   （`已完成` 128 / `已委派` 4 / `不做` 7）。
>
> **发布前必做（本版已做）**：Node **24.13.0** 与 **22.18.0** 上各跑一次完整 `pnpm check`，都 **EXIT=0**。
> **版本号留给发布工具 bump**（`pnpm release` 会问 patch/minor/major → 本版选 **minor** → `0.9.0`）。

### Added（R-142：规则账目闭合 —— 「注册≠执行」不再静默）

- **症状**：把一条规则从启用名单里移出去（改预设的 `enable`、或自定义规则没列进去），
  **唯一的信号是报告头 `规则 70/112` 的分子 −1** —— 不点名、不给理由、也不问"这是有意的吗"。
  实测 `dsh-workbench`：`70/112` 且只解释了 24 条（`因能力未声明而停用`），
  **另 18 条既不在 `enabled` 也不在 `skipped`，报告一个字都不提**；本仓自己是 `39/107` + 停用 14 →
  **54 条无人提及**；`examples/full-fsd` 是 **9 条**（R-87 明确允许缺席的应用专属规则 ——
  有意的缺席，但报告同样说不出"这是有意的"）。
- **根因**：`registry` 只有三个桶（`enabled` / `skipped`（只收 `capability-missing`）/ `unknownEnabled`），
  「不在启用名单里」的规则落在**所有桶之外**。`codes.ts` 的注释早就把 `skipped[].code` 定为扩展点。
- **修法**：**不加桶**，往 `skipped` 里补两种 code（`not-enabled` / `filtered`）→ **账目闭合**：
  `rulesEnabled + skipped.length + disable == rulesTotal`。三处读**同一份**账目：
  报告分三段自述（点名 + 可执行处方）· `--explain <id>` 直接回答「这条跑不跑、为什么」·
  `--list-rules` 每条标状态（机读 `state`）。`disable` **不进** `skipped`（它已有 `rules-disabled` 自述，
  同一件事不许两处报）。
- **顺带把 R-87 的守卫升级**：`paradigm-coverage` 以前靠"算差集"来**记录** FSD 那 9 条的静默缺席；
  现在要求**账目闭合**（注册的规则一条都不许没下落）+ 那 9 条必须**明列** `not-enabled` ——
  同一份名单，更强的判据。
- 决策与取舍见 [`.scratch/rule-accounting/spec.md`](.scratch/rule-accounting/spec.md)。

## [0.8.0] - 2026-09-27

> **契约与迁移（这一版必读）**
>
> - **契约变更：无。** `REPORT_API_VERSION` / JSON 顶层字段 / `NOTICE_CODES` / `SKIP_CODES` /
>   **退出码语义**均不变（冻结测试照旧通过）—— 这一版加的是**可选声明**与**新旗标**，
>   旧配置、旧 CI 脚本原样可用（新 `structure` 键不写就完全不走那两档）。
> - **新增能力（都要显式声明才生效）**：
>   1. **运行时面与面值**（R-139 / R-140，[ADR-0008](docs/adr/0008-runtime-faces-and-face-values.md)）：
>      `structure.runtimes` 给「运行时 → 入口」、`structure.faces` 给「面文件模式 → 运行时 → 面值名模式」；
>      S23 增第 ④⑤ 档 —— 跨运行时走错面、面文件导出面值之外的东西（**类型豁免**）即报。
>      **只判兼容性、不判完备性**；消费者属于哪个运行时按**可达性推导**（同构模块可用任意面，孤儿不判）。
>      `faces[].runtime` 指向未声明的运行时会**在配置期报错**，不是静默不生效。
>   2. **规则目录**（R-141）：`arch-guard --list-rules`（按域分组，**含配置里自定义 pack 的规则**；
>      `--format=json` 给 agent 读）；`renderRuleCatalog()` 进公共 API（程序化规则集自己调）。
> - **行为变化（要留意）**：`--explain` 的规则集改为**跟配置走**（此前硬编码内置规则表）——
>   自定义 pack 的规则 id 现在能展开，`--explain <路径>` 的「适用 / 停用」清单也带上它们；
>   **没写 `packs` 的项目行为不变**。`--self-test` 仍用内置规则集（宿主的规则不可能在包里带夹具）。
> - **规模**：规则 **107**（本版**未新增规则**，S23 增两档）· 夹具 **95** · 需求 → **138**
>   （`已完成` 127 / `已委派` 4 / `不做` 7）。
>
> **发布前必做（本版已做）**：Node **24.13.0** 与 **22.18.0** 上各跑一次完整 `pnpm check`，都 **EXIT=0**
> —— 夹具 95/95 · 本体自包含 P1–P4（120 文件）· 文档块同步（5 文件）· 示例 71/102/91 全绿 · 狗粮 39/107。
> **版本号留给发布工具 bump**（`pnpm release` 会问 patch/minor/major → 本版选 **minor** → `0.8.0`）。

### Added（R-138：支持 axios —— `http` 面 + `axiosKit()`）

- **症状**：用 axios（而不是裸 `fetch`）的项目，D25「后端端点只有一个出处」**静默不判** ——
  来源表里只有平台事实（`platform.network` = `fetch` / `XMLHttpRequest`），库的调用得项目手写，
  忘了写就是"报告 ✔、端点字面量一个没判"。
- **按本仓分工落地**（**库的事实进它自己的适配器**，不进平台表）：

  ```js
  presets: [
    canonical(),
    http(axiosKit()),
    endpoints({ from: callSiteSources.http.apis, source: 'src/shared/api/endpoints.ts' }),
  ]
  ```

  新增面 `http` 与 kit `axiosKit()`（`packages: ['axios']` + 请求方法清单）；`callSiteSources.http.apis`
  由来源表**自动派生**（加一项，常量命名空间自动有）。

- **`apis` 只列请求方法，不列裸 `axios`**：裸的按"对象前缀"会把 `axios.create({ baseURL: '/api' })`
  里的路径字面量也认成打后端 —— 那是误报。可调用形态 `axios('/x')` 与 `axios.create()` 的实例
  （`api.get`）名字不可知，由项目自己补进 `apis`（宁少报不误伤）。
- **顺带补一处静默假绿**：`from` 整份解析为空时以前什么都不说（忘了装适配器就表现为"通过"）→
  现在自述 "`endpoints.from` 的 `http.apis` 解析出来是空的（少装了对应的适配器？）"
  （与 call-sites 组的同类检查、R-114 同一族）。
- 夹具 `endpoints-axios`（**93 → 94**）：违规必报 × 合规不报；`--brief` 与停用清单照旧。

### Added（R-139 / R-140：运行时面与面值 —— 公开面的第 ④⑤ 档）

- **症状**：双运行时工程（宿主半侧 + 浏览器半侧）里一个域有**两个面**（宿主面 `index.ts` / 浏览器面
  `client.ts`），而"宿主侧只能走宿主面"是**配对**约束：层号是全序（S21 只能表达"向下依赖"），
  S22 只判"同维度、同层、不同组 → 禁"（把两个面当两组，会让**该放行的**"宿主侧 import 宿主面"
  变成跨组被报）。S23 的 `entry` 是**无差别通行证**；从公开面里 import 实现细节，它同样一声不响。
  **实测**（`dsh-workbench`）：只能自造构建图闸门 + 五条自定义规则，而其中"面解析"那段
  **一轮重构内漂移两次**（漏报与误报各一次）—— 引擎里本来就有 `resolveSpecifier`。
- **新增两条声明**（`name` 是不透明字符串；两条都**空声明即不判**）：

  ```js
  structure: {
    runtimes: [{ name: 'host',   entries: ['src/app/host.ts'] },
               { name: 'client', entries: ['src/app/client.tsx'] }],
    faces: [{ pattern: 'src/modules/*/index.ts',  runtime: 'host',   value: '*Host' },
            { pattern: 'src/modules/*/client.ts', runtime: 'client', value: '*Client' }],
  }
  ```

  - **④ 运行时兼容**：消费者的运行时按**可达性**推导（文件从哪个入口可达就属于哪个运行时）
    → 同构模块天然可以用任意面；跨运行时走错面即报；孤儿不判（那是 S15 的事）。
  - **⑤ 面值**：面文件只许导出匹配 `value` 的值（**类型导出豁免**）—— 于是"面外拿到内部实现"
    在**提供侧**就不可能发生，不必逐 import 对账。

- **判据进 S23（不新开规则号）**：同一题目的第 ④⑤ 档。**不判完备性** —— 实测的面是参差不齐的
  （有域只有宿主面、有域只有被两端共用的业务公开面），判完备性会直接误报。
- **配置期 fail-closed**：`faces[].runtime` 指向没声明过的运行时、或 `runtimes` 没给入口 → 直接报错
  （否则那一档静默不生效）。
- **零事实模型改动**：面值模式是**数据**（`ImportFact.names` 已在事实里），`FACTS_CACHE_SPEC` 不变。
- 决策与取舍见 [`docs/adr/0008`](docs/adr/0008-runtime-faces-and-face-values.md)；
  夹具 `runtime-faces`（95/95，含同构模块 / 孤儿 / 面值类型豁免四类不报）。

### Added（R-141：`--list-rules` —— 规则目录）

- **症状**：`--explain <id>` 是"按 id 问一条"，可**自定义规则的 id 从哪来**？项目的规则表里没有它们
  （那是项目自己写的），于是"我这条规则到底注册上没有、它要求什么"只能翻项目源码 —— 自定义规则的
  "为什么"只活在自己的注释里。
- **新增**：`arch-guard --list-rules` —— 按域分组列出**当前规则集**的目录
  （`id` / 等级 / 严重度 / 标题 / **需要什么声明**）；`--format=json` 给出
  `{ total, rules: [{ id, title, domain, level, severity, requires }] }` 给 agent 读。
  **规则集跟配置走**：`packs` 里自定义的规则同样在目录里。退出码恒 0（查询，不是判决）。
- **程序化入口**：`renderRuleCatalog(rules, { format })` 已进公共 API —— 用 `runGuard({ rules })` 注入
  规则集的项目（CLI 看不到那些规则）自己调它就能得到同一份目录。

### Fixed（R-141：`--explain` 只认 `coreRules`，自定义规则一律被判"未知"）

- **症状**：宿主按本体给的位置登记了自己的规则（`arch.config.mjs` 的 `packs`，或程序化入口
  `runGuard({ rules })`），报告里明明印着 `[S61]`，而 `--explain S61` 回一句
  「未知规则：S61（规则全表见 docs/DESIGN.md §4）」—— 解释不了自己刚报出来的规则；
  `--explain <路径>` 的"适用 / 停用"清单同样漏掉它们。**实测**（`dsh-workbench`：
  S60–S64 五条自定义规则）一次命中。
- **根因**：`src/cli.ts` 里 explain 那一支把 `coreRules` 硬编码给了 `explainRules` 与 `createRegistry`，
  而规则集的权威来源是**配置给的包**（`loadConfig` 早就把 `packs` 返回了）。
- **修法**：`--explain` 改用 `loaded.packs.flatMap((pack) => pack.rules)`；一个包都没给时退回
  `coreRules`（查询不该因为配置没写 `packs` 就失效）。`--self-test` **不动** —— 那是引擎自己夹具的
  回归，宿主的规则不可能在包里带夹具。
- **兜底文案**：未知规则不再只说"见 DESIGN §4"，而是说清**两种来源**（`packs` / `runGuard({ rules })`），
  否则项目自定义规则的 id 被指去一份根本没有它的表。
- **兼容性**：纯查询路径的行为修正，报告契约（`apiVersion` / code 常量 / 退出码）零变化。

## [0.7.0] - 2026-09-26

> **契约与迁移（这一版必读）**
>
> - **契约变更**：`ADVICE_SIGNALS` 新增 `group-chain-depth`（架构建议的第六条信号）——
>   对 `ADVICE_SIGNALS` 做**穷举映射**的 TS 消费方会编译期红（这是设计）；
>   `overrides.adviceAllow` 的合法 `signal` 值多了一个。`NOTICE_CODES` / `SKIP_CODES` /
>   `REPORT_API_VERSION` / JSON 顶层字段 / **退出码语义**均**不变** —— 建议仍然**永不阻断**。
> - **行为变化（要留意）**：
>   1. **新增一条建议**：组间依赖链 ≥4 个组时提示（`A → B → C → D`，每跳合法、无环）。
>      只是**建议**（不影响退出码），不想要就 `adviceAllow` 声明豁免。
>   2. **S38 的判定范围收窄**：`isTestPath` 取并集后，落在 `__tests__/` 目录里的文件**也按测试处理**
>      （以前只有"架构建议"那么认为、S38 不认 —— 同一个文件两处答案）。若你们故意把非测试代码放
>      `__tests__/`，这里的落点判定会减少。
>   3. **声明了 `structure.isolate` 的项目，跨组类的建议不再提**（跨组依赖本来就由 S22 报）——
>      以前这段只写在注释里、代码没落实。
> - **内部收敛（对使用者不可见）**：`layer >= 90` 19 处 → `TEST_LAYER_MIN` · 默认 ignore 2 → 1 ·
>   方案面字段 4 → 1 · `lineOf`/`positionOf` 3 → 1 · `packageOf` 4 → 1 · 注释遮罩 3 → 1 ·
>   `isTestFile` 2 → 1（语义统一）。冻结测试从 1 项扩到 **9 项**"同一事实只许一处定义"。
> - **规模**：规则 **107**（本版未新增规则；新增的是**建议信号**）· 夹具 **93** · 需求 → 134
>   （`已完成` 123 / `已委派` 4 / `不做` 7）。
>
> **发布前必做**：在 **Node 22.18** 上补跑 `pnpm check`（0.6.0 时跑过；本版结果见提交说明）。
> **版本号留给发布工具 bump**（它会问 patch/minor/major → 本版选 **minor**）。

### Added（R-135：第六条架构建议 —— 组间依赖链过深）

- 新信号 `group-chain-depth`：**链上 ≥4 个组**就提示（`A → B → C → D`，每一跳都合法、也没有环，
  但改最上面那个组会波及整条链）。
- **判据对照（为什么值得加）**：**环**归 S08（文件级）/ 组级环信号（R-124）· **宽度**归 S34
  （文件级入/出度）/ S39（组耦合上限，只限"一个节点连多少个"）· **深度以前没有任何规则管** ✓
- **不报的边界**：① 有环时不提（环更严重，交给 R-124/S08）② 声明了组隔离的项目不提（S22 已报）
  ③ 只算跨组边，测试与生成物不计 ④ 阈值保守：组数 ≥4（`pages→features→entities` 这种正常纵深不劝）
- **顺手补的一处缺口**：`peer-reuse` 的注释一直写着"声明 `isolate` 就不必劝"，但**代码里没落实** ——
  现在 `isolateCoversGroups` 一开，跨组类的两条建议都不提（组粒度与组级环不受影响）。
- 验收：三套健康样板（minimal / full / full-fsd）**0 条** ✓；正例（4 组链）与三个边界各一测 ✓。

### Changed（R-137：第二批扫描 —— 同一知识换个说法，四处真问题）

第一轮扫描只找"同名/同体"，抓不到"**不同名但表达同一事实**"。第二轮查了重复的字符串数组、
魔法数字与高频字面量：

- **`layer >= 90`：7 个文件、19 处 → `TEST_LAYER_MIN` 一处**（`engine/defaults.ts`）。
  这是本仓最大的一处魔法数字：没有任何名字提示那 19 处是一回事。
- **默认 ignore 列表**：`canonical()` 与 `library()` 各写了一份 → `DEFAULT_IGNORE` 一处
  （`fsd()` 本来就不设，所以重复恰好两处）。
- **方案面字段清单**：`router` / `styles` 的 `fields` 各被**两个 kit 声明了一遍**
  （`none` 与真实 kit 都要注册这个面）→ `FACET_FIELDS` 进数据表。**这不只是重复**：
  `defineFacet` 后写者胜，一个 kit 加了字段、另一个按旧清单注册就会把它悄悄覆盖回去。
- **决定不合并的两处**（附理由）：`docs.ts` 与 `explain.ts` 的参数名清单问的是不同问题
  （"渲染哪些参数的文档" vs "哪些参数算落点"）；面名字面量（`'ui-kit'` 等）是领域词汇，
  拼错由配置校验 fail-closed 拦下。
- 冻结表扩到 **9 项**"同一事实只许一处定义"；字面量残留 0；夹具 93/93、示例 102·91·71 不变。

### Changed（R-136：收敛「同一事实多处实现」）

- 用可核对的源码扫描（同名定义 / 完全相同的体 / 同名不同义）扫了 `src/**`，清单与逐条决定见
  `.scratch/hardening-2/spec.md`：
  - `lineOf`（TS 位置 → 行）+ `positionOf` **3 份 → 1 份**（`engine/facts-syntax.ts`）；
  - `packageOf` ×3 + `packageNameOf` **4 份 → 1 份**（`engine/graph.ts` 导出，5 处调用点改 import）；
  - 注释遮罩 `maskComments` ×2 + `maskTs` **3 份 → 1 份**（合并时发现三份**语义有差**：
    `deps` 那份多一层块注释正则兜底 → **取并集**，两边行为都不丢）；
  - `isTestFile` **2 份且语义已分叉**（一份只认 `.test./.spec.`，另一份多认 `__tests__/`）→
    收敛成 `engine/test-paths.ts` 的 `isTestPath`，**取并集**，并注明**权威来源是声明的 `test` 角色**；
  - `css.ts` 的同名 `lineOf`（签名不同：CSS 文本 vs TS AST）→ **不合并**，改名 `cssLineOf` 消歧义。
- **冻结测试改成表驱动**：一条测试守住 6 项"同一事实"（`finding` · `lineOf` · `positionOf` ·
  `packageNameOf` · `maskTs` · `isTestPath`），每项断言"全仓只许在指定文件定义"。
- 零行为变化：夹具 **93/93**、示例 **102·91·71** 不变。

## [0.6.0] - 2026-09-26

> **契约与迁移（这一版必读）**
>
> - **契约变更**：`NOTICE_CODES` 新增 `rules-disabled`（显式停用的规则要自述）—— 按穷举映射消费 notice
>   code 的 TS 代码会**编译期红**（这是设计）；CLI 新增 `--brief` 开关注册（冻结清单测试会要求登记）。
>   `REPORT_API_VERSION` **不变** · JSON 顶层字段集未变 · `SKIP_CODES` 未变 · **退出码语义未变**。
> - **兼容性新增（不是破坏性）**：发现项多了**可选**字段 `column`（报告印 `file:line:col`、
>   `--format=github` 注解带 `col=`；合成事实不给也照常）· `--explain` 现在也收**规则 id** ·
>   JSON 的 `skipped[]` 多了可选 `recipe`（可以直接粘进配置的那一行）· `--brief` 下 JSON 的
>   `notices[].text` 被省掉（只留 `code` —— 契约本来就是 code）。
> - **行为变化（要留意）**：
>   1. **pretty 报告的版式变了**（**结论前置**到第一行，元信息归末尾附录，超长行拆成多条）——
>      只影响人读的输出；`--format=json` / `github` 与退出码不变。若有脚本在 `grep` pretty 输出，
>      请改读 `--format=json`。
>   2. **`disable` 掉的规则现在会自述**（新 notice）——以前只有"✔ 通过"，看不出纪律已经缩水。
>   3. **`ignore` 自述的写法变了**：以前"命中 N 个文件"后面列的是**模式**（对不上），现在是
>      "文件 + 全部模式（每行 3 条）"。
>   4. **非终端输出不再带颜色**（`NO_COLOR` 非空即无色 · `FORCE_COLOR` 非空即强制有色）——
>      有脚本依赖管道里的 ANSI 请显式 `FORCE_COLOR=1`。
>   5. **机读格式的 stdout 变干净了**：`--format=json --stats` 以前会在 JSON 后面追一张统计表
>      （任何解析器都炸）；现在 `--stats` 在机读格式下走 **stderr** —— 解析 JSON 的接入方不受影响。
> - **缓存**：`FACTS_CACHE_SPEC` 10 → **11**（事实多了列号）→ 旧 facts 缓存自动作废重算。
> - **示例**：错误码 → 文案的**推荐形态**进两套示例（唯一映射表 + 取数层只暴露一次错误码 +
>   每域一等的"加载/失败/有数据"分支）；**判据仍留待**（同 N-12：先要真实项目形态）。
> - **规模**：规则 **107**（本版未新增规则）· 夹具 **93** · 需求 → 131（`已完成` 120 / `已委派` 4 / `不做` 7）。
>
> **发布前必做（已做）**：`engines: >= 22.18.0` 是对外承诺 —— 已在 **Node 22.18.0** 上跑完整门禁：
> `pnpm check` **EXIT=0**（93/93 夹具，与 Node 24 同一套结果），并在**这一版最终状态**上复跑过。命令：`nvm exec 22.18.0 node <pnpm 的 pnpm.cjs 路径> check`。
> **版本号留给发布工具去 bump**（它自己会 `setPkgVersion` 并提交；手动 bump 会让它拿到空提交而报错）。

### Fixed（R-134：机读出口的 stdout 是干净的 —— `--stats` 走 stderr）

- `--format=json --stats` 以前会在 JSON **后面再追一张统计表** → 任何解析器都炸
  （实测 `Extra data: line 65 column 3`）。编码 agent / CI bot 正是这么读机读报告的。
- 现在机读格式（`json` / `github`）下 **stdout 只放机读内容**，`--stats` 的统计表走 **stderr**（人仍看得见）。

### Added（R-133：USAGE §7.3 —— 给编码 agent / 编辑器 hook 的接入配方）

- 主用法是**编码 agent 触发自动诊断**，但仓库里没有"hook 该跑哪条命令"的出处。新增 USAGE §7.3：
  **两层**（编辑时 `--paths "$FILE" --brief --format=json` 单文件快查，约 0.65s；收尾/提交前全量或
  `--scope=staged`）+ agent 该读的字段表（`ok` / `findings[].hint` / `skipped[].recipe` / `notices[].code`）
  - 写代码前先 `--explain` + 一段**可直接粘**的 hook 脚本（永远 `exit 0`，hook 不该阻断编辑器）。
- **`--brief` 现在也管 JSON**：以前只管 pretty，agent 每次仍要吞下几千字节文案。`--brief` 下 JSON 的
  `notices` **只给 `code`** —— `text` 本来就不是契约（按 `code` 判），所以省的是上下文不是信息
  （实测 3104 → 2114 字节）。

### Fixed（R-132：缓存默认在 `node_modules`；退回项目根时才提示加 .gitignore）

- 缓存放哪跟 Vite 同一策略：优先 `node_modules/.arch-guard-cache`（天然被 git 忽略、
  `rm -rf node_modules` 顺手带走）；**没有** `node_modules` 的项目（PnP / monorepo 子包 / 无依赖项目）
  才退回项目根 —— 那时自述多一句"记得加进 .gitignore"，正常项目零噪音。
- 单测钉住位置选择逻辑（`cacheDirOf` 的两种情形）；文案是消息、不是契约，不锁死措辞。

### Fixed（R-131：JSON 的 `skipped` 带 `recipe` —— agent 读机读输出也能自服务）

- 本工具的主要用法是**编码 agent 触发自动诊断**。agent 读 `--format=json` 看到
  `skipped: [{ rule: 'S13', missing: ['structure.slots'] }]` —— 知道"缺能力"，但**不知道要写哪一行**：
  可粘片段以前只在 pretty 输出里。现在每条 `skipped` 尽量带 `recipe`
  （与 pretty 用**同一份** `capability-recipes`，不新增第二处真相）。
- 兼容性新增：多一个字段，不删不改语义。**消费方按 `rule` / `missing` 判，别匹配 `recipe` 的措辞**
  （文案是本仓随时可改的内部细节）。

### Fixed（R-130：颜色按 `NO_COLOR` / `FORCE_COLOR` / TTY 判定 + `--help` 给出退出码表）

- 以前**无论哪里都硬拼 ANSI** —— 管道、CI 日志、读屏软件里全是转义序列。现在：`NO_COLOR` 非空即无色
  （no-color.org 的事实标准）· `FORCE_COLOR` 非空即强制有色 · 两者都没给时**只在终端上色**。
  实测：管道里 0 个 ESC、TTY 里正常上色、`NO_COLOR=1` 无色。
- `--help` 补上**退出码表**（`0` 通过 / `1` 有 error 级违规 / `2` 用法或配置错）与颜色开关说明，
  并加了 `--explain <路径>` / `--explain D29` / `--brief` 三条示例 —— 写 CI 的人不用再翻文档。

### Changed（R-129：9 份 `finding()` 收敛成 1 份 —— 加字段从"改 9 个地方"变成"改 1 处"）

- 给发现项加 `column` 时要改 **9 个地方**（`structure-util` / `design-shared` 两份导出的 +
  `structure` / `copy` / `deps-adapters` / `hygiene-context` / `deps` / `metrics` / `structure-graph`
  七份本地的）—— 漏改一份就是"同一个发现项两种形状"。现在只剩 `packs/core/rules/finding.ts` 一份
  （两份导出者改为**再导出**，10 个导入口零改动），并加了**冻结测试**：全仓只许有这一个定义。
- 收敛过程如实记：前两次用"第一个行首 `}`"定位定义边界，而箭头对象形态的终止行是 `})` → 它继续往下找，
  把相邻的辅助函数一起切掉 → 两次回滚；第三次改成"终止行认 `}` 或 `})`"＋"每改一个文件就编译一次"＋
  "从编译错误里读出未用标识符再定向清理" → 9 个文件一次通过，夹具 93/93 零变化。

### Added（R-127：从报告到答案的闭环 —— `--explain <规则 id>` · `--brief`）

- **`--explain D29`**：报告里印着 `[D29]`，新人却无从展开（`--explain` 以前只收**路径**）。现在规则 id
  也收，就地讲清：域 / 等级 / 严重度 / **需要什么声明**（没声明这条不跑）/ 怎么改 / 想只跑它怎么写。
- **`--brief`**：附录折叠成一行摘要（`· 自述 6 条 · 因能力停用 5 条规则（去掉 --brief 展开）`）——
  **只折叠不删**；退出码与 JSON 契约不动。
- **空目录报错补 `init`**：`找不到配置文件…没有的话跑 \`arch-guard init --ui <组件库> --data <取数>
  --i18n <文案>\` 生成一份`。

### Changed（R-126：报告信息架构 —— 结论前置、元信息归附录、超长行拆开）

- **结论前置**：第一行就是 `✖ 架构守卫失败：1 个 error、0 个 warn · 规则 1/107 · 1 个文件 · 52ms`
  （以前要翻十行元信息、到**最后一行**才知道过没过）；范围/例外/停用/自述全部归到末尾附录。
- **一条一行**："声明 0 命中"逐项一行（以前 6 条挤成 **401 字符**）、"正确形态参考"每片段一行
  （**424 字符**）、适配器与 ignore 模式每行 3 个 —— 80 列终端里整份输出从"16 行折成约 40 行"回到正常。
- **ignore 那行不再自相矛盾**（数字是文件、后面列的却是模式）· 范围行去掉内部术语 · 输出不再以空行开头。
- **边界**：自述一条没删（诚实机制不动）；退出码与 `--format=json` 契约未变。

### Added（R-128：违规定位到**列** —— `file:line:col` 与 CI 注解 `col=`）

UX 清单里最后一条（H）。带位置的事实（导入 / 导出 / 字符串 / 调用 / 读取 / 数字 / 函数 / 注释）
多了一个 `column`（从 1 起），报告印 `file:line:col`、`--format=github` 注解带 `col=`。

- **兼容性新增**：`column` 全部**可选** —— 合成事实（测试、规则里手工构造的）不给也照常；
  `finding()` 现在收**数字或事实对象**，所以旧写法一行都不用改，规则可以**逐族迁移**
  （本批已迁移 60 处调用点：D/C/P/S 各族的直面事实处）。
- **缓存**：`FACTS_CACHE_SPEC` 10 → **11**（事实形状变了）→ 旧缓存自动作废，无需人工动作。
- **技术债已还清**：`finding()` 构造器曾经有 **9 份**（`structure-util` / `design-shared` 两份**导出**的 +
  `structure` / `copy` / `deps-adapters` / `hygiene-context` / `deps` / `metrics` / `structure-graph`
  七份**本地**的）—— 加一个字段就要改 9 个地方。现在收敛成 `packs/core/rules/finding.ts` **一份**
  （两份导出者改为再导出，10 个导入口零改动），并加了**冻结测试**：全仓只许有这一个定义。
  收敛过程：前两次靠"第一个行首 `}`"定位定义边界，把相邻的辅助函数（`packageOf` / `languageParity`）
  一起切掉了 → 都回滚；第三次改用**行首 `}` 或 `})`** 两种终止形态 + **每改一个文件就编译一次** +
  **从编译错误里读出未用标识符再定向清理** → 9 个文件一次通过，夹具 93/93 零变化。

### Added（c：错误码 → 文案的**推荐形态**进两套示例；判据仍留待）

用户要"c"。R-111 那半（错误码映射）的判据**留待**（原话：同 N-12 的处理方式 —— 先要真实项目形态再落），
但按 **N-14 / N-15 的先例**（"判据不立、推荐形态进示例"）把形态演出来：

- 唯一映射表 `shared/lib/errorMessages.ts`（`ERROR_MESSAGES` + `messageOf()`）；
- 取数层**只暴露一次**错误码（`QueryState.errorCode`），页面不碰 `err.code`；
- 四个域页面各演一次"加载 / 失败 / 有数据"三分支（本来只有 crews 页面演过）；
- 两套语言资源各加 4 个 key（`common.errorRateLimit` 等，含 unknown 回退）。

**过程中被门禁抓到两处，都是真问题**：

1. **H12 退路残留**：文件名叫 `errorCopy.ts` —— 工具词汇表里的 `copy` 是"旧实现标记"（`Button.copy` 那种），
   我撞了自己的词汇 → 改名 `errorMessages.ts`；
2. **S18**：那个共享文件**只被一个域用** → 说明错误文案该真的跨域（于是每域页面都演了失败状态）。

**还被自己上了一课**：给三个页面补分支时**漏了 import**，而门禁**没报** —— 因为示例不跑 tsc（这正是
"示例的类型正确性归示例自己的 tooling"那条边界）。我用 esbuild 过了一遍两套示例全部 143 个文件的**语法**
（不需要装依赖，已在 devDependencies 里），但它只查语法、查不出未定义标识符 —— 那道口子仍留给示例的 tsc。

### Added（R-125：显式 `disable` 掉的规则会自述 —— 门禁不许静默缩水）

- 新 notice `rules-disabled`：配置里显式停用规则时，报告说清"停用了哪几条"。
  与「因能力未声明而停用」是**两笔账**：后者带"想要就跑"的配方（补一行即可），
  而 `disable` 是**整条关掉、不会自己恢复** —— 以前只显示"✔ 通过"，没人记得三个月前为什么关的。
- 文本同时指出**别把整条关掉当豁免**：只想"某条规则对某类文件不适用" → 用 `exceptions`（要求理由 + 可写到到期）。
- 边界：没 `disable` 就不提（否则这条自述自己会变成噪音）。

## [0.5.0] - 2026-09-25

> **契约与迁移（这一版必读）**
>
> - **契约变更**：`NOTICE_CODES` 新增 `architecture-advice`（架构建议）—— 按穷举映射消费 notice code 的
>   TS 代码会**编译期红**（这是设计）；`.mjs` / 脚本消费方请用 `NOTICE_CODES` 自查。
>   `apiVersion` **不变** · JSON 顶层字段集未变 · `SKIP_CODES` 未变 · **退出码语义未变**（建议**永不阻断**）。
> - **行为变化（要迁移）**：
>   1. **M08 同名配对收紧**：配对必须**同目录**（或顶层 `tests/` 下的同名文件）—— 跨目录同名不再算"有测试"
>      （以前 `modules/<域>/lib/mapper.ts` 会在别的域找到同名的测试而漏报）。迁移：补同目录测试，或收窄 `requireTestsFor`。
>   2. **M09 判定改严**：按**脚本名 + 一跳闭包**判定，不再用子串匹配 —— `self-test` 不再满足"跑过 `test`"。
>      迁移：在 `check` 链路里真的跑 `pnpm test`（`test:e2e` 这类也要真的被引用）。
>   3. **`apis` 匹配语义统一**：`endpoints` / `permissions` / 事件名（D24–D29）现在也认**对象前缀**
>      （`can` ↔ `can.has`），以前只有 `callSites` 认。迁移：把这类调用收进声明落点，或加 `exceptions`（写理由）。
>   4. **新规则在范式预设下即启用**：`S45` `S46` `D25`–`D30` `M10` —— 存量项目会新增报错。
>      迁移：按 finding 的 hint 把调用/声明收进落点，或用 `exceptions`（带理由与到期）。
> - **兼容性新增（不是破坏性）**：`endpoints({ source })` 收数组/glob · `callSites` 组新增 `args` / `from` ·
>   `metrics({ tests: { homes } })` · `overrides.adviceAllow` · `arch-guard init` 子命令。
> - **缓存**：`FACTS_CACHE_SPEC` 8 → **10**（新增 `functions[].ownedProp` / `inCall`、`strings[].arrayPath`、
>   `calls[].templateParts`）→ 旧 facts 缓存自动作废重算，无需人工动作。
> - **规模**：规则 98 → **107** · 夹具 78 → **93** · 需求 84 → 121（`已完成` 110 / `已委派` 4 / `不做` 7）。
>
> **✅ 发布前必做（已做）**：`engines: >= 22.18.0` 是对外承诺 —— 已在 **Node 22.18.0** 上跑完整门禁：
> `pnpm check` **EXIT=0**（与 Node 24 同一套结果），并在**最终状态上复跑过**（93/93 夹具）。命令照 `AGENTS.md`
> 的写法（显式用 `node` 调 pnpm 入口，否则子进程仍是 24）：`nvm exec 22.18.0 node <pnpm 的 pnpm.cjs 路径> check`。

### Added（示例长大 + 变异回归 + 声明数字字段校验）

- `examples/full` 从 2 个域长到 **4 个域（62 个文件）**：补上共享组件与"中性词"声明，
  让规模化那几条声明（组数量 / 组名重复词 / 单复数 / 入度 / 组耦合）**真的有数据可算**，
  而不是配着空转。仍是 **93/98 在跑、0 finding**（覆盖率五条见上）。
- 新增 `tests/examples.test.mjs`：**35 个变异**把示例逐个改坏（写死路径 / 内联颜色 / 跨域直引 /
  声明写错 / 组名重复词 / 单复数混用 / 耦合超限 …），断言"**该抓的必须抓到**"；
  另有 4 个**边界变异**（N-08 裸随机 · N-09 a11y 形态 · N-12 TS 里的颜色 · 别名全局变量）断言"**必须不抓**" ——
  边界也得有回归，否则哪天误报回来没人知道。跑在临时副本里（跑完即删），不污染仓库。
  夹具管的是"规则**写对**了"，这一组管的是"规则**还有效**"，补上的是最薄的那层保护。
- 同一个文件里加**示例预算**：`examples/full` 的停用必须**正好**是覆盖率那 5 条（M02–M06），`examples/minimal` 的停用条数不许超过 29
  （少配一个面 = 悄悄少一层覆盖）。
- **声明里的数字字段必须是整数**（R-75 的覆盖面补一处）：`pluralConsistency.layers` 是**层号数组**，
  写成层名 `['modules']` 时配置照过、**S31 静默空转**（比较永远为假，规则"在跑"却什么都不判）——
  这正是搭示例时撞出来的。现在 `layers` · `groupCountLimits.max` · `directoryItemLimits.max` ·
  `groupInDegree.min` · `degreeLimits.maxIn|maxOut` 都要求整数，写错直接报错并说明"会让声明静默空转"。

### Added（FSD 样板 + R-87：范式无关的规则不许"静默消失"）

- 新宿主示例 [`examples/full-fsd/`](./examples/full-fsd/)（60 个文件）：`fsd()` 六层 + 切片 + 片段封闭枚举，
  与 `examples/full` **对称** —— 同一套 5 个域 + 8 个方案面 + 结构声明，只换落点
  （`src/shared/routes/paths.ts` · `src/shared/api/queryKeys.ts` · `src/shared/lib/analytics/events.ts` ·
  `src/shared/lib/shell/**`…）。**82/98 在跑 · 0 finding**；差的是覆盖率 5 条（同 canonical）+
  `S13`（判据来自 canonical 的槽位声明）+ `S37`（本示例不分包）。
- **R-87：范式无关的规则不许在某个范式下"静默消失"**。搭 FSD 样板时实测：`fsd()` 复用 `library()` 的启用清单，
  那清单少了 **9 条与范式无关的规则**（S17 · S20 · S37 · S39 · S40 · S41 · S42 · S43）—— 它们在 FSD 下
  **既不跑、也不在"停用"清单里**，宿主配了 `clientState` / `authRedirects` / `couplingLimits` / `maxRelativeUp`
  也毫无作用，而报告一个字都不提。（R-74 的姊妹条：那条管"注册了却永远不命中"，这条管**压根没注册**。）
  已补进共享启用清单；`S19`（单文件导出值上限）**不收** —— 库的模块本来就是 API 面，补上后本仓自己 16 处"超限"。
- **新增元门禁**（`tests/paradigm-coverage`）：拿两份真实示例（`canonical` / `fsd`）的**注册差集**判定，
  差集必须**正好**是明列的 9 条"应用专属"规则，多一条就红（做过"故意删掉一条启用项 → 变红 → 字节级还原"验证）。
- 顺带修两个真问题：
  - **S20 不尊重 `ignore`**：`foreign`（别的框架的源码扩展名）在 ignore 过滤**之前**收集，
    于是"已明确移出扫描范围"的夹具（`.vue`）照样触发 S20 —— 而 S20 自己的提示正是"移出扫描范围（ignore）"。
    现在 foreign 也走 ignore，这类文件还会正确计入"ignore 命中 N 个文件"。
  - 夹具 `fsd-import-locality` / `import-locality` 的期望补上 `S17`：两个 `Helper.tsx` 同名导出，
    **本来就是真阳性**，只是 S17 此前在 FSD/库范式下没启用才漏掉。

### Changed（R-88：文案位名单由组件库适配器给 —— 一次"报得更多"的变化，必读）

- 你问了句好问题：「已知用户用了 antd，`copy({ messageApis, messageProps })` 这两张表是不是能省掉？」
  —— 能。`message.success` / `notification.open` / `Modal.confirm`、以及 `message` / `description` /
  `title` / `content` 这些属性名是 **antd 自己的事实**，不是项目的事实；`antdKit()` 现在直接声明它们，
  C01 的"组件库调用里的文案"那一半不再要求宿主手抄。
- **迁移（这次会多报）**：已经 `uiKit(antdKit())` + `i18n(...)` 的项目会开始报 `message.success('保存')`
  这类裸文案 —— 那正是以前因为没声明而漏着的。若某些调用是**开发者提示**、本就不该走 i18n，
  用 `copy({ messageApis: [...], messageProps: [...] })` **覆盖**适配器默认（传 `[]` = 显式关掉那一半）。
  项目**自己的封装**（`appToast.success`、自家 `notify()`）仍要在 `copy()` 里声明 —— 那是项目事实，适配器猜不到。
- 适配器契约新增两个字段（`UiKitAdapter.messageApis` / `messageProps`，`ui-kit` 面的字段白名单同步登记），
  换库时名单跟着适配器走；`copy()` 的这两个参数从"必须给"变成"可选覆盖"（不写 = 用适配器默认）。
- 新夹具 `copy-from-kit`（**79** 个夹具）：故意**不写** `copy({...})`，断言 antdKit 给的名单照样判出裸文案；
  单测补三例：适配器默认 / 项目覆盖 / 显式空数组关掉。

### Added（R-89：C01 的名单来源自述 —— 换库不再"安静地少判一半"）

- 用户追问了一句"这样做不算架构耦合吧"：**不算**（规则读适配器数据是既定机制，方向单向、
  与 H06 读 `uiKit.detachedApis` / D10 读 `vendorSelectors` 同形、本体仍零库名），
  但顺着这个问题实测出一处**静默**：C01 对 `uiKit.messageApis` 是**可选读取**，`requires` 又是整条规则粒度 ——
  换成没声明这份名单的 kit（或 `uiKit(noneKit())`）时，"组件库调用里的文案"那一半**安静地关掉**，
  报告只显示"✔ 通过"。
- 现在每次运行自述 `copy-list-source`（`notices`，**兼容性新增**，不 bump `apiVersion`）：
  `copy({ messageApis }) 项目声明 N 条（覆盖 uiKit(antd) 默认 M 条）` · `uiKit(antd) 默认 M 条` ·
  `copy({ messageApis: [] }) 显式关掉` · `无 —— 这一半没在判`。C01 没在跑时不说（已由「因能力未声明而停用」明列）。
- 单测四例（四种取值 + "C01 没跑就不提"）；冻结的 `NOTICE_CODES` 清单同步登记。

### Added（R-95：`callSites` 的来源常量 —— 用户不必背字符串）

- 用户反问"有点复杂，用户会配吗"，随后指出要害：**`from: 'platform.storage'` 这种取值只能靠背**。
  现在导出常量命名空间（**兼容性新增**，同时导出 `CALL_SITE_SOURCE_IDS` / `ENV_READ_ROOTS`）：
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
  编辑器能补全、拼错立刻可见、改名可重构；字符串写法仍然支持（不破坏兼容）。
- **常量从 id 表派生**（`callSiteSources` ← `CALL_SITE_SOURCE_IDS`，同 `NOTICE` / `SKIP` 的形态），
  加一个来源只改数据表一处；新增门禁断言两者不许漂移。两个示例改成用常量。

### Changed（R-96：FSD 的样式落点归到官方 `app/styles`，布局进 widgets —— **有迁移动作**）

- 用户问"`examples/full-fsd/` 符合 FSD 规范吗"。对着官方 v2.1 逐条核之后，主干符合（层与顺序、切片只能引更低层、
  app/shared 无切片且段间可互引、切片公开面、切片内相对 / 跨层别名、命名），但有两处不够规范：
- `fsd()` 的默认落点改了：`tokenDir` / `vendorDir` / `paletteFile` / `themeFile` 从 `src/shared/ui/styles/**`
  移到 **`src/app/styles/**`**。理由：官方要求 shared 的段"按用途命名"，`ui` 段里塞设计令牌不合规范；
  而且 `shared/ui/styles` 作为 `shared/ui` 的子目录还得有一个**只为占位**的 `index.ts`（公开面）。
- **迁移**：FSD 项目的令牌若仍在 `src/shared/ui/styles/**`，两条路 —— 搬到 `src/app/styles/**`，或在
  `designSystem({ tokenDir, vendorDir, paletteFile, themeFile })` 里显式覆盖旧路径。
  **不确定有没有影响？报告会告诉你**：这次把 `designSystem` 的六个落点参数纳入"0 命中"自述
  （`designSystem.tokenDir 的 …` / `paletteFile 的 …` 指向不存在的目录 / 文件就点名），不再安静地少判。
- 示例 `examples/full-fsd`：布局从 `app/routes/AppLayout.tsx` 移到 **`widgets/app-layout/`**
  （官方明确说"页面布局可以放在 widgets 层"）—— 示例现在用满 5 层：app / pages / widgets / features / entities / shared。
- 已知偏离照旧钉着：官方 `@x` 跨引用公开面**未实现**（用了会被报 S01，见 `tests/fsd-conformance`）。

### Added（R-107 / S45：导入的成员必须真的被导出 —— 最容易发生的一类"假绿"）

- 用户问「`crewPolicy` 放在 `shared/api/queryClient.ts` 合理吗」，核对时撞出两处**门禁看不见的假绿**：
  4 个 hook 从 `@/shared/api/client` 引根本不存在的 `crewPolicy`；示例唯一的测试 import 了不存在的常量
  （坏了很久）。根因同一个：**路径解析得到、名字却不存在**，此前没有任何规则管。
- 新规则 **S45**（L1 error）：本地 import 的具名成员（含 default）必须真的被导出。
  事实模型据此扩了三个字段（`ImportFact.names` / `hasDefault` / `star`），`FACTS_CACHE_SPEC` 6 → 7。
  边界（宁少报不误伤）：目标解析不到（第三方 / 域外）不判 · 目标没有事实（CSS 等非 TS）不判 ·
  星号导出（`export *`）导出集未知 → 整条跳过 · `import * as ns` 不判名字。
- 夹具：`missing-export`（专锁上面四条边界 + 一处违规）；既有的 `graph` 夹具里三处**真阳性**
  （默认导入目标无 default · 具名导入名字对不上）补进期望 —— 夹具数 79 → 80。
- 顺带修：示例的 4 处断 import 改成从 `queryClient` 引；示例自己的测试进 `pnpm check`（`examples:test`）。

### Changed（R-97：缓存键可以跟着域/切片走了 —— `queryKeyFrom` 收多落点）

- 用户问「`export const crewPolicy = { staleTime: 300_000, retry: 2 }` 放在 `shared/api/queryClient.ts`
  合理吗」。不合理：`staleTime` / `retry` 是**每个域的数据时效**，键的形状也是域的知识 ——
  放共享层的话，每加一个域都要改同一个文件（横向 merge 队列），域删掉时还要跨文件清理。
  （顺带发现：`crewPolicy` 与全局兜底**逐字相同** → 纯重复，直接删。）
- 能力：`queryKeyFrom` 从"一个文件路径"变成**收字符串或数组，每项可以是 glob**
  （`['src/modules/*/model/query.ts']` 一行覆盖所有域）。**兼容**：原来写字符串的配置照旧生效。
  适配器字段校验、"0 命中"自述（R-86）与 D22 的"落点不存在"判定都跟着支持多落点/ glob。
- 示例（A3，两套都改）：键与策略从 `shared/api` 下沉 —— canonical `modules/<域>/model/query.ts`、
  FSD `entities/<实体>/model/query.ts`（页面经实体公开面取用）；`shared/api/queryClient.ts` 只剩
  "一个实例 + 全局兜底"；`numberHomes` 相应变成多落点（`src/shared/api/queryClient.ts` + 域内 glob）。
- 夹具 `cache-keys-multi`（81 个）：数组落点 + glob + 落点内合规 / 落点外违规；单测补多落点与
  "某个落点命中 0 个文件 → 逐个点名"。

### Added（R-98：域有了业务公开面 —— 跨域协作不必再"抬进 shared"）

- 两份独立审查都指向同一处（C2）：canonical 的域公开面**只有 `routes.tsx`**（那是路由入口），
  而 `isolate: ['domain']` 禁一切同层互引 —— 域间要共享实体时，唯一出路是把它**抬进 `shared`**，
  于是 `shared` 长成"第二套 modules"（C1：端点/DTO/键/策略全在那儿）。
- 能力：**公开面改成声明驱动** —— S04 / S05 以前只认路由适配器的 `routeFiles`（`routes.tsx`），
  现在认**所有 `entry: true` 的角色**（与 S23 早就用的口径一致）；canonical 新增角色
  `module:index`（域根 `index.ts`/`index.tsx`，`group: 'domain'`、`entry: true`）。
- 声明上的取舍写进 `PARADIGM.md` §6.9：`publicApi: ['domain']`（跨域只许经入口，**推荐**）
  或 `isolate: ['domain']`（一律禁 —— 那时跨域只能靠 `app` 组装或抬进 `shared`）。
- 示例（A4）：`modules/crews/index.ts` 作业务公开面，`billing` 页**真演示一次跨域取用**；
  示例的声明从 `isolate` 改成 `publicApi`（保留 S23 兜底："直播捣内部照报"）。
- 夹具 `domain-public-api`（82 个）：经公开面合规 · 直捣内部被 S04 + S05 报。

### Added（R-104 + A1/A2/A8/A11/A14：复数能写了 · 取数归实体 · 状态是一等公民）

- **R-104 复数文案**：`t('orders.count', { count })` 取的是 `count_one` / `count_other`，而三条规则以前都不认它 ——
  C02 会说"键不存在"、C03 会说"两门语言键不一致"（可英文有 `_one`、中文只有 `_other` **本来就该不一样**）、
  C06 把每个变体当死键。于是"写不出复数"是规则逼出来的。现在：C02 复数感知、C03 **按基键对账**、
  C06 由基键点亮变体。示例两套都改成真的复数（en `_one`+`_other`，zh `_other`）。
- **A1 取数归实体（FSD）**：`pages/*/api` 整体下沉到 `entities/<实体>/api`（连同 mapper / keys / policy），
  实体公开面暴露 hook；页面不再自己打后端。`fetchIn` 改成 `src/entities/*/api/**`。
- **A2 显式映射 + 状态是一等公民**：每域一个 `mapper.ts`（DTO → 领域实体；后端字段改名时**这里会报类型错**，
  而不是静默丢字段）；hook 统一返回 `QueryState<T>`（`shared/api/queryState.ts`：`data` / `isPending` /
  `isError` / `retry`）—— `data ?? []` 会把"失败"与"没有数据"压成同一个空数组；页面演示 loading / error 分支。
  组件收**实体**不收裸值（`CrewCard` / `OrderCard` / `CrewsTable`）。
- **A11 分层归位（FSD）**：`crew-filter` 收窄成**受控筛选**（交互归 features），列表渲染提到
  `widgets/crew-list`（展示复合块归 widgets）；筛选行为是纯函数 `applyFilter`。
- **A14 行为测试**：域/实体的 mapper 各有行为测试（替代原来那条"常量等于字面量"的自证），
  `requireTestsFor` 相应扩到 `src/modules/*/lib/mapper.ts` / `src/entities/*/model/mapper.ts`。
- 两套示例都加了 `common.loading` / `common.loadFailed` 文案与真实的分支渲染。

### Added（R-99 + R-100：端点有唯一出处了 · 缓存键形状有判据了 —— 都要先扩事实模型）

- **R-99 后端端点唯一出处**：端点以前是"事实模型里的隐形人"—— 它多写在模板串里
  （``fetch(`${API_BASE_URL}/crews?limit=${n}`)``），模板串的静态前缀常为空、`strings` 只收纯字面量，
  于是"改接口漏一处 = 404"任何规则都管不到。现在：
  - 事实模型扩 `calls[].templateParts`（模板串的**全部静态段**：`['', '/crews?limit=', '']`）；
  - 新面 **`endpoints({ apis, source })`** + 新规则 **D25**：打后端的调用实参里出现路径字面量即报；
  - 示例两套改成端点表（`shared/api/endpoints.ts` + `ENDPOINTS.crews`），夹具 `endpoints`（84 个）。
    实测：在别处手拼 ``fetch(`/orders?limit=1`)`` → D25 点名。
- **R-100 缓存键形状一致**：D22 只管"字面量在不在家"，管不了形状 —— `list: ['crews']` 与
  `detail: (id) => ['crew', id]`（单数）混用时 `invalidateQueries(['crews'])` **前缀匹配不上**，
  缓存不失效、数据不刷新，而门禁一路绿。现在事实模型扩 `strings[].arrayPath`
  （数组首元素所属的"键工厂 + 属性"坐标，`crewKeys.detail` 这种写在箭头函数体里的也认），
  新规则 **D26** 按工厂分组比对前缀；夹具 `key-shape`。
- 顺带修一处真实的契约踩坑：适配器里 `from` 已经被 i18n 用作"提供该面的包"，端点面一开始也叫 `from`，
  被 P04 当成包名并**按字符展开**（`s`、`r`、`c`、`/` 被报成缺依赖）→ 字段改名 `source`，
  并加固 `packagesOf`（字符串不再被当数组展开）。

### Added（R-101 + R-102 + R-103：三条"门禁绿但跑起来坏"的判据）

- **R-101 / S46 埋点上报不许写在渲染体里**：渲染体每次重渲染都执行（StrictMode 还双调用）——
  埋点虚高、计费失真，而 D24 只看"事件名是不是字面量"，看不见调用位置。判据用
  `functions[].isComponent` 取**最内层**包含该调用的函数：是组件就是渲染体，是 effect / 回调就不算。
- **R-102 / D27 对比度组合必须声明过**：D07 只算**声明过的那几对**，于是"语义令牌当反色用"
  （`color: var(--surface)` + `background: var(--brand)`，白字橙底 3.1:1）永远算不到 ——
  真实撞过的是配置里挑了一对必然通过的组合。这条负责**发现漏声明**。
- **R-103 / D28 声明的样式落点必须有入口**：`styleDir` / `tokenDir` / `vendorDir` 下至少有一份 CSS
  能被**应用侧**（非 CSS）引用到 —— 沿 `@import` 链上溯（只看"有没有引用者"会假阴性：几份 CSS
  互相 @import 也算引用）。真实踩过：四份全局 CSS 都在、谁也没引，主题静默不生效而门禁全绿。
- 夹具 `analytics-position` · `contrast-pairs` · `style-entry`（84 → 87）。
- 实测（改坏示例 → 报 → 还原）：D27 抓 `--surface 叠在 --brand 上`；D28 在删掉样式入口后
  同时点名三个目录；S46 由夹具覆盖（渲染体上报 vs effect 内上报）。

### Added（R-105：官方 `@x` 跨引用公开面 —— FSD 实体互引的唯一出口）

- `fsd()` 认得 `<provider>/@x/<consumer>.{ts,tsx}`（每个切片层一个角色，带 `consumer` 捕获）：
  provider 声明"允许 consumer 拿这些"，**只放行被指名的那一侧**。
- S22（组隔离）与 S23（公开面）为它开**同一条例外** —— `@x` 文件不算组的公开入口，
  但被指名的调用方可以直接引它。没被指名的切片引同一个文件 → 两条规则照旧报。
- 一致性测试里那条"已知偏离"翻过来了：以前断言 `entities/song/@x/artist.ts` 会报 S01，
  现在断言（① 不再报 S01 ② 被指名的一侧合规 ③ 没被指名的一侧 → S22）。夹具 `cross-import-x`（88 个）。
- 为什么不是"放开同层互引"：连接从**看不见的横向依赖**变成**显式声明**，重构时想忽略都难
  （官方原话："make the connection impossible to miss"）。文档：`PARADIGM.md` §6.10 · USAGE §2.7。

### Added（R-106 后半：`arch-guard init` —— 用户只回答"选什么"）

- 新子命令 `arch-guard init`：`--paradigm canonical|fsd|library` · `--ui antd|none` ·
  `--data react-query|none` · `--i18n i18next|none` · `--langs` · `--out` · `--force`。
  生成一份**填好落点、能直接加载**的 `arch.config.mjs`（`specVersion` / `packs` / 范式 / 域预设 /
  选中的 kit / 依赖白名单都齐），并打印下一步（跑一次看停用清单）。
- 生成物必须**通过 `loadConfig`** 是它的验收条件（测试里把真包软链进临时项目做端到端加载，
  而不是把 import 换掉再看）：三种范式 × 选/不选 kit 都能加载；没选的面就不声明（不猜）。
- 已存在时不覆盖（要覆盖得显式 `--force`）—— 起手工具不该悄悄改掉用户已经写过的配置。

### Fixed（示例的"散文数字"烂了两轮 —— 这次连门禁一起补）

- **示例度量过期**：`AGENTS.md` / `docs/USAGE.md` 里还写着 `93/98`·`82/98`·`69/98`（实测 **99/104 · 88/104 · 71/104**）、
  "5 个域"（实际 4）、"23 个角色"（canonical 实际 27）、"抄 139 行"（实际 166）。
  根因不是手滑：DESIGN / README / ARCHITECTURE 的计数都有门禁，**示例这一项漏了**。
  → `tests/process.test.mjs` 新增两道流程门禁：
  ① 文档里凡在讲示例度量的那一行，比率必须是当前值（分子是某个示例的实测数、分母是规则总数），
  抄旧数字或把两个示例写反都会红；② 示例配置里提到的**字面**落点路径必须存在
  （`examples/full-fsd` 的配置头一度还指向 R-97 已搬走的 `src/shared/api/queryKeys.ts`）。
- **FSD 示例补上 `@x` 演示**：`entities/crew/@x/order.ts` + `entities/order/model/selectors.ts`
  （`crewOf(order, crews)`）+ 页面里两个实体各取各的数据再组合。引用走别名
  （S32 要求跨组走别名）；把 consumer 名字改成 `orders` 立即报 S22 + S23 —— 示例真的在演这条通道，
  不再是"只有夹具里才有"。顺带：`OrderDto.crew` → `Order.crewId` 由 mapper 显式翻译。

### Notes（R-109 判"不做（委派）"：这条早就判过了）

- 探针发现"本地 import 路径解析不到时无人报"（把示例里 `entities/crew/@x/order.ts` 改名 → 守卫 0 finding），
  于是先按新需求开了原型（S47）。**随后翻到仓库里的旧结论**：本体原有一条 **S33** 判这件事，
  0.4.0 **主动移除**并委派给 eslint `import/no-unresolved`（DESIGN §4.9 · DELEGATION-REVIEW：
  "射程与 tsc 重合，增量价值≈0，不值得一条规则"）。→ 原型**全部撤回**（规则 / 夹具 / 引擎改动都没留），
  R-109 记为 `不做（委派）`。
- 委派的现状（诚实记一笔）：`src/**` 由 tsc 兜（`pnpm check` 会跑，实测 TS2307）；但 `eslint.config.mjs`
  里没有装 `import/no-unresolved`（也没有 resolver）—— 所以**示例目录**里这类错仍然静默。
  要补上需要 2 个 devDep，其中 `unrs-resolver` 带 postinstall，放行与否是宿主的供应链决定，未替宿主做。

### Added（R-111：失败处理的策略也有落点 —— D30）

- **新面 `errorPolicy({ policyIn, policyProps? })` + 规则 D30**：函数型策略
  （`retry: (count, err) => count < 3`）与枚举型策略（`backoff: 'exponential'`）只许出现在声明的落点。
  策略**名字**可以不写 —— 装了 `dataLayer(reactQueryKit(...))` 就由 kit 的 `policyProps` 给（库的事实不抄）。
- **与 D20 的分工写在文档里**：数字型策略（`retry: 3` / `staleTime: 60_000`）归 `numberHomes`；
  函数体里藏着的口径与枚举归 D30 —— 同一处不会两条都报。
- 事实模型扩 `functions[].ownedProp`（属性值函数的所属属性名，**不随函数体断开**）与 `functions[].inCall`
  （最近外层调用名）；`FACTS_CACHE_SPEC` 8 → 10。
- **被真实假阳性逼出来的收窄**（值得记）：第一版判据只看"属性名命中 + 值是函数/枚举"，立刻在示例里
  误报两处 —— `queryState.ts` 的 UI 回调也叫 `retry`，i18n 的文案键 `retry: '重试'` 也是字符串。
  于是收窄成"**只判策略对象作为调用实参**"（`useQuery({ retry: … })`），并在夹具里钉住这条边界。
  这与 N-10 判不做 feature flag 的理由同因：**泛名字会撞，判据必须收窄**。
- 夹具 `error-policy`（90 → 91）：函数型 / 枚举型必报；数字型、引用、测试文件、**同名但不在调用里的属性**都不报。
- 两套示例都补了 `shared/api/policy.ts`（策略的家）并在 `queryClient` 里引用（不是抄字面量）。

### Added（R-112：测试分层有落点 —— `tests.homes` + M10，并修掉 M08/M09 三个既有裂缝）

- **`metrics({ tests: { homes: [...] } })` + 规则 M10**：每层测试一个落点，三条判据 ——
  ① `imports: 'public'` 的层（e2e）只许经公开面 / 应用入口 ② `mustImport` 的层必须真的引用声明的
  契约产物（否则契约漂移没人发现）③ 声明的落点零命中即报（声明空转）。边界：同层内部 import、
  `test` 角色、产物不存在时都放行。
- **修掉三个既有裂缝**（都是"假绿/假红"）：
  - M08 的同名配对用**全局 basename** → 多个域各有一份 `lib/mapper.ts` 时"删掉一个域的测试照样绿"；
    现在要求**同目录**配对（或顶层 `tests/` 下的同名文件）。
  - M08 的测试文件判定只认 `testGlobs` → 而 `canonical()` 给了 `**/__tests__/**` 测试**角色**，
    Jest 形态的项目假红；现在**角色与 glob 都认**。
  - M09 用 `chain.includes(cmd)` 子串匹配 → `self-test` 满足了"跑过 test"，`test:e2e` 从没跑也一声不吭；
    现在按**脚本名解析 + 一跳闭包**（`check → test → …`），认不出的直接命令放过。
- 夹具 `test-homes`（91 → 92，三条判据各一个违规样例 + 边界样例）；示例（canonical）加 `e2e/` 与
  `tests/contract/`（契约测试**真的在 `node --test` 里跑**），并在配置里演示三条配套：
  `include` 覆盖测试层 · 每层一个角色 · `entries` 补应用入口。

### Added（R-113：配置写错在**配置期**报错，不再静默忽略）

- **三层键白名单 fail-closed**：顶层（`specVersion` / `presets` / `packs` / `overrides`）·
  `overrides`（`Config` 的键 + `addRoles`）· `overrides.structure`（`StructureSpec` 的键）。
  不认识的键直接拒，并列出可用键 + **针对性的提示**。
- 白名单用 `Record<keyof X, true>` 写：**类型加了字段这里就编译不过** —— 白名单不会悄悄落后于契约
  （实现时 tsc 当场证明了三个清单都是完备的）。
- 真实形态：`addRoles` 放进 `overrides.structure`（键名对、值是好的，只是放错一层）→ 以前静默忽略、
  S01 照旧报"域根散件"，人只会去怀疑自己的 glob；现在直接说
  "`addRoles` 在它**外面**（overrides 层）"。
- 适配器字段本来就已经是 fail-closed（`defineAdapter` 拒未知字段）—— 这次补齐的是 `overrides` 那三层。
- 边界：`params` 里的键由范式 / kit 决定，不在此列（它们各有自己的校验）。

### Fixed（R-114：名字清单拼错一个字母，规则静默不判 + `endpoints.from`）

- **0 命中自述补全**：`endpoints.apis` · `permissions.apis` · `callSites[].args` · `errorPolicy.policyProps`
  以前拼错一个字母 = 那条规则一条都不判，而报告里**没有它**（实测：`apis: ['fetchX']` / `['canX']`
  一个字都没提）。现在都会点名，并带上"正确形态参考"。
- **边界（R-92 的既有判据）**：用 `from:` 指向来源表 / kit 的**既有清单**时不报 —— 它们天然包含
  "这次没用到"的项，报了只会逼宿主把清单收窄。
- **`endpoints({ from })`**：可以像 `callSites` 一样用来源 id（`callSiteSources.platform.network`），
  不必手写 `apis: ['fetch']`。两套示例改成这个形态（这也是"平台事实进表"这条原则在端点面上的落地）。
- **这段自述在写完的几分钟内就抓到了我自己**：我先把示例改成 `apis: callSiteSources.platform.network`
  —— 而那个常量**值是来源 id 字符串**（不是数组），`[...'platform.network']` 变成一串字符，
  D25 在两套示例里**静默失效**、门禁全绿。是新加的 `endpoints.apis` 自述把 `p / l / a / t / f`
  逐字点出来，才发现。修的正是缺的那半：`from:`。

### Fixed（R-115：`apis` 的匹配语义收敛到一处 —— 判据与自述不再各说各话）

- **同一件事以前有四份实现、两套规则**：`callSites` 组与"声明 0 命中"自述认"整名 / 对象前缀 / 方法后缀"，
  而 D24 / D25 / D29 只认"整名 / 方法后缀"。实测：`permissions({ apis: ['can'] })` + 调用
  `can.has('crew:edit')` —— **规则不判**（漏判一处越权入口），而自述认为 `can` 已被命中、**不点名**
  （自述替漏判打掩护）。
- 现在匹配只有 **`src/engine/api-match.ts`** 一处实现，四处调用点（S38 / D24 / D25 / D29 / 自述）共用；
  形态统一为「整名 ∪ `api.` 前缀 ∪ `.api` 后缀」，**都有 `.` 边界、不是子串**（`can` 不吃 `cancel`），
  同一调用命中多个声明时取**声明顺序里的第一个**。
- 单测 3 条：匹配三形态 + "不是子串"边界 + 顺序可预期；另加一条 D29 的行为测试
  （`can` / `can.has` / `auth.can` 都算命中，`cancel` 不算）。
- 修的过程中我自己把参数顺序写反（`called(api, pool)` 的语义是"池里有没有名字匹配这个 api"），
  探针当场显示"自述又反过来诬告 `can` 从没命中" —— 一并修掉。宿主向文档补了匹配形态表
  （PARADIGM §6.16 / USAGE §9.2）。

### Added（R-116：端点表可以跟域走 —— `endpoints.source` 收数组 + glob）

用户问"ENDPOINTS 不跟域走吗" —— 一查发现**想做也做不到**：`endpoints.source` 只收**单个文件**，
而缓存键的 `queryKeyFrom` 在 R-97 就已经支持数组 + glob（同一族能力，两套射程）。

- **`endpoints({ source })` 现收 `string | string[]`（支持 glob）**，D25 按多落点判定；
  某个落点零命中只报"那个落点不存在"（与 D22 同形，不拿整个项目的字面量刷屏）。
- **什么时候该跟域走写进文档**：端点是**外部契约**（后端定，前端改不了），集中可审有正当理由；
  但"集中"不该等于"一个文件" —— 判据是**团队结构**：按域分治 → `['src/modules/<域>/model/endpoints.ts']`；
  一个后端整体审阅 → 一个文件。对照：缓存键 / 请求策略是**前端自己的约定**，一律跟域走（R-97）。
- 夹具 `endpoints-per-domain`（92 → 93）：两个域各自的表 + 一个域手拼字面量被点名；
  另实测"落点 glob 零命中"只报一条。
- **没有搬示例**：`examples/full` 是"4 个域一个后端"的真实形态，集中就是它该有的样子（需求里写明这条边界）。

### Changed（R-117：分页常量跟域走 + 落点判据细化成三问）

- 用落点判据把示例里**集中放的东西逐个过了一遍**，产出一处真修正：`shared/config/constants.ts`
  里四个域的分页大小（审查 §2 列的 5 个 shared 热点之一，R-97/A3 搬了键与策略、这条漏了）——
  三条判据全部指向跟域走：本域 UX 决定 · 加域要改共享文件 · 名空间是局部的。
  现在每个域/实体的分页大小进自己的查询契约文件，`numberHomes` 改成 glob 声明，两套示例同步，
  共享常量文件删掉。
- **其余四处经审计判定仍该集中**（写进 PARADIGM §6.15 的审计表）：后端端点（外部批量 + 改登记表 +
  全局名空间）· DTO（外部批量；mapper 跟域走）· 埋点事件名（外部 + 全局名空间）·
  路由（前端发起但 URL 空间是全局的）· i18n（**加域不改已有文件**，所以集中目录 + 分域文件）。
- 判据本身从"看团队结构"细化为**三问**：① 谁发起变更 ② 加域是加文件还是改共享登记表
  ③ 名空间是全局还是局部。

### Added（R-118：报告开始给"架构建议" —— 可核对信号 + 处方，永不阻断）

用户问"怎么基于项目事实给出架构建议"。答案是把架构直觉变成三件可落地的东西：
**信号**（从已有事实算）· **阈值**（保守且写死默认）· **处方**（具体动作选项）——
而且它必须走**自述（notice）**这条路：进报告、进 JSON、**不影响退出码**。
规则管"违规 → 红"（机械可判定、零误报），建议管"判断 → 你看"。

- **第一条信号**：一个文件里 **≥3 个导出各自只被一个域用**（且域各不相同）→ "这些东西跟域走更省心"
  （加 / 下线一个域都要改这个文件）。**边界**：纯类型导出不算（DTO 按域命名却该集中）·
  被多个域共用不算（真跨域中立）· 只数具名导入 · 公开面入口不算。
- 新 notice code `architecture-advice`（进 `NOTICE_CODES` 契约清单），报告尾部渲染并在 JSON 里给出。
- **它在真示例上立刻找到一条真信号**：`examples/full` 的 `shared/api/client.ts` 里
  `fetchCrews→crews · fetchOrders→orders · fetchCustomers→customers · fetchInvoices→billing` ——
  与刚搬走的分页常量（R-117）同一族；而 FSD 那边 A1 已经按实体下沉 → **两套样板不对称**（记为 R-119）。
  `minimal` / `full-fsd` 上 0 建议（阈值与边界都在工作）。

### Changed（R-119：取数函数跟域走 —— 两套样板重新对称，架构建议归零）

- `shared/api/client.ts` 以前装着四个域的取数函数（`fetchCrews` / `fetchOrders` / `fetchCustomers` /
  `fetchInvoices`）—— 与刚搬走的分页常量（R-117）同一族，而 FSD 那边 A1 早已按实体下沉 →
  **两套样板不对称**。现在它只留**传输层**（`requestJson`：基址 / 鉴权 / 错误处理），
  各域/实体的取数在各自的取数落点里：端点来自唯一出处（D25）、分页来自本域查询契约（R-117）、
  映射来自本域 mapper —— 加 / 下线一个域不必改共享文件。
- 顺手把"**裸网络调用只许在传输层**"声明进 `callSites`（`from: callSiteSources.platform.network`，
  `in: ['src/shared/api/client.ts']`）—— 以前没声明，等于裸 `fetch` 到哪都合法。
- **验收**：R-118 那条架构建议在 canonical 上归零（两套示例都 0 条），测试里就按"已知健康的样板
  必须 0 建议"断言。改的过程中 S45 立刻抓到 `shared/api` barrel 还导出着被删的函数（正是它该干的）。

### Added（R-120：第二条架构建议 —— 组粒度）

- 第二条信号「**组粒度**」：某个组（域 / 切片）只有 **1 个源文件** → "这一层'组'其实是一个文件"
  （并进相邻组 / 提升为共享层 / 确认它只是 stub）；某个组 **>20 个源文件** → "这个组可能装了俩业务"。
  组取的是**仓库自己的概念**（`groupName` + `group`，即结构声明里的组维度），所以 canonical 的
  `{domain}` 与 FSD 的 `{slice}` 都吃；测试文件（layer ≥ 90）不计入。
- 为什么选它而不是"层序漂移"：后者 **S21 已经在报**（会与规则重复），而组粒度是没人管的那类退化，
  且判据稳（阈值保守：<2 / >20）。两条信号互补：一条看**文件内部**，一条看**组的大小**。
- 验收同 R-118：**两套已知健康的样板 + minimal 上 0 条**（实测），单测覆盖"1 个文件""21 个文件"
  与"2 个文件不报 / 测试层不计"三条边界。

### Added（R-121：建议的"已知例外" —— 豁免要写理由，而且必须可见）

- 建议机制缺的最后一块：以前一条建议**只能一直喊**。项目确认某文件是合理横切时，报告里那条会永远在 ——
  团队迟早学会无视整个建议区（比没有建议更糟），或者为了消掉提示去做错的重构。
- `overrides.adviceAllow` 形状**照抄 `exceptions`**（仓库既有的宽松通道）：按
  **（信号 id × 主体 glob）** 声明 + **理由必填** + **写了到期就必过期**（配置期校验 + 运行期报错）；
  信号 id 拼错 → 配置期直接拒（与 R-113 同口径，R-113 的键白名单由 tsc 强制补上了这一项）。
- **关键约束**：豁免**必须可见** —— 报告自述"被豁免了几条"，且"声明了却没命中"的豁免会被点名
  （可能可以删掉）。静默关闭是这套机制最该防的事。
- 单测：豁免生效 ✓ / 信号对不上不生效且报未命中 ✓ / 三条配置期校验（未知信号 · 缺理由 · 到期格式）✓。

### Added（`examples/full/`：把「配全」变成可跑的样板）

- 新宿主示例 [`examples/full/`](./examples/full/)：一个范式（`canonical`）+ 5 个域预设 + 8 个方案面 +
  结构声明全配的最小应用（62 个文件、4 个域）。**`pnpm guard:full` 跑出来：`规则 93/98` · 0 finding**（差的 M02–M06 是覆盖率五条：
  M06 要求产物比最近一次提交还新，**入库的产物必然过期** —— 本仓自己的配置也正因此不声明 `coverage`）
  （对照 `examples/minimal` 的 `69/98`）—— "完整配置长什么样"从此有可执行答案，而不是一段散文。
- 它同时是"声明写错会被抓"的现场证明。搭的过程中被门禁抓出 **5 处形态问题**：
  i18n 资源必须写成 `export default {}`（否则 C07 认不出文案文件）· P04 适配表声明的包必须在 `dependencies` 里
  （`@ant-design/icons` / `react-router`）· 模型类型没人 import（S15 孤儿）· 只被一个域使用的 shared 文件（S18）·
  `lib → config` 的反向依赖（S21）；以及 **2 处声明写错**（`sessionStorage` 声明了却没用到；`new QueryClient`
  写成匹配不上的名字 —— facts 里的 callee 其实是 `QueryClient`）—— 后两条正是 R-86 那条 self-report 点出来的。
- 挂在 `pnpm check` 里（`guard:full`）：示例跟着门禁一起跑，不会烂掉。

### Changed（流程：本地门禁只跑 Node 24）

- 双 Node（22.18 + 24）是"没有托管 CI"的代价；实测收益不抵那份时间 → **本地只在 Node 24 上跑 `pnpm check`**
  （`AGENTS.md` 的"提交前"一节已改写）。
- `engines: >= 22.18.0` **仍是对外承诺** → **发版前补跑一次 22**（发布是对用户唯一兑现承诺的时刻；
  0.4.0 发布时已跑过：22.18.0 上 361 测试全绿）。`README` / `docs/USAGE.md` 里的"要求 Node ≥ 22.18"不变。

### Added（R-122 / R-123 / R-124：再补三条架构建议 —— 都落在"组"上）

用户要"全要"。三条信号都从**已有事实**算，各自带保守阈值与"不报"边界：

- **未测试的逻辑组**（`untested-logic-group`）：组里有逻辑（`lib`/`model`/`api`/`hooks` 里的非 JSX 文件）
  却整组 0 个测试。边界：路由表 / 装配 / 纯 JSX 页面不算"逻辑"。**它一上线就抓到两处真缺口**：
  FSD 的 `features/crew-filter/model/filter.ts`（`applyFilter` 纯函数）→ 补了行为测试并把它纳入
  `requireTestsFor`；`pages/crews/lib/format.ts`（依赖 dayjs，示例不装依赖）→ 用 `adviceAllow`
  声明豁免并写清理由（顺手在真示例里演练了 R-121 的豁免与自述）。
- **同层组复用**（`peer-reuse`）：一个组被 ≥3 个**同级或更内层**的组引用 → "它已经是公共依赖，
  只是没人承认这个地位"。边界：**上层用它不算**（FSD 的 `pages/widgets/features → entities` 是设计如此），
  所以两套样板都是 0 条。
- **组级依赖环**（`group-cycles`）：组边图里的环 —— **文件级可能没有环，S08 看不见**（FSD 里两个切片
  互开 `@x` 就是这种形态）。同一环只报一次。

测试：三条信号各一正例 + 各自边界（非逻辑片段 / 2 个消费方 / 上层消费 / 单向依赖），
加上"三套健康样板要么 0 条、要么只剩被豁免的自述"这条验收。

### Fixed（发布：`publishConfig` 必须显式指向 npmjs —— 否则"发布成功"是假的）

- **症状**：发布工具打印 `✅ Published package @arch-guard/core@0.5.0`，而
  `https://registry.npmjs.org/@arch-guard%2Fcore/0.5.0` **404**（0.4.0 是 200）—— 版本根本不在权威源上。
- **根因**：发布工具的 `publishPackage()`（`@pagoda-cli/core`）只在
  `package.json.publishConfig.registry` 存在时才拼 `--registry`；本项目没有该字段 → 它用了**默认源**，
  而默认源是 `~/.npmrc` 里的 **npmmirror 镜像**（只读）→ 镜像对 PUT 返回了"成功"，命令退出码 0，
  工具于是打印成功。
- **修复**：`package.json` 加
  `"publishConfig": { "registry": "https://registry.npmjs.org", "access": "public" }`
  —— 第一项让工具真的发到 npmjs，第二项是 **scoped 包必需**（否则默认 restricted）。
- **流程补一条**（发布会后必须验证，10 秒）：
  `curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@arch-guard%2Fcore/<版本>` → 期望 `200`。
  本轮就是没做这一步，才让假成功留了下来。

## [0.4.0] - 2026-09-25

> **契约与迁移（这一版必读）**
>
> - **兼容性新增（不是破坏性）**：`NOTICE_CODES` 新增 `adapters-in-use` · `declaration-no-match` ——
>   用穷举映射的 TS 消费方会**编译期红**（这是设计，见 §6.9）；`.mjs` / 脚本消费方请用 `NOTICE_CODES` 自查。
>   `apiVersion` **不变**（仍 `2`）· JSON 顶层字段集未变 · `SKIP_CODES` 未变 · 退出码语义未变。
> - **行为变化（要迁移）**：判定等级修正 —— `H08` · `D01` · `D02` · `D09` · `D12`–`D14` · `D18`
>   从 `L1` 改成 `L2`（与 DESIGN 一致）：`--min-level L1`（只跑路径级）**不再跑这 8 条**，要跑它们用 `--min-level L2`。
> - **缓存**：`FACTS_CACHE_SPEC` 5 → 6（事实模型新增 `styleProps` / `numbers`）→ 旧 facts 缓存自动作废重算，无需人工动作。
> - **规模**：规则 95 → **98** · 夹具 75 → **78** · 需求 80 → **84**（`已完成` 74 / `已委派` 4 / `不做` 6）。

### Fixed（发布：`bin` 路径前缀 · 发布目标显式化）

- **`bin` 写成 `./bin/arch-guard.mjs` 会被 npm 判为无效并「从发布产物里移除」** —— 消费者装上就没有
  `arch-guard` 命令（`npm publish --dry-run` 会警告 `bin[arch-guard] script name … was invalid and removed`）。
  去掉 `./` 前缀（`npm pkg fix` 的标准形态）后已用**真实安装**验收：`npm pack` → 装进空项目 →
  `node_modules/.bin/arch-guard --version` 输出 `0.4.0`、`@arch-guard/core/presets` 子路径导入可用。
- `publishConfig.registry = https://registry.npmjs.org/`：发布目标**显式写进包**（本机全局 registry 是
  淘宝镜像，`npm publish` 不显式指定就会走错）。`pagoda-cli release` 会读这个字段并传 `--registry` + `--access`。

### Added（R-86：「声明配了却 0 命中」补到方案面 + D24 的落点守卫）

- **R-86**：`declaration-no-match` 这条自述原来只盖 `structure.*`（M1 / R-77）—— 方案面的声明写错一个字母
  是**零覆盖且报告还写着"生效的适配器"**。实测（三处写错的声明）修前一声不吭；现在会点名：
  `callSites[flag].apis 的调用名 isEnableX · env-reads.apis 的读取根 import.meta.envX · analytics.apis 的调用名 trackX…`。
  覆盖：`callSites`（组名 + apis + in）· `envReads`（apis 走 `reads` 判 + in）· `analytics`（apis + eventSource）·
  `router.pathSource` · `dataLayer.queryKeyFrom` / `fetchIn` / `fetchApis` · `designSystem.numberHomes`（名字 + 家）。
  清单类用**最宽松的匹配**（整名 / 前缀 / 后缀）判"有没有命中"：它都命中不了，那条声明必定是空的 —— 宁少报不误伤。
- **D24 补上落点守卫**（与 D22 / D23 同形）：`eventSource` 路径拼错时，以前会拿整个项目的事件名去刷屏，
  现在只报一条全局"声明的唯一出处不存在，这一轮没判"。
- 需求 R-86 落盘、R-77 的措辞对齐（"结构声明"→"声明"）；N-10 / N-11 / N-12 登记（flag 名 · `.env` 对账 · TS 里的颜色）——
  三条**判据不稳**的候选按"不稳就不要"的原则判不做，并在 `D01` 的注释里把"TS 里的颜色留给 D16 那一族"这句**作废**
  （D16 是路径级的、不看字面量）。

### Changed（需求口径：a11y 判不做 —— N-09）

- **JSX 可访问性形态**（`<div onClick>` 可点不可聚焦 / 缺 `alt` / 缺 `aria-label` / 正数 `tabIndex` / `role` 乱用）**判不做**：
  单文件语法形态（L2）、零项目专有数据，交给宿主自装 `eslint-plugin-jsx-a11y` —— 与 H01–H05 同类，
  生态有开箱即用的等价物，重写只会重复。登记在 REQUIREMENTS 第八节 **N-09**，DESIGN §5.6「门禁不做的事」同步写清边界：
  本体只碰可判定的那一半（**D07 对比度基线** + **C01** 里 `alt` / `aria-label` 的**文案**必须走 `t()`）。
- 顺带消掉**唯一一处影子状态**：这条结论（挖掘需求时的 M8）以前只在对话里，需求表 / §4.9 委派表 / 委派评审
  三处都查不到 —— 下次再问"无障碍管不管"还得重推一遍。

### Added（0.4.0 收官：D15 内联样式 · D20 数字有家 · D19 重复数值）

- 需求 R-83 / R-84 / R-85 落盘 —— 三条都是"**设计里写了、代码里没有**"的旧账（DESIGN §5.2 早有行，
  `coreRules` 里查不到），0.4.0 一次补齐。
- **D15 内联样式纪律**（error，`designSystem.styleDir` 声明才判）：JSX `style={{}}` 与 CSS 走**同一套刻度** ——
  颜色属性里出现颜色字面量就报；长度 / 层级 / 时长按 `valueWhitelists` 判（无单位数字按 React 语义补 `px` / `ms`，
  `lineHeight: 1.5` 与 `0` 放过）。**实测修前** `<div style={{ color: '#ff5a1f', margin: 13, zIndex: 9999 }}>`
  在 D 域**零命中** —— 同一条红线换个写法就绕过整套令牌。
- **D20 策略 / 阈值数字必须有家**（error，`designSystem({ numberHomes })` 声明才判）：
  `staleTime: 300_000` / `PAGE_SIZE = 20` 散在各处、改口径要全仓搜；声明"这些名字的数字该在哪个文件"后，
  家外的数字字面量就报（引用常量不报）。
- **D19 同一 `(属性, 数值)` 跨 ≥3 个非令牌文件重复**（warn，**L3**）：事实上已经定下来的口径却没有名字；
  判据词汇复用数值三族（D12–D14）的属性，所以 `display: flex` 这类枚举值重复不误报；
  令牌文件 / `var()` 引用 / 颜色（D03 管）/ 刻度内的值都不提示。
- 事实模型新增 **`styleProps`**（JSX `style` 里的**字面量**属性）与 **`numbers`**（有名字的数字字面量）：
  `FACTS_CACHE_SPEC` 5 → **6**。`numericTokens` / `whitelistOf` 提到 `design-shared`（D12–D15 共用一份刻度）。
- 规则 95 → **98**；夹具 75 → **78**（新增 `inline-style` / `number-homes` / `repeated-values`）；
  D 域 22 → **25 条全部落地**，DESIGN §14「已知缺口」的 D 域一行随之收口（D 域不再有未实现项）。

### Added（用法唯一来源：`docs/USAGE.md`）

- 新增 [`docs/USAGE.md`](./docs/USAGE.md) 作为**使用说明唯一来源**（`README.md` 的文档地图登记归属）：
  安装与导入面 · `arch.config.mjs` 全字段（含 `include` / `ignore` / `exceptions` / `addRoles` 三个通道的区别）·
  预设清单与参数（范式 / 域 / 方案面 / kit 工厂）· **「声明 → 打开哪条规则」权威表**（照 `requires` 排）·
  命令参考与常用组合 · 退出码与 `ok` 的分工 · JSON 报告怎么消费 · scope 安全语义 · 缓存与速度 ·
  接进 CI 与 pre-commit · 常见任务 · 症状→原因→怎么办的排查表 · 文档分工。
- `README.md` 里重复的操作细节收进 USAGE，只留最短可用的一份 + 指针（「同一件事只有一处」）。
- **顺手修掉一个真会让人踩空的错**：包名是 `@arch-guard/core`（`arch-guard` 只是 bin 名），
  而 `README.md` / `docs/DESIGN.md` / `src/index.ts` 的示例写的是 `arch-guard/presets` ——
  照抄的人第一步就 `Cannot find module`；现已统一，并加元门禁：
  **用法文档里的包名必须等于 `package.json` 的 `name`**（故意改错 → 变红 → 字节级还原验证过）。

### Fixed（0.4.0「收回本体」那一批的收尾：等级与口径）

- **8 条规则的判定等级写错，已改对**：`H08`（硬编码本机 / 内网地址）· `D01` · `D02` · `D09` · `D12` · `D13` · `D14` · `D18` ——
  代码里是 `L1`（路径级），DESIGN 一直写 `L2`（要读单文件字面量 / CSS），同文件的兄弟规则（H06 / H07 / H09）也都是 `L2`。
  **行为变化**：`--min-level L1`（"只跑路径级规则"的快速档）以前会顺带把这 8 条跑掉，现在不跑了 ——
  确实要跑它们就用 `--min-level L2`。判据本身没动，动的只是分类。
- **需求侧口径补上**：`R-14` / `R-15` / `R-32` / `R-33` / `R-34` / `R-35` / `R-36` 的「期望」还写着
  "交给 eslint / stylelint；本体不做"，而 0.4.0 早已收回本体 —— 状态与期望自相矛盾（R-15 里还留着"假异步/随机待做"）。
  现已按实现改写，并显式写出**不判**的部分（外部地址、裸 `setTimeout`、裸 `Math.random`）。
- **DESIGN 的三处描述比实现更宽，已改准**：`H07` 不判裸 `Math.random`（判不了 → 登记为 `N-08`）；
  `H08` 不判外部链接，也没有"除 `shared/config/env.ts`"这种写死的宿主路径豁免（那是宿主侧规则级 `exceptions` 的事，
  本体写死宿主路径会被 portability 检查拦下）；`H09` 按**命名**判，不是"字面量"。
- **`DESIGN §5` 的「已实现并带夹具的 95 条」清单少了一整批**（C01 · D01 · D02 · D09 · D12–D14 · D18 · H07–H09 · H13 · S43 · S44 · D24）：
  条数对得上、逐条对不上 —— 于是"设计已落盘"是假象。现已与 `coreRules` 逐条对齐；`§14` 的 D 域同样从"14 条已落地"改成实际。
- **三道元门禁**（`tests/process.test.mjs`）：① 标「已完成 · 本体」的需求，期望里不许再写"交给… / 本体不做"；
  ② DESIGN §5 的已实现清单必须逐条等于 `coreRules`；③ DESIGN 写成单一等级的规则，等级必须等于注册表。
  三条都做过"故意改错 → 必须变红 → 字节级还原"的验证。
- **宿主侧出口写清**（`PARADIGM.md` §7.1「本地调试不就是要写 localhost 吗」）：地址**首选进环境变量**；
  dev-only 形态（Storybook 故事 / dev-only 模块）登记成非生产角色即可放行 —— 用 **`addRoles`（追加）**，
  不是 `overrides.roles`（那是**整体替换**角色表，实测会把范式角色全删掉，只剩 S01"未命中任何角色"）；
  确实要留的本地兜底值（唯一的地址出处）走规则级 `exceptions`，每次运行点名、可设 `expires`。
  H08 判据本身**不放宽**（写 `localhost` 是常态，但地址的家是环境变量），R-15 按这个口径改写。
- **需求账本上一处过期数字**：`REQUIREMENTS.md` 的小结写着「已完成 61 · 已委派 4 · 不做 6」（实际 70 · 4 · 6 = 80），
  而第七节标题还叫「待做」——它下面 20 条全是已完成 / 判不做，**开着的确实是 0 条**。小结移到节首并改对，
  标题改为「后补的需求」；同时加第 10 道元门禁：**小结的数字必须等于实际条目数**（故意改回 61 → 变红 → 字节级还原）。

### Added（M3：环境变量 / 开关读取落点 —— S44）

- 场景：`import.meta.env.VITE_API_BASE` 在十几个文件里直接读 —— 改名 / 换环境全仓搜，
  而且读到的是**原始字符串**（没有默认值、没有校验、没有类型）。
- `envReads({ apis: ['import.meta.env', 'process.env'], in: ['src/shared/config/**'] })` 声明后：
  落点外的读取报；配置模块里读、测试文件都不报。
- 事实模型新增 **`reads`**（环境相关的成员访问链；根名单放 `src/data/env-roots.ts`，引擎里不出现平台字面量），
  `FACTS_CACHE_SPEC` 4 → **5**。
- 新面 `env-reads`；规则 94 → **95**；夹具 74 → **75**；需求 R-79 落盘（M 批到此全部完成）。

### Added（M6：C01 第三种形态 —— 对象实参里的文案）

- 缺口：`notification.open({ message: '保存' })` 这种**对象实参**形态看不见 —— `facts.calls.stringArg`
  只记第一个字符串字面量实参。同一痛点换个写法就绕过去了。
- 修法：事实模型给字符串加 **`inCall`**（最近的**外层调用名**，只透传容器、遇函数体断开）——
  `FACTS_CACHE_SPEC` 3 → **4**（事实形状变了）。C01 据此判对象实参形态。
- **防误伤**：还要 `copy({ messageProps: ['message', 'description'] })` 声明**哪些属性名算文案**
  —— 同一批调用里 `key` / `duration` 这类不是文案；**不声明就不判对象形态**。
- 夹具 `bare-copy` 两种形态都报；新增 `tests/copy-bare.test.mjs`（三形态 + `key` 不报 + 未声明 `messageProps` 不判）。
- 需求 R-82 落盘；测试 341 → **343**。

### Added（M5：生成物必须带 @generated 标记 —— H13）

- 场景：生成的类型 / 客户端文件没有标记，有人顺手改了它，下次重生成被覆盖 —— 手写逻辑静默消失。
- 现在：`structure.generated: ['src/shared/api/generated/**']` 声明后，这些文件必须在注释里带
  `@generated`；没有就报（error）。其余文件不判。声明的 0 命中由 M1 的 `declaration-no-match` 自述。
- 这是 DESIGN §14 里 **R6**（"有 exceptions，但没有生成代码必须带标记的可证伪要求"）的落地，R6 行改成已解决。
- 规则 93 → **94**；夹具 73 → **74**；需求 R-81 落盘。
- **诚实记一笔过程**：夹具第一次跑了 0 发现 —— 不是规则错，是我在违规文件的注释里写了
  "// 违规：没有 @generated 标记"，**那句注释本身就命中了标记**；改掉注释就报出来了。

### Added（M4：令牌分层 D02 + D18 —— 设计里躺了很久的两条）

- **D02 色板只放静态令牌**：色板里混进语义名（`--sh-brand: #ff5a1f`）时，那个"语义令牌"**不会随主题变**
  （明暗切换那处不动，排查半天）。
- **D18 组件样式只消费语义令牌**：`color: var(--sh-static-gray-3)` 写进组件 → 换主题 / 换品牌色时不跟随。
- 两条都由 `designSystem({ staticPrefix: '--sh-static-' })` 驱动：**不声明就不判**（前缀是项目的事实，
  `--sh-` 只是某个宿主的前缀，不该做通用默认）。这是 DESIGN §16 里那句"参数没有消费者"的正面答案：
  现在有消费者了，参数由项目声明。
- 规则 91 → **93**；夹具 72 → **73**（`token-layers`，两条各一正一反）。
- 需求 R-80 落盘；DESIGN §5.3 两行标"已实现"、§16 的陈旧说明改写成"前缀由项目声明"。

### Changed（REQUIREMENTS：委派出去的条目归到一节）

- 4 条 `已委派`（R-10 `any` / R-11 console / R-12 TODO / R-13 吞异常）原来散在「一、每天都会踩的」里，
  现在归到新的一节 **「六、委派出去的（本体不做，交给生态）」**：一节看清"外包了什么、为什么不必自己做
  （开箱即用或一行配置）、以及本工具不判'跑没跑'"。
- 章节号顺延（待做 → 七、不做 → 八），DESIGN / README 里的节号引用同步。
- **顺手修一处缺陷**：REQUIREMENTS 的「**五、治理**」标题早先在某次改文档时被吃掉了（章节序列是
  一/二/三/四/六/七），已补回。

### Added（M2：埋点事件名只有一个出处 —— D24）

- 场景：`track('crews_view')` 的事件名在各处手拼 —— 改名漏一处就是**数据断层**，而分析平台不会报错
  （只会安静地少收一个事件）。与缓存键（D22）、路由路径（D23）同族。
- `analytics({ apis: ['track'], eventSource: 'src/shared/lib/analytics/events.ts' })` 声明后：
  把事件名字符串直接传给声明的埋点调用就报；传常量（`track(EVENTS.crewsView)`）不报。
- 新面 `analytics`（由预设登记，字段 `apis` / `eventSource`）；规则 90 → **91**；夹具 71 → **72**。
- **已知边界**：只看第一个字符串实参 —— `gtag('event', 'crews_view')` 这类多参数 API 要包一层单参数
  wrapper 再声明（清单是项目责任）。

### Added（M1：声明配了却 0 命中 —— 报告自述）

- 场景：`structure.migrating: ['src/legacy/**']` 写得没错，可项目里那个目录早就没了；`clientState.in` /
  `authRedirects.in` / 某个组维度同理 —— **门禁显示"通过"，那条纪律这次什么都没看**。
- 现在：报告里新增自述 `declaration-no-match`（新 notice code，**兼容性新增**：不 bump `apiVersion`，
  但按 §6.9 的规矩在这里标注）："有 N 条结构声明 0 命中（…）"，点名是哪几条。
- 与 R-75（配置期可命中性）互补：那条管"维度名 / 角色 id / glob 写得对不对"，
  这条管**运行期**（角色表里有这个维度，但没有任何文件命中它）。
- 需求 R-77；顺手修掉 DESIGN §14 里"**C01 委派给 eslint-plugin-i18next**"这处陈旧口径（C01 已收回本体）。

### Added（新③：组件库调用里的文案 —— C01 的另一半）

- 缺口：C01 判了 JSX 文本与面向用户的属性，但 `message.success('保存')` 这类**组件库调用里的文案**漏着 ——
  同一个痛点（这句永远翻译不了），只判 JSX 会让人以为"文案都管住了"。
- 现在：`copy({ messageApis: ['message.success', 'notification.open'] })` 声明后，这些调用的字符串实参
  也按"人话"判（中文 / 多词），不是 `t(...)` 就报（warn）；**不声明就不判这一半**（各项目用的库与封装不同）。
- 夹具 `bare-copy` 加一例（`lib/notify.ts` 里的 `message.success('保存成功')`）。
- **已知边界**：对象实参形态（`notification.open({ message: '保存' })`）还看不见 —— `facts.calls.stringArg`
  只记第一个字符串字面量实参，这半边要等事实模型再补。
- 需求 R-76 落盘。

### Added（新②：声明可命中性校验补齐）

- 缺口：`structure.nameCollisions[].vocabularyRoles` 的角色没校验；**声明了 `publicApi` / `segmentedGroups`
  却没有 `entry: true` 角色**时那条声明永远不命中（正是这轮 C10 / `entry` 那类问题在**声明侧**的同类）；
  `degreeLimits[].role` 同样兜底。
- 现在这些在解析配置时就报错并列出可用值/原因 —— 与"规则没跑要明说"（R-25）同源，只是发生在声明这一侧。
- 需求 R-75 落盘；`tests/structure-declarations.test.mjs` 补两例。

### Added（新①：范式预设的结构词汇必须完整 —— 元门禁）

- 起因：2026-09-25 实测发现 **6 条已实现的规则**因为两行数据缺失（`canonical()` 的角色没声明
  `group: 'domain'`、`routes.tsx` 没标 `entry: true`）**在前端应用里从来没跑过** ——
  规则、声明、夹具都齐，**范式预设这条路却是断的**，而门禁显示"通过"。
- 新门禁 `tests/paradigm-coverage.test.mjs`：把"每个范式预设必须提供哪些结构词汇"写成显式期望表
  （canonical → `domain` + entry；fsd → `slice` + entry；library → 都没有，靠"声明才判"而非数据），
  删掉 `group` / `entry` 就红。
- 需求 R-74 落盘；ARCHITECTURE §7 的元门禁表补一行。

### Fixed（委派口径的两处撞名与漂移）

- 我自己在 REQUIREMENTS 里写过"不再另开一份委派清单"，而 DESIGN §4.9 就叫「委派清单」—— 两处撞名、
  内容部分重叠，于是**必然漂移**（这次收回本体的 5 类还挂在 DESIGN 表里写着"已委派"）。
- 修法：**DESIGN §4.9 改名「委派去向（设计映射：约束 → 规则 → 生态）」**并写明它不是需求表
  （需求侧的状态在 REQUIREMENTS 每条的「状态」/「交给谁」列；这里记的是含规则 id 与生态规则名的设计映射）；
  REQUIREMENTS 的那句说明改成准确表述；
- 新增门禁：**§4.9 里"仍委派"的行数必须等于 REQUIREMENTS 里 `已委派` 的条数**
  （划线 = 已收回；S08 / S15 / S16 / H02 / 已移除 单独排除）—— 这类漂移再也不会静默发生。

### Fixed（文档漂移：DESIGN §4.9 委派表还挂着已收回的项）

- 这轮收回本体的 H07–H09 / D01 / D09 / D12–D14 / C01 在 §4.9 的表里还写着"已委派" —— 已划线并注明收回理由；
  S08 / S15 / S16 补上"本体本来就判，生态只是补充"；H02 标注"既没实现也委派不出去（R-70 已判不做）"。
- 表后写明**当前仍委派的只有 4 类**（H01 / H03 / H04 / H05），与 REQUIREMENTS 的「已委派 4」对得上。

### Changed（需求口径：四条待定/需定口味全部判不做）

用户决定 R-49 / R-50 / R-52 / R-53 都不做：

- **R-49 公开面破坏性变更（库）**：本期只做前端应用；要做也得先划清与"不提供存量豁免"的界限。
- **R-50 monorepo 跨包**：另一个量级的工程（逐包跑 + 汇总 + 统一退出码），规格留档在 `.scratch/pnpm-workspace/`。
- **R-52 TypeScript 严格度**：`tsconfig` 开关是项目选择，不是门禁要钉的红线（本仓自己开着 strict / noUnusedLocals）。
- **R-53 聚焦测试残留**：交给宿主 eslint 测试插件（`no-focused-tests` 之类），本工具不重复实现。

**需求清单至此全部定案**：已完成 61 · 已委派 4 · 不做 6（R-04 / R-49 / R-50 / R-51 / R-52 / R-53）· 已撤 2（R-30 / R-70）。
连带口径：DELEGATION-REVIEW 里指向 R-52 的那句、`.scratch/pnpm-workspace/spec.md` 的场景行。

### Fixed（C 收尾：canonical 的域入口补 `entry: true`，S23 在应用范式下生效）

- 与 C10 同源的**第二个数据缺口**：S23（公开面）靠角色描述符上的 `entry: true` 认入口，而 `canonical()`
  的 `module:routes` 没标 —— 于是"跨域绕过公开面直连内部文件"在应用范式下**从来没被判过**。
- 修法：`canonical()` 的 `routes.{ts,tsx}` 标 `entry: true`（S03 的题目就是"域根目录只许域的公开面入口"，
  routes 正是那个入口）。
- 新夹具 `canonical-public-api`：`publicApi: ['domain']` 下，跨域直接引用 `views/CrewsPage.tsx` 报；
  经 `crews/routes`（入口）引用不报。夹具 70 → **71**。
- **顺带核清一件事**：同一夹具里 `groupInDegree`（S28 外部引用下限）把"已经合规经入口被引用的域"
  也报成"没有任何外部引用" —— 查 S28 的判据后确认**不是 bug**：它**只数跨层引用**，
  而 canonical 的域都在第 10 层（同层引用不计）。所以 **S28 在应用范式下天然无事可判**
  （它是为 FSD 那种"切片分布在不同层"的规范准备的），夹具因此只钉 S23。

### Added（D2：宿主侧 ARCHITECTURE.md 模板）

- DESIGN §1 一直写着"项目实例 = `arch.config.mjs`（填表）+ `ARCHITECTURE.md`（说明），每个仓库一份约 60 行"，
  但从来没有模板。新增 `docs/templates/ARCHITECTURE.md`：带 8 个可渲染块
  （layout / roles / thresholds / deps / scan-scope / params / exceptions），抄到仓库根即可；
  人读文档与机读配置同源由 `--render-docs` / `--check-docs` 保证。

### Added（审计口径：收回本体的 12 条归位）

- `docs/ECOSYSTEM-AUDIT.md` 新增 §6：把 0.4.0 收回本体的 12 条按"真独有 / 生态有但装了还得配 / 仍委派"
  三类归位，并写明理由（配置成本高而我们事实本来就有）。

### Fixed（C10 的覆盖补齐：canonical 侧也钉住组维度规则）

- C10 让 `canonical()` 的域成为组维度（`group: 'domain'`），但当时只有 `group-dimension` 一条夹具
  证明 S32 生效；**S22 组隔离 / S23 公开面 / S26 组数量 / S28 外部引用下限** 在 canonical 下仍无夹具。
- 新夹具 `canonical-groups`：声明 `isolate: ['domain']` 与 `groupCountLimits: [{ dimension: 'domain', max: 2 }]` 后，
  跨域直连（S22）与"第 10 层 3 个域超上限"（S26）都报 —— 证明这条路径真的在跑。
- 夹具 69 → **70**。

### Fixed（C01 补齐：JSX 文本节点进事实模型）

- C01 原来只判面向用户的**属性**（`title="保存"`），JSX **文本节点**（`<button>保存</button>` 里那半）
  看不见 —— 而它是"裸文案"场景的主体。
- 修法：`facts` 收 `JSXText`（`context: 'jsx'`，纯空白跳过）→ C01 两侧都判。
  **事实形状变了，`FACTS_CACHE_SPEC` 2 → 3**（旧缓存整体作废，不会读到旧结果）。

### Changed（需求口径：R-51 判不做）

- **R-51「委派出去的检查没人验证」判不做**（用户决定）：委派出去的那些检查（eslint / stylelint / knip…）
  **由宿主自负**，本工具不提供"跑了没跑"的判定。
- 连带更新口径四处：DESIGN §4.9、ARCHITECTURE §9、`docs/DELEGATION-REVIEW.md`（G3 一栏改为"本工具不判"）、
  以及"越需要逐项目声明的约束越不该委派"这条结论 —— **能自己判的，就别指望宿主配**。

### Added（C8：裸文案收回本体 —— 委派清单最后一项）

- **场景**：`<button title="保存">保存</button>` —— 写死在 JSX 里的文案永远翻译不了，上线才发现界面冒中文。
- **现在**：声明了 i18n（`copy()` + `i18n(...)`）的项目里，**面向用户的属性**
  （`title` / `placeholder` / `alt` / `aria-label` / `label`）上出现"人话"而它不在 `t(...)` 里就报（warn）。
  走过 `t('key')` 的、URL / 类名 / 单 token 全部放过。
- 原先委派给 `eslint-plugin-i18next` 的 `no-literal-string`（要装插件 + 逐条维护 ignore 白名单），
  而"这句走没走 `t()`"我们本来就从 `facts.calls[].stringArg` 知道。
- **已知边界**：JSX **文本节点**（`<button>保存</button>` 里的那半）还没进事实模型 ——
  `facts.strings` 收的是字符串字面量；这条记在 spec 的已知缺口里，下一版补。
- 规则 89 → **90**；夹具 68 → **69**。委派候选集（C1–C10）至此**全部落地**。

### Added（C6：CSS 数值三族收回本体）

- **场景**：间距 / 层级 / 时长各写各的数（`margin: 13px`、`z-index: 9999`、`transition-duration: 200ms`）——
  间距刻度、层级刻度、动效节奏都无从统一。
- **现在**：`designSystem({ valueWhitelists: [{ rule: 'D12', allow: [...] }, …] })` 声明哪一族就判哪一族
  （D12 长度 / D13 层级 / D14 时长），不在刻度里的数值报；`0` 永远放行。
- 原先委派给 stylelint `declaration-property-value-allowed-list` —— 那段要**逐属性列白名单**（几十行），
  是委派清单里配置成本最高的一条。族的属性形态放 `src/data/css-value-families.ts`（纯数据）。
- 规则 86 → **89**；夹具 67 → **68**。

### Added（C7 收尾：假异步与假数据收回本体）

- **H07 疑似假异步**（warn）：文件里 `new Promise` 与 `setTimeout` 同时出现 —— 用睡眠冒充异步。
  刻意**不判裸 `setTimeout`**（防抖 / 轮询是正当用法），两证据同时成立才提示。
- **H09 假数据不该进生产路径**（warn）：`mock` / `fake` / `dummy` / `fixtures` 命名的文件或导出
  出现在非测试代码里（只按命名判 —— 数据长什么样我们看不出来，但"叫 mock 的东西不该在生产路径"是确定的）。
- 两条原先委派给 eslint `no-restricted-syntax`（要项目自己写 esquery 选择器）。规则 84 → **86**；夹具 66 → **67**。

### Added（C7 第一半：硬编码本地地址收回本体）

- **场景**：`const api = 'http://localhost:3000/api'` 写进源码 → 跟着构建进生产。
- **现在**：**本机 / 内网 IP** 地址字面量出现在非测试文件里就报（H08）。外部文档链接不算，
  测试文件里的 `localhost` 是 mock 服务的正常用法。
- 原先委派给 eslint `no-restricted-syntax`（要项目自己写 esquery 选择器）；
  这一段里"本地地址"是误伤最小的一类，所以先收回它。C7 的另外两半（假异步、随机/假数据）待做。
- 规则 83 → **84**；夹具 65 → **66**。

### Added（C4：颜色字面量只在色板收回本体）

- **场景**：同一套设计里出现三种近似色（`#ff5a1f` / `#ff5b20` / `rgba(255,90,31,.9)`）—— 换品牌色要全仓搜。
- **现在**：样式里出现颜色字面量且文件既不是**色板**也不在**令牌目录**里就报。
  原先委派给 stylelint `color-no-hex` + `overrides`（那段 overrides 要项目逐条写白名单），
  而色板与令牌目录是我们已经知道的 params。
- 规则 82 → **83**；夹具 64 → **65**。

### Added（C5：禁 !important 收回本体）

- **场景**：自家组件样式里 `color: blue !important` —— 一旦开了头，后面的人只能加更强的 `!important`。
- **现在**：样式里出现 `!important` 且文件不在**声明的 vendor 目录**里就报（vendor 是"覆盖第三方"的正当出口）。
  原先委派给 stylelint `declaration-no-important`（要项目自己开那条规则）。
- 规则 81 → **82**；夹具 63 → **64**。

### Added（C9：禁相对越级收回本体）

- **场景**：`import { format } from '../../../shared/lib/format'` —— 一串 `../` 爬到目录边界之外后，
  **看不出这条依赖跨没跨界**（同层？跨域？跨层？）；目录一挪全崩。
- **现在**：声明 `structure.maxRelativeUp: { max: 1 }` 后，爬过上限就报（不声明不判）。
  原先委派给 eslint `no-restricted-imports` —— 那段 patterns 要项目自己写，"几层算越级"还因项目而异。
- 与 S32 互补：S32 管"跨组必须走别名"，这条管"同组内也别爬太深"。规则 80 → **81**；夹具 62 → **63**。

### Added（C1 / C2：幽灵依赖与声明未用收回本体）

- **P03 幽灵依赖**（error）：`import` 了没写进 `package.json` 的包 —— 本地靠间接依赖碰巧能跑，换机器 / CI 就崩。
  报在**引用它的那一行**。原先委派给 eslint-plugin-import（要装插件 + 写 resolver 配置；
  **本仓就没装**，等于零覆盖）。
- **P08 声明但未使用**（warn，**声明才判**）：`dependencies` 里躺着全项目零引用的库，报在 `package.json` 上；`deps({ unusedDeps: true })` 才打开。
  默认关的理由：只按"有没有 import"判会把**自动 JSX 运行时**（`react` 声明了但没人 import）、副作用型依赖（polyfill / normalize.css）与只在构建配置里用的包全报成未使用 ——
  判准需要 entry / 插件知识（knip 靠的就是这个），按"宁可漏报不可误伤"默认不判。这一点是写这条规则、用本仓夹具验证时才暴露的。
  原先委派给 knip / depcheck —— 而 **tsc 与 eslint 都不知道 `package.json`**
  （`noUnusedLocals` / `no-unused-vars` 看文件内声明，`no-extraneous-dependencies` 是反方向）。
- 两条由 `deps()` 预设默认启用；事实 `ctx.deps.phantom` / `unused` **早就算好了**（`--verify-deps` 一直在用），
  所以这次是"补上判据"，不是"加一层扫描"。
- 规则 78 → **80**；夹具 60 → **62**。

### Fixed（C10：组维度规则在应用范式下集体沉默）

- 现象：S22 组隔离 / S23 公开面 / S26 组数量 / S28 外部引用下限 / S32 导入局部性 五条已实现的规则
  都按 `record.groupName`（角色**显式声明**的 `group`）判定，而 `canonical()` 的角色一个都没声明 ——
  于是**在前端应用这个主场景里，声明了也没用**（只有 `fsd()` 声明了 `group: 'slice'`）。
- 修法（**改数据，不改引擎**）：`canonical()` 的七个域槽位角色补 `group: 'domain'` —— 域本来就是它的组维度。
- 证据：新夹具 `group-dimension`（canonical + `importLocality: ['domain']`）里跨域用相对路径被 S32 报出，
  跨域走别名 / 同域内相对都不报；单测钉住"域角色必须声明 `group: 'domain'`"。
- 夹具 59 → **60**。

- **C3 排除**（用户质疑"c3 ts 就会报错啊"）：实测 TS/TSX 写错路径 tsc 必报 TS2307（退出码非零），
  `.js` 不在 `allowJs` 程序内那一小块由构建兜，且原实现射程与 tsc 重合 → **不收**，R-04「不做（委派）」不变。

### Added（委派评审：委出去的 12 条，宿主到底会不会开）

- 起因：用户问"哪些委派出去了用户开启可能性大？开启可能性小的我们自己支持也不是不行"。
- 产出 `docs/DELEGATION-REVIEW.md`：按**开启成本**三档（开箱即用 / 一行配置 / 要写自定义配置）给 12 条委派
  打分，并逐条给出"漏掉的代价 + 本体兜底成本 + 建议"。三条观察：
  ① A 档只有 2 条，C 档（要写自定义配置）有 6 条 —— 而 C 档正是最需要、最容易漏的那类；
  ② **越需要逐项目声明的约束，越不该委派**（"配置成本"恰好是本体的强项）；
  ③ P03/P08（幽灵依赖 / 声明未用）的事实**早就读进来了**（`--verify-deps` 在用）却没人判 —— 最明显的缺口。
- 建议把 §4.9 的判据从两条扩到三条（+ 宿主不写自定义配置就能生效 + 本体没有现成事实可直接判定）。
- 建议动作（等点头）：A 收回 P03/P08 · B 样式三条兜底（D01/D09/D12–D14）· C 形态型兜底（H07–H09）·
  D 顺手收回 S10 或 H04；并配套 R-51（委派落地自检）。
- **修订**（用户质疑"声明未用 ts / eslint 都大概率开启吧"）：把依赖那行**拆成两条** ——
  **文件内**未用声明（局部变量 / 导入）确实大概率开着（tsc `noUnusedLocals` +
  `@typescript-eslint/no-unused-vars`，本仓两者都开），那一类不在委派清单里；
  **依赖层面**：P03 幽灵依赖有 `no-extraneous-dependencies` 可顶（**中高**，但要装 eslint-plugin-import
  且显式开 —— 本仓就没装），P08 声明未用**没有**主流规则覆盖（只有 knip / depcheck）→ 仍是最值的一条。
  结论（P03 / P08 都建议收回）不变，理由更准。

### Changed（需求口径：撤掉两条）

- **撤掉 R-70「抑制注释报出」**（`eslint-disable` / `@ts-ignore`）：`@ts-ignore` 那一半靠 TS 的严格开关与
  review 兜；专门做一条"禁止 suppression"会与"规则级例外必须写理由"重复表达同一件事。
- **撤掉 R-30「复杂度 / 嵌套深度 / 参数个数」**：交给宿主自己的 eslint（`complexity` / `max-depth` /
  `max-params`）—— 它本来就只是"把三条 eslint 规则写进委派清单"，不如直接写进宿主配置。
- 编号**不复用、不重排**：两个编号登记在 REQUIREMENTS 第七节（写成「原 R-30」/「原 R-70」），
  正文不再出现；`tests/process.test.mjs` 新增校验"缺的编号必须被声明为已撤"，否则算漏号。

### Added（状态纪律 · 权限判断 · 跳转守卫 —— 同一套"形态 + 落点"）

三条原本都属"需定口味"，拍板原则：**能判"落在哪"，就不判"写得好不好"**；形态清单一律由项目提供。

- **R-45 状态纪律（S41）**：`stores/crews.ts` 导出 `useCrewsStore` 合规，另一个域把 `useOrdersStore`
  写在 `hooks/` 里就报（`structure.clientState: [{ naming: 'use*Store', in: [...] }]`）。
  **按命名 + 落点判，不按 import 的库**（那会把库名写进引擎）。只单向判：落点里放别的不管。
- **R-46 权限判断（复用 S38，不新立规则）**：把**原始权限形态**列进 `callSites([{ name: '权限判断',
apis: ['permissions.includes'], in: ['src/shared/auth/**'] }])` —— 落点外报，而
  **高层 API（`can('x')`）不在清单里 → 到哪都合法**（这就是"哪些算合法展示判断"的答案）。
- **R-47 跳转守卫（S42）**：`navigate('/login')` 与 `<Navigate to="/login" />` 只许出现在
  `structure.authRedirects.in` 里。**不数"重复了几遍"**（语义比对必然误伤），只判这个动作落在哪。
- 规则 76 → **78**（S41 / S42，R-46 用现有能力表达）；夹具 56 → **59**。

### Added（指纹表可被项目覆盖 —— 收紧与放宽都行）

- **场景 ①：企业规范只认公司内部那套实现**，或项目把 `JSON.parse(JSON.stringify(x))` 收进
  `shared/lib/clone.ts` 当唯一深拷贝出口 —— 内置指纹表改不了，只能全仓改写法或干脆关掉 P06 / P07。
- **场景 ②：内部自研库其实很成熟**（`@org/utils` 里有 `formatDate`），却被"疑似自造轮子"提示，
  没法声明"这是我们认可的实现"。
- **现在支持**：`deps({ capabilities, fingerprints: [{ capability, addSyntax / removeSyntax /
addSoftSyntax / removeSoftSyntax / apiNames / allowOwn / platform / hint }] })` ——
  判定跟着**生效表**走（P06 / P07 都不再直接读内置表）。**首选方案仍只来自 `capabilities`**
  （一个事实一个出处）。能力名拼错、pattern 写不成正则 → **配置阶段直接报错**，不留"配了但不生效"。
- 夹具 `fingerprint-override`：项目删掉 JSON 深拷贝那条形态后 `clone.ts` 不再报，
  而手搓日期格式化照旧报。夹具 55 → **56**。

### Added（两条边界门禁：上帝域 · 迁移只出不进）

- **场景 ①：三个域都在 import `crews` 的组件** —— 改 `crews` 一个 props 得同时改三个域；
  S34 只看**单个文件**被几十处引用，看不见「整个域被一半的域依赖」。
  **现在拦住**：`structure.couplingLimits` 声明维度与上限（`maxFanIn` / `maxFanOut`）后，
  超过就报，点位落在**参与度最高的那个文件**上，报告点名"被哪些组依赖"。
- **场景 ②：`src/legacy/**` 待迁走，新代码却 `import { oldPrice } from '@/legacy/pricing'`** ——
  legacy 从"待清理"变成"事实核心"，迁移永远做不完。**现在拦住**：`structure.migrating`
  声明迁移中的路径后，外面引用它们即报；它们自己引用新代码不报（**只出不进**）。
- 两条都是**声明才判**：阈值与路径全在宿主手里，没声明就明列停用；测试角色（layer ≥ 90）不参与耦合计数。
- 规则 74 → **76**（S39 / S40）；夹具 53 → **55**（`coupling-limits` / `migration-boundary`）。

### Changed（**移除 S33 导入必须解析得到** —— 交回生态）

- **破坏性（对规则集）**：`S33` 不再存在。宿主若在 `enable` 里写了它，报告会提示
  「配置里启用了不存在的规则：S33」—— 删掉那一项即可。规则数 75 → **74**。
- 理由：`import/no-unresolved` 是更成熟的等价物，宿主本来就有 eslint；"路径写错"是编辑器与编译器就先喊的错，
  不值得占目录契约的一条红线。**引擎事实 `graph.unresolved` 保留**（依赖图要用它），
  受影响的门禁行为：解析不到的说明符仍然不会形成图上的边（所以图规则的语义不变）。
- 移除的东西：规则实现、`library()` 的 enable 项、专用夹具 `__fixtures__/unresolved/`、
  `violations` 夹具与 `guard` 测试里的期望；口径同步 DESIGN §4.9 / §5、ARCHITECTURE、REQUIREMENTS（R-04 → 不做）。

_（暂无：下一个版本的内容往这里加）_

### Added（调用落点：副作用 · 配置对象 —— 一组一类地声明）

- **场景 ①：`gtag()` / `Sentry.captureException()` / `localStorage.getItem('token')` 散在各域** ——
  "没同意隐私协议就别上报"没地方统一、token 要加密时全仓找、换埋点 SDK 要翻遍页面。
- **场景 ②：某个域自己 `new QueryClient()` / `createTheme()`** —— 运行时两个缓存实例，
  `invalidateQueries` 莫名不生效、主题不统一，查一下午。
- **现在拦住**：`callSites([{ name, apis, in }])` 一组一类地声明"哪些调用 + 只许出现在哪"，
  落点外的调用一律报（对象方法按**前缀**匹配：`localStorage` 一条盖住 `getItem` / `setItem` / `clear`；
  `new QueryClient()` 按整名匹配；测试文件豁免）。真实输出见夹具 `call-sites`：
  页面里 `localStorage.getItem` / `gtag`、hook 里 `Sentry.captureException`、域里 `new QueryClient()`
  各一条；两处封装与 `src/app/**`、`src/shared/**` 零命中。
- **收口**：上一轮把"副作用"做成独立面，这一轮把面收成通用 `call-sites`（形状完全一样，
  两个面就是同一个事实的第二处）；`sideEffects({ apis, in })` → `callSites([{ name, apis, in }])`。
- 预设对每组做 **fail-closed 校验**：`name` / `apis` / `in` 任一为空、组名重复、一组都没有 → 当场报错
  （配了却什么都不判 = 静默失能）。
- 规则 **75 → 75**（S38 从"副作用"泛化成"调用"），夹具 `side-effects` → **`call-sites`**（两组同夹具）。

### Added（三个前端场景的门禁：页面里取数 / 页面被静态 import / 退路残留）

- **场景 ①：页面里直接 `useQuery`、域里直接 `fetch('/api/x')`** —— 换数据层要翻遍页面、
  契约类型散在各域、测试必须 mock 网络。
  **现在**：`dataLayer(reactQueryKit({ fetchIn: [...] }))` 声明取数落点后，**S36** 拦住落点外的取数调用
  （测试文件豁免；方法名按 `.` 后缀匹配，所以 `queryClient.invalidateQueries` 也抓得到；
  取数 API 名由 kit 按方案声明，`fetch` / 自家 hook 可以追加）。没声明落点 → 明列停用。
- **场景 ②：路由表静态 import 页面** —— 所有页面随主包下载，首屏跟着变大，第一个月没人发现。
  **现在**：`canonical({ lazyViews: true })` 声明后，**S37** 报"页面被入口静态 import"；
  组件之间互相引用不管（那不是首屏问题）。
- **场景 ③：重构后旧实现留在仓库里**（`CrewsPage.old.tsx` / `useCrewsLegacy.ts`）——
  没人敢删、新人抄了旧的那一份、两套实现行为不一致。
  **现在**：**H12** 判"整段命中"（子串不算、目录名不算，所以 `legacy-support.ts` 与
  `src/legacy/**` 迁移容器都不受牵连）；`hygiene()` 默认启用。
- 适配器新增两组字段：`data-layer` 的 `fetchApis`（kit 按方案声明）/ `fetchIn`（项目声明落点）；
  `reactQueryKit({ fetchIn, fetchApis })` 收参。规则 **71 → 74**，夹具 **50 → 53**，单测 +7 例。

### Added（字面量唯一出处：D22 缓存键 · D23 路由路径）

- **D22 缓存键只有一个出处**：`dataLayer(reactQueryKit({ queryKeyFrom: 'src/shared/api/queryKeys.ts' }))`
  声明键的落点后，`{ queryKey: ['crews', id] }` 这类**键字面量**只许出现在那个文件里（引用
  `keys.detail(id)` 合规）。判据来自 facts 的 `strings[].prop`。
- **D23 路由路径只有一个出处**：`router(reactRouterKit({ pathSource: 'src/shared/config/paths.ts' }))`
  声明路径落点后，`path` / `to` 属性与 `navigate()` / `router.push()` 这类跳转调用的**绝对路径字面量**
  只许出现在那个文件里；属性名与调用名由方案面声明（`pathProps` / `navigateCalls`）。
- 两条都是**声明落点才判**（`requires`）：没声明 → 报告里明列停用，不空转。落点写错（文件不存在）时
  **只报一条"落点不存在"**，不逐条把项目刷红。
- `engine/facts.ts` 的 `StringFact.prop` 现在会**透传**（数组 / 对象 / 括号 / 断言 / 展开 / 三元不改变
  "最近的属性名"，函数体与调用实参断开）—— 否则 `queryKey: ['crews']` 里的字面量永远拿不到属性名。
  这也是那个字段的第一个消费者；`FACTS_CACHE_SPEC` 1 → **2**（事实语义变了，旧缓存必须作废）。
- `facts` 的两组新读法对应两条新规则，落点字段进适配器白名单并有类型校验（空串 = 拼错了，直接报）。
- 夹具 **50 个**：新增 `route-paths`（路径字面量 × 引用对照）与 `cache-keys`（手拼键 × 引用键对照）；
  `tests/design-sources.test.mjs` 5 例（落点缺失 / 未声明 / 形态可配 / 引用与落点文件内不报）。
- 顺手改正 DESIGN §6.1.1 的事实模型示意（还写着 `jsxText` / `styleObjects` / `catches` / `tokens`
  这些委派后已删的字段，与实际 `Facts` 不符）。

### Added（一个面一个方案 + 生效的适配器可见）

- **报告自述 `adapters-in-use`**（`notices` 新 code，**兼容性新增**：不 bump `apiVersion`，
  未知 code 用 `isNoticeCode` 守卫可判；按 §6.9 的规矩在此单独标注）：每次运行报一行
  `生效的适配器：router=react-router · styles=css-modules` —— 适配器只写在配置里，
  报告以前完全不提它，"跑的是哪套 kit"只能去翻 `arch.config.mjs`。
- **`--verify-deps` 列出整张适配表**：`facet` / `id` / `specVersion` / 形态字段（`routeFiles`、
  `modulePatterns`、`resourceDir`…）/ 包对账；**没有 npm 包的 kit 也在表里**（CSS Module 就是这种方案），
  否则"我配了 `styles()` 吗、它认哪种文件"在排查时看不见。

### Fixed（两份 kit 声明同一个面时静默取后者）

- **`mergePresets` 对同一个面 fail-closed**：内容不同的两份适配器声明（`router(a)` + `router(b)`，
  或 `stack({ uiKit: antdKit() })` + 手写的 `uiKit(muiKit())`）以前是**浅合并静默取后者** ——
  换库换错、组合时手滑多写一份，现场都看不出来。现在直接报错并指出用 `overrides.adapters` 显式覆盖；
  内容**完全相同**的重复声明仍幂等（与 `defineFacet` 对同一个面的态度一致）。
- 顺手改正 DESIGN §6.9 一处口径：`NOTICE_CODES` 的家是 `engine/codes.ts`（不是 `types.ts`）。
- **`overrides.adapters` 不再绕开校验**：合并后的适配器全部再过一遍 `defineAdapter` ——
  字段白名单 / 类型 / 正则可编译 / `id` 必填 / **键与 `spec.facet` 一致** / **面已登记**。
  这条通道以前能让拼错的字段静默失能（`routeFile` vs `routeFiles`），也能让引擎完全不认识那个面
  （能力协商看不见、`--explain` 不提）。现在当场报错并给出可用字段：
  `[router] 未知字段：routeFile（允许：examples, facet, id, packages, routeFiles, specVersion）`。

### Added（方案面形态：规则不再写死 `routes.tsx` / `*.module.css`）

- **方案面声明「形态」（T1 第二半）**：适配表回答"用哪个库"之外，还要回答"规则判的写法长什么样"。
  - `router.routeFiles`：域的**公开面入口文件名**（默认 `['routes.ts','routes.tsx']`），
    **S03 / S04 / S05 / S14 / S15** 照它判（以前写死 `routes.tsx`）。
  - `styles.modulePatterns`：**组件样式文件形态**（正则，默认 `['\\.module\\.css$']`），
    **D16 / D17** 照它判（可换 `*.module.scss` 等；`cssModulesKit({ modulePatterns })` 必须自带
    hit / miss 样例，样例会拿真正则验证 —— 这是"正则写歪了却不生效"唯一能被抓住的地方）。
  - 默认值只有一处（`src/data/face-forms.ts`），规则经 `packs/core/rules/face-forms.ts` 读，并对外导出
    `DEFAULT_ROUTE_FILES` / `DEFAULT_MODULE_PATTERNS`（写自定义 kit 时别再抄一份）。
- **空清单是声明，不是"没配"**：`routeFiles: []`（文件路由：没有 per-domain 出口文件）/
  `modulePatterns: []`（Tailwind / CSS-in-JS：没有组件样式文件）→ 依赖它的规则**不判**，
  而不是拿默认形态去硬判。例外是 **S03**：真没有入口文件时**照报**（S01 已把域根让给它，
  放行就等于域根没有任何规则看着）。
- **自定义入口词汇由 kit 收参**：`reactRouterKit({ routeFiles })` / `noneRouterKit({ routeFiles })`
  （空清单也照原样声明，仍走 `defineAdapter` 校验 —— 不再需要往配置里塞裸适配器对象）。
- **位置类判定一律按词汇，不看角色 slot**：`S14` 的"有没有入口"、`S15②` 的"入口必被 app 聚合"
  以前读 `record.slot === 'routes'` —— 入口一改名就判不出来（假阳性 / 静默漏报）。现在按
  `routeFiles` + **扫描域里的真实文件**判（`presentFilesOf`：`ctx.records` 只装命中角色的文件，
  role-less 的入口落在 `scan.missing` 里，只看 records 会得出"域里没有入口"）。
- **词汇与角色表必须一起改，S03 会盯着（两个方向都判）**：
  - 名字在词汇里、却没命中任何角色 → `域入口 X 不在目录契约内：角色表里没有它的角色`
    （因为没角色的文件不进解析，图规则看不到它的 import；与其让 S15③ / S04 / S05 各报一句误导的错，
    不如这里说清）。
  - 反过来，角色表里 `slot: 'routes'` 的文件不在词汇里（入口搬走后留下的 `routes.tsx`）→
    `… 被角色表当作域入口，但方案面声明的入口是 …：词汇与角色表不一致`。
- 夹具 **48 个**：新增 `route-vocabulary`（入口叫 `routes.ts` 的域不再被 S04 / S05 误报）、
  `module-pattern`（`.module.scss` 被 D16 / D17 认作组件样式，`globals.css` 照报）、
  `route-custom-vocabulary`（kit + 角色表一起改，零发现项）与
  `route-custom-vocabulary-gap`（只改 kit：S03 报角色缺口）。

### Fixed（入口叫 `routes.ts` 的域被误报）

- **S04 / S05 / S15③ 把 `routes.tsx` 写死在规则里**，而范式角色表写的是 `modules/{domain}/routes.{ts,tsx}` ——
  两边一漂，入口叫 `routes.ts` 的域会被误报「跨域引用了内部文件」（S04 / S05）、
  view 被报「没有被 routes 引用」（S15③）。现在词汇只从方案面读，与角色表对齐；
  S03 / S14 的文案与 `placementHint` 也照同一份词汇念（不再指着一个本方案不存在的文件名）。
- **S03 在"入口词汇为空"时的文案会被读成文件名**（`域根目录只许 本方案未声明任何入口文件，出现了 helpers.ts`）→
  改成 `域根不该有文件（本方案未声明入口文件），出现了 helpers.ts`；`placementHint` 同理不再把域入口
  算进槽位表（有入口时"七个槽位"的原文案不变）。这条是**跑演示场景时当场发现的**，见
  `.scratch/face-forms/demo-router-kit.sh` 场景 E。

### Added（依赖图收敛 + 声明驱动的组规则 + 方案适配器）

- **收回两个委派缺口**：**S08 依赖环**（`graph.cycles`）与 **S33 导入必须解析得到**（`graph.unresolved`）——
  后者此前零消费者，写错相对路径（少一层 `..`）会**静默通过**；上线当天就抓到三处真实问题
  （`structure-isolate` 夹具的坏路径已修；`violations` 的悬空说明符是故意的，写进注释；
  `graph` 夹具的 `shared/api` 环按 S08 样例补注释与期望）。
- **S34 文件级入/出度上限**（`structure.degreeLimits`）：组粒度看不见的"神模块 / 改一处动全身"。
- **声明驱动的组规则**：`S35` 组必须有片段（**编号说明**：`S24` 已是"契约扫描域不得为空"，故排在其后）·
  `S25` 片段内保留名目录 · `S26` 组数量上限 · `S27` 目录子项数上限 · `S28` 组的外部引用下限（死切片）·
  `S29` 组名撞单元 · `S30` 重复词 · `S31` 单复数一致 · `S32` 导入局部性（默认关）。
- **`structure` 声明扩到 13 个字段**：解析 / 加法合并 / `overrides` 显式覆盖 / fail-closed 校验
  （维度名与角色 id 不存在一律报错）落在 `engine/structure.ts`。
- **词形判定改用 `pluralize`**（新增运行时依赖，已按 P1 审查门登记三处）：手写表在 315 词语料上分歧 2.9%，
  含 `alias`/`atlas` 误报与 `apis` 漏报的真 bug；`src/data/plural-forms.ts` 只留薄封装 + 中性词政策层。
- **适配器面开放注册（E2）**：引擎只预注册有消费者的核心面，新面由预设 `defineFacet` 登记；
  `FACETS` 常量 → `facetNames()` / `facetSpec()` / `facetOfCapabilityRoot()`（公共 API 变更）。
- **方案适配器（T1 第一半）**：`router()` / `dataLayer()` / `styles()` 三个面 + kits，
  配 **P12 同类方案不许混入**（判据来自 `src/data/solution-alternatives.ts`）。
  适配器只声明 `packages`（P12/P04/P01 真正消费的字段）——不做"声明了没人读"的字段。
- **`fsd()` 与社区文件系统模型对齐**：单文件片段（`model.ts`）· 入口认代码扩展名 · shared 每个片段的入口
  （ui/lib 走一级子目录 + 根入口豁免）· 重名查组路径段 · shared 公开面单元（S23③）。
- 夹具 44 个（新增 cycles / unresolved / degree-limits / group-in-degree / import-locality / solutions /
  structure-groups / structure-limits / structure-name-collisions / structure-repetitive-naming /
  structure-plural-consistency / fsd-parity / fsd-boundaries / fsd-import-locality），
  全部 `exact`；规则总数 56 → **69**。

### Changed（文档口径）

- DESIGN §14 移除已实现的 E2 行；`--verify-deps` 只做本地对账。
- README / DESIGN / ALTERNATIVES / CONTEXT 同步新规则、新声明、方案面与「与 steiger 的规则对齐」表。
- **`REQUIREMENTS.md` 成为需求的唯一来源**：**72 条**按场景分组，每条 = 痛点（带具体例子）+
  预期行为 + 状态 + **由谁来做**（本体 / 可委派给 eslint · stylelint · knip · dependency-cruiser 等）；
  委派出去的检查**本身就是需求**（不再另开一份委派清单，权威清单仍在 DESIGN §4.9）。
  `AGENTS.md` / `docs/agents/scenario-first.md` / README Roadmap / spec 模板都已指向它。
- **「联网成熟度查询」这条整体删除**（用户要求不再列为待办或"不做"项）：README Roadmap 的待办、
  REQUIREMENTS 的 N-02、PARADIGM §12.5、DESIGN §16.4 都已去掉（DESIGN §16.5 → §16.4）；
  只保留"`--verify-deps` 做本地对账（声明的包 ⇄ 装的包）"这条事实，设计理由折进 DESIGN §16.1。

## [0.3.8] - 2026-09-24

### Fixed（手工轮子指纹深度审计：一个"五个能力从没报过"的 bug + 名册式枚举 + 文档漂移）

- **平台能力的豁免条件写反**（真 bug）：`deps.ts` 里 `if (entry.platform === true) return true` → 这个文件被当成
  "已经在用首选方案"而 `continue`，于是 **deep-clone / unique-id / number-format / deep-equal / query-string
  五个平台能力从来没报过** —— 而紧邻的注释写的是"平台内置类能力只要命中就报"。改成 `return false`
  （平台内置没有 import 可查 → **没有豁免**）。顺带写清：同文件里也用了 `structuredClone` 也不能豁免 ——
  JSON 深拷贝会丢 Date / Map / undefined，那仍然是 bug。
- **`allowOwn` 只改了 hint，没真降级**：数据表说"只提示不报错"，实现里 finding 仍是 error。新增
  `Finding.severity` 覆盖 + `severityOf()` 读它 → P06 对 allowOwn 能力（query-string 等）**真的降级为 warn**；
  同时修掉 `toJsonReport` 里"每条 finding 的 severity 直接读规则严重度"（与 counts / 退出码不一致）。
- **名册式枚举成族**（与上一轮 datetime 的 `getDay` 同一类）：
  | 能力                               | 旧（漏）                             | 补                                                                |
  | ---------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
  | `cli-args`                         | 只认 `argv.slice/indexOf/…`          | `process.argv[2]` + `filter/forEach/map/reduce/some/every`        |
  | `unique-id`                        | 只认 `toString(36)`                  | 2/8/10/16、`toString().slice()`、经典 uuid v4 拼装片段            |
  | `number-format`                    | 只认一种分组正则                     | "正则里出现 `\d{3}`"                                              |
  | `deep-equal`                       | 只认 `===`                           | `==` / `!=` / `!==`（宽松相等更常见）                             |
  | `query-string`                     | 只认 `'?'.concat(`                   | `'?' + x`、模板串 `` `?${x}` ``、手写 `encodeURIComponent(k)+'='` |
  | `deep-clone`                       | **没有 `softSyntax`** → P07 永不参与 | 自研递归克隆的弱指纹                                              |
  | `debounce-throttle` / `validation` | 各 2 / 1 条                          | rAF 与 `performance.now()` / `new RegExp(` · `.match(` · `.exec(` |
- **`apiNames` 必须与 `softSyntax` 成对**：多个条目只写了 apiNames，命名指纹永远读不到（死声明）。
  新增**数据表自检**测试断言这条 —— 它正是能提前发现"声明了却永不生效"的那类断言。
- **新增夹具 `__fixtures__/wheels/`**：五个平台能力的手搓样本 + `argv[2]` + 宽松 `==` + 自研递归克隆 +
  **合规写法零命中**（`structuredClone` / `crypto.randomUUID` / `Intl.NumberFormat` / `isDeepStrictEqual` / `URLSearchParams`）。
  这个 bug 能活下来，就是因为**此前没有任何夹具覆盖平台能力**（datetime 夹具只覆盖 datetime，deps 只覆盖 cli-args）。
- **文档漂移对齐**：DESIGN §16.2 的规则表把 **P08 / P09 / P10 当成已实现**（同一文档后面却写着它们没实现），
  P07 的判据写成"≥2 个 API 名重叠"（实际是**精确同名，1 个即可**）；PARADIGM 有 4 处把 P08 当本体规则。
  现在表格只列本体真在跑的规则，其余编号写明"并入 / 已委派"。

### Changed（datetime 能力：补上「字符串日期解析」这条漏网）

- 起因是问「datetime 没限制 `new Date` 吗」。核实结果：**`new Date()` / `Date.now()`（取当前时刻）与
  `new Date(ms)`（时间戳）是故意不管的** —— 它们是原生原语，不是"手搓库"；禁掉只会制造误报。
  这个语义现在写进了数据表头部：**登记能力 = 这个能力的活走登记方案，不是禁用语言原语**。
- **实测出的缺口**：字符串日期**解析**这一格完全没人管 —— `new Date(s)`、`Date.parse(s)`、
  自研 `parseDate(s) { return new Date(s) }` 三种**都不报**。原因有两层：解析形态不在 `syntax` 里；
  而 P07 需要 `softSyntax`，datetime 条目此前**没有这个字段**，所以 P07 对 datetime 永不参与。
- 修法（**纯数据，不动规则**），两处都从"名册"改成"族"：
  - **取/改日期分量按 `Date` 的封闭 API 成族**：`\.get(?:FullYear|Month|Date|Day|…|UTC…)\(\)` +
    `\.set(?:…)\(` —— 旧实现只列了 5 个 getter，`getDay`、`getSeconds`、`getUTCFullYear` 与**全部 setter**
    都漏在外面（实测 `d.getDay()` 一条都不报）。`Date` 的实例方法是 ECMAScript 封闭集合，不会像库名那样过期。
  - **解析**：`Date\.parse\(`（该 API 只用于解析）+ `new Date\(\s*['"]`（只认**字面量**参数）；
    人类可读格式化补 `\.to(?:DateString|TimeString|UTCString)\(\)`（机器格式 `toISOString()` 不在此列 —— 那是序列化）。
  - `softSyntax` 放宽成族（`\.get[A-Z]\w*\(` / `\.set[A-Z]\w*\(`）→ 启用 P07；P07 的精度由**自研同名**把门，只是 warn。
- **两条刻意守住的边界**（写进条目注释与夹具）：
  ① 宽模式 `\.get[A-Z]\w*\(\)` **不用** —— 实测在本仓 + 29 个夹具里它命中 10 处，其中 4 处是误伤
  （`scanner.getTokenPos()` / `getTextPos()` / `node.getEnd()`）；显式族模式同范围命中 6 处，全是真 Date 用法。
  ② `getTime` / `setTime` **不在**族里：取时间戳是合法原生用法，毫秒手算由"与 4 位以上数字运算"那两条专门管。
  ③ `new Date(variable)` 静态判不出是字符串还是时间戳 → 不管（宁可漏也不误伤）。
- 夹具 `__fixtures__/datetime` 扩展：`parse.ts`（解析 → P06）· `week.ts`（`getDay` / `getUTC*` / setter → P06）·
  `dates.ts`（自研 `isSameDay` + 弱指纹 → P07 warn）· **`now.ts` 边界探针**
  （`new Date()` / `Date.now()` / `new Date(ms)` / `getTime` / `setTime` → **必须零命中**；`exact: true` 保证多报即红），
  并打开 P07；`expect.json` 按实测更新。其余 28 个夹具不受影响（自检 29/29）。
- 对应的回归测试从"只数 P06 条数"升级成四段：格式化/取分量 → P06 · 字符串解析 → P06 · 自研同名+弱指纹 → P07 ·
  原生原语与用 dayjs 的文件 → **不报**（把"边界"也钉成断言）。

## [0.3.6] - 2026-09-24

### Fixed（S12 措辞：不再靠"有 JSX"断言"它是组件"）

- **现象**：同一个 `:ui` 检查下两种完全不同的文件收到一字不差的报文 —— 导出元素表的
  `themeModeIcons.tsx`（`Record<ThemeMode, ReactNode>` 里含 `<MoonOutlined />`）与真组件
  `loginPrefs.tsx` 都得到「组件文件必须 PascalCase」。对后者准确；对前者把人指向了"改个名字就变绿"
  的动作，而真实问题（元素表不该以 `.tsx` 待在 `ui/`）原封不动。
- **根因**：第 ② 支的判据是 `hasJsx`（文件里有没有元素字面量），推不出"**导出的**是不是组件"；
  紧邻那条注释的前提「真有 JSX → 它确实是组件」本身不成立。
- **修法（按反馈建议，不动判据）**：② 支改成对两种形态都成立的措辞 ——
  `X 在组件目录里但不是 PascalCase：是组件就改成 PascalCase 的 .tsx；只放元素 / 常量就给 .ts 或挪出 ui/`，
  并把注释的前提改对。
- **为什么不改用 `functions[].isComponent` 选措辞**：它是启发式（首字母大写 + **块体** + 含 JSX），
  实测最常见的 `export const Foo = () => <div />`（**表达式体**）就是 `false`（元素表则没有函数）——
  拿一个会判错的判据去决定措辞，等于"用一个可能错的判据去修一个只是不够具体的报文"，方向是反的，
  还会给最常见的组件写法制造新的错误提示。
- **回归**：`tests/paradigm-consistency.test.mjs` 加了元素表形态，断言**两种形态除文件名外同句**
  （措辞不得依赖"到底是不是组件"这个判不准的事实），并断言旧的无条件断言措辞不再出现。
- **顺带明确**：`findings[].text` / `notices[].text` 都**不是契约**（机读侧用 `rule` / `file` / `line` / `severity` /
  `code`）—— 否则这次改措辞就得是破坏性变更。写进 DESIGN §6.9。

### Changed（性能：`walk()` 不再为每个目录项补一次 `statSync`）

- **根因**：`readdirSync(current)` 只拿名字，类型信息丢了，于是每个条目都补一次 `statSync` 只为问
  `isDirectory()` —— 纯 syscall 浪费，目录树一大就线性放大。
  改为 `readdirSync(current, { withFileTypes: true })`，类型随目录项一起返回。
- **实测**（同进程、同口径、`old`/`new` **交替跑各 6 次取中位数**，避免把冷缓存当优化；文件数一致）：
  本仓 `walk()` **139.6ms → 45.7ms（3.1×）**，109 个 md。端到端 `--check-docs` 现在 **0.20s**
  （启动基线 0.15s + walk 0.046s；改动前同口径约 0.29s）。
  真实大仓的数字来自用户报告：superhive（`dev/` 下有 Go modcache，1131 个 md）`--check-docs` **2.6s → 预计 ~0.9s**。
  三个调用点一起受益：契约扫描（`scan.ts`）、`--check-docs` / `--render-docs`（`docs.ts`）、本体自检（`portability.ts`）。
- ⚠️ 测法说明：我第一次量出"913ms → 43ms"，那是**第一次调用（冷缓存）对之后的热调用**，不是优化幅度。
  所以上面的数字是交替跑的**中位数** —— 这个仓对"看起来漂亮的数字"的要求和规则一样：口径先写清。
- **语义等价不是"顺手改"**：`Dirent.isDirectory()` 描述的是**链接本身**，对指向目录的符号链接返回 `false`；
  而 `statSync` 是**跟随**链接的。直接信 `Dirent` 会不再跟随链接目录 —— 所以只有链接才付一次 syscall，
  且**悬空链接仍整体跳过**（旧实现 stat 抛错就 `continue`，不会把它当文件收进来）。
- **证明方式**：新增 `tests/walk.test.mjs`，把**改动前的算法原样抄一份当参照**（`referenceWalk`），
  在含链接目录 / 链接文件 / 悬空链接 / 忽略名 / 扩展名过滤的合成树上比对，要求**逐项一致** ——
  比"挑几个用例"更能挡住"顺手把链接语义改了"。
- 沿用旧行为未改：目录链接成环时不设防（需要 realpath 记账，属另一件事）。

## [0.3.5] - 2026-09-24

### Changed（**破坏性**：`ok` 语义收窄 → `apiVersion` 1 → 2）

- **`ok` 从"判过的东西没有 error"改成"判过的东西没有 error，而且确实判了"**：
  `ok = errors === 0 && (paths === null || paths.matched > 0) && scopeFiles > 0`。
  实测的漏洞：`--paths` 一个都没匹配上时退出码是 2（"请求无法满足"），而 `ok` 还是 `true` ——
  只读 stdout JSON、拿不到退出码的 CI 脚本 / PR bot 写 `if (!report.ok) fail`，于是**请求没被满足被当成通过**。
  这是 v1 那一轮"让消费方能可靠判定报告内容"漏掉的一格。
- **没有把 `ok` 与退出码对齐**（那会造出 `ok: true` 且 `errors: 3` 的荒谬组合）：
  退出码答「要不要拦」（`--report-only` / `--local-only` 都是"有 error 也退 0"），
  `ok` 答「结论是否通过」。两通道的完整分工表见 DESIGN §6.9（2.0.0）。
- **`REPORT_API_VERSION` 1 → 2**（改字段含义 = 破坏性，按 §6.9 的分级）；冻结测试的版本值与字段清单同步。
  迁移：**只把自报支持的版本号改成 2**；本来就按 `paths.matched` / `diagnostics.length` 判的消费方零改动。
- 顺带补同类的一格：**全量下 0 个文件被判定**（`include` 不限 + 空仓）时 `scopeFiles === 0`，
  那时也没有任何 error —— 现在同样是 `ok: false`（与 S24「0 个文件 → 通过」是同一条道理）。

## [0.3.4] - 2026-09-24

### Added（契约枚举的常量表与守卫，**派生**不是第二份清单）

- 导出 `NOTICE.PATHS_NO_MATCH` 这类常量（kebab-case → `SCREAMING_SNAKE`，类型层用模板字面量推导）
  与 `isNoticeCode()` / `isSkipCode()` 守卫，给**没有类型系统**的消费方（`.mjs` adapter / shell / CI 脚本）用：
  JS 里拼错字符串只会安静地 `false`，而这里会编译期/守卫期就炸；TS 消费方本来就有 `NoticeCode` union 保护
  （实测 `code === 'paths-no-matchh'` 是编译错误），常量表只是方便。
- **两者都从 `NOTICE_CODES` / `SKIP_CODES` 派生**（`constantsOf()` / `codeGuard()`）：加一个 code 只改数组一处，
  不存在"数组改了忘记改常量表"的可能。`tests/report-contract.test.mjs` 冻结了完备性（常量名集合 ↔ 数组一一对应）。
- 这条形状写进 DESIGN §6.9「契约枚举的标准形状」：**单一 const 数组 → 派生 union + 常量表 + 守卫 + 冻结测试**，
  将来的 `severity` / `domain` 等契约枚举照这个模子来（**有消费者才加**，不预先造没人用的表）。
- **「按 code 做对应操作」是另一件事**：常量表防**拼写**，穷举映射防**漏处理**。TS 消费方写
  `Record<NoticeCode, Handler>`（或 `switch` + `never`）就有编译期护栏 —— 实测漏掉一个 code 会报
  `TS2741: Property '"scan-empty"' is missing`，即**我们新增 code 时消费方的构建会红**，而不是静默走 `default`。
  契约变更因此分两级写进 §6.9：**破坏性**（删/改名、改含义、删字段、改退出码 → 必须 bump `apiVersion`）与
  **兼容性新增**（新增 code/字段 → 不 bump，但必须在 CHANGELOG 标注）。
- 模块整理：契约枚举与守卫搬到 `src/engine/codes.ts`（`types.ts` 涨到 508 行，既顶 lint 的 500 行上限、也踩了狗粮的 S16 —— 抽模块而不是抬阈值）。

## [0.3.3] - 2026-09-24

### Changed（**破坏性**：JSON 报告成为带版本的对外契约）

`--format=json` 是 CI 注解 / PR bot / IDE 插件 / agent 的接口，所以它和规则一样是契约。起因是一次真实反馈：
0.3.x 一口气新增了 `skipped` / `exceptions` / `skippedGlobals` / `filteredBySeverity` / `notices` 五个字段，
**没有任何机制**能让"字段变多了"与"字段没变"可区分 —— 旧消费方照跑不误，只是悄悄少显示一类信息
（`S13 没在跑`看不见、`--paths` 零匹配被当成通过）。而**只加版本号解决不了**：没人强制 bump 的版本号只是装饰。

- **新增 `apiVersion`**（`REPORT_API_VERSION = 1`，从包入口导出，消费方可断言）。增删顶层字段 / 增删
  `notices[].code` / 改字段含义 = 契约变更，必须动它；而"必须动"由新增的
  **`tests/report-contract.test.mjs`** 冻结住（顶层字段集与 code 清单都被写死，增删即红）。
- **`notices: string[]` → `Array<{ code, text }>`（破坏性）**：消费方按 `code` 判，**文案不再是契约**。
  `code` 清单单一出处是 `types.ts` 的 `NOTICE_CODES`（23 条，编译期 + 测试双重把关），
  并**从包入口导出**（`exports` 映射不暴露 `./engine/*`，拿不到就等于没有）。
- **机读 ⊇ 人读**：人读摘要里的数字以前在 JSON 里缺一半，现在补齐 `scopeFiles` · `globalFindings` ·
  `rulesEnabled` / `rulesTotal`（`skippedGlobals` / `filteredBySeverity` / `exceptions` / `outsideContract` 已有）。
- **`--paths` 一个文件都没匹配上 → 退出码 2**（原来 0）：它意味着"你要求判的东西一件都没判"，
  是**请求无法满足**，不是"通过"。同时给出 `paths: { requested, matched: 0 }` 与 `code: 'paths-no-match'`，
  消费方不必去匹配中文文案；「没问」（`paths: null`）与「问了没命中」（`matched: 0`）可区分。
  `--report-only` 仍然恒 0（显式的"只看不拦"）。
- `RunResult` 也带上 `pathsMatched` / `notices`（程序化调用方与 JSON 看到同一份自述）。
- 契约与迁移写进 **DESIGN §6.9**（新增）与 README；退出码表补一行。
- 顺带：`fsd()` 关于 `assets` / `providers` 的注释现在**点明这是上游自相矛盾**（`segments-by-purpose` 把
  `providers` 列为 React 坏片段名且对无切片层也生效，源码链接已附），本预选明确"站 linter"。

### Fixed（S12 报文指向真正的修法）

- 新判据「组件目录（`:ui` / `:components:*`）里的 `.tsx` 必须 PascalCase」**压力是对的**，但报文说的是
  「组件文件必须 PascalCase」—— 而 `ui/useThing.tsx` 的真实问题是"hook 住错了目录"。提示指错地方，
  agent 就会去改名字而不是挪文件。现在按**文件的真实形态**分三种说法（`hasJsx` 来自事实模型，判据不动）：
  - 名字以 `naming.hookPrefix` 开头 → 「hook 不该住在组件目录：把 X 挪到 model/ 或 hooks/」
  - 真有 JSX → 「组件文件必须 PascalCase」（它确实是组件，只是名字不对 —— 原报文准确）
  - 没有 JSX 也不是组件名 → 「X 不是组件却住在组件目录：这份 .tsx 里没有 JSX，纯逻辑请放 model/、或改成 .ts」
    三者都带上修法提示（pretty 报告渲染成 `→ …`）：组件目录只放组件，hook 与纯逻辑另有位置。
    回归见 `tests/paradigm-consistency.test.mjs` 第 ⑥ 条。

## [0.3.2] - 2026-09-24

### Fixed（五处「声明了却不生效」——同一类病，来自一次真实反馈）

全部先复现、再修；每一条都配了回归测试（`tests/paradigm-consistency.test.mjs`，7 条）：

1. **`--explain` 在 FSD 下给库范式的建议**：`placementHint` 只看 `layout`，而 `fsd()` 的 `layout`
   沿用的是 `library()` 那套（`modules` / `shared` 都是空串）→ 掉进库分支，输出
   「先在 `library({ modules })` 里补上」。修法：`Config` 现在**真的带上 `paradigm`**
   （此前只有 `loadConfig` 的范式唯一性校验在读它，没进合并配置），并给 FSD 一条从**角色表**读的
   落点分支（层 / 切片 / 片段按角色表念，自定义过的 FSD 也给得对）。
2. **S12 / S13 在 `fsd()` 下 100% 空转**（全靠 `record.slot` 与 canonical 专属 role 字面量）：
   S12 的 api / 组件命名改成**按角色后缀**判（`fsd:shared:api` 与 `shared:api` 语义相同 → 都会判）；
   S13 则需要槽位语义 → 新增参数型能力 `structure.slots`（canonical 声明，library / fsd 没有），
   于是它在那两个范式下**明列停用**，而不是"注册了却永远判不出东西"。
3. **`thresholds.viewLines` 在 FSD 下静默失效**（同一份 153 行页面：`viewLines: 100` 不报、`fileLines: 100` 才报）：
   新增角色描述符字段 **`pageLike`**（canonical 的 `module:views`、FSD 的 `pages/<切片>/ui`），
   S16 用它决定 `viewLines` / `fileLines`；**没有任何页面级角色的范式配了 `viewLines` 时，报告当场自述
   这条阈值不会生效**（D21「声明了却零匹配」的同款套路）。
4. **`naming` 只有 S12 / S13 消费**，上面两条死了它却还在被 `--explain` 打印：现在没有 views / hooks
   槽位就不打印命名契约，并给出一句原因（"承诺了却不执行"比不写更糟）。
5. **D16 与官方 `app/styles` 片段打架**：D16 原来只豁免 `styleDir` → `src/app/styles/probe.css`
   被判「非 CSS Module 的样式文件出现在组件目录」（文案也不对）。现在豁免**声明过的三个落点**
   （styleDir / tokenDir / vendorDir），文案改成"全局 CSS 只许放声明的样式落点"；同时 `fsd()` 的
   `styleDir` 归位到官方的 `app/styles`（全局样式），令牌与第三方覆盖仍在 `shared/ui/styles/{tokens,vendor}`。

### Changed（适配表边界：`packages` 是"必须装的"，不是"整套库的清单"）

- **`antdKit().packages` 去掉 `@ant-design/x`**（AI 界面套件，antd 生态的**可选扩展**）。
  它列在那里时，P04 正向会要求**每个** antd 项目都装上它 —— 哪怕一行都不用；`allow` 已开启的项目还得多抄一行。
  现在只剩 `['antd', '@ant-design/icons']`。
- **删之前先确认过不会变成误报**：P04 反向用的是 `fingerprintsOf()`（返回**别套**：`!kit.packages.some(pkg => owned.has(pkg))`），
  按**套**判而不是按包判，而 `@ant-design/x` 仍登记在 `data/kit-fingerprints.ts` 的 antd 条目里 ——
  所以"装了它"既不会被判"混进别的组件库"，`--verify-deps` 也照样对账通过（实测）。
- 新边界写进 DESIGN §7.1：「**`packages` 是「你必须装的」，不是「这套库的全部包」**」——
  同生态的可选扩展（`@ant-design/x`、`@ant-design/pro-*`、`@ant-design/charts`…）不该列进来；
  但 `allow` 已开启时，装了什么就得自己写进 `allow`（项目决定，不是适配器替你决定）。
- 夹具 `allowlist-adapters` 随之只装 `antd` + `@ant-design/icons`（它的断言是"适配表 packages 并入白名单"，与包数无关）。
- 新增 `tests/kit-packages.test.mjs`（5 条）：不装它不再违规 · 装了它 P04 不报 · `allow` 开启时要自己登记 ·
  **反向没被削弱**（装了 `element-plus` 照样报）。

## [0.3.1] - 2026-09-24

### Changed（`fsd()` 按官方 v2.1 对齐）

- **补上官方 shared 典型段 `routes`**，app 典型段补 `routes` / `store` / `entrypoint`
  （实测：这些官方写法此前被判「S01 无处安放」）。
- **支持官方的"环境特定公开面"** `index.server.{ts,tsx}` / `index.client.{ts,tsx}`
  （app 层与四个切片层各加一条角色，且同样标 `entry: true` —— 它就是那个切片的公开面）。
- 角色描述符 38 → **45**；新增 `tests/fsd-conformance.test.mjs`（4 条）：官方典型段与 `index.server` 不被误报、
  核心规矩（S21/S22/S23）照旧，以及**已知偏离被故意钉住**。
- **记录一处未实现的官方能力：`@x` 跨引用公开面**（`entities/A/@x/B.ts`）。它是官方唯一的"同层跨切片"合法通道，
  要支持得给 S22 开例外并限制在 entities 层；当前替代是把这类联系提到更高层（官方也说"尽量少用"）。
  源码注释与 `ALTERNATIVES.md` §3.5 的对照表都写明了这一点，免得下次又被当成 bug。
- 逐条对照表（含 ✅/⚠️/❌）落在 `docs/ALTERNATIVES.md` §3.5。

## [0.3.0] - 2026-09-24

### Changed（忽略分三层：宿主 `ignore` + `.gitignore` 基础层 + 产物目录数据表）

- **通用产物目录名册从引擎常量变成数据表**（`src/data/build-output-dirs.ts`）：`node_modules` · `dist` · `build` · `out` ·
  `coverage` · `.next` · `.nuxt` · `.output` · `.svelte-kit` · `.angular` · `.parcel-cache` · `.vite` · `.cache` ·
  `.pnpm-store` · `.yarn` · `bower_components` · `.git` · `.turbo` · `.arch-guard-cache`。宿主忘了把它们写进 `ignore`
  也不会去解析一堆生成代码；名单是可评审、可扩展的纯数据，引擎只负责用它。
- **`.gitignore` 作为基础层自动生效**（新增 `gitIgnoredPaths()`）：**问 git** 而不是自己解析 ——
  `.git/info/exclude`、全局 excludes、子目录各自的 `.gitignore`、`!` 否定全部算数；自己写的解析器错一条就是"多跳了 = 静默不判"。
  宿主 `ignore` 仍在它之上继续追加（两层叠加，谁都没被替代）。三条边界规矩：
  ① **只作用于契约域外**（契约域内即使被 gitignore 也照判 —— 宁可吵，不可静默不判）；
  ② 只列**未跟踪**的忽略项（被跟踪的文件永远不受 `.gitignore` 影响，所以提交在仓库里的源码不会被误跳）；
  ③ 没有 git / 不是仓库时**整层降级关闭**，回到 ①+③。
- **跳过什么必须自述**：新增 `因 .gitignore（git 判定）跳过 N 个文件`（与 `ignore（项目边界）命中 N 个` 同级）。
- 顺带修掉一个解析坑：`git ls-files --directory` 对目录输出 `gen/`，而 `path.relative` 会把结尾斜杠吃掉 →
  **先记住再归一化**，否则前缀匹配失效（测试当场抓到）。
- **`ignore` 跳过数现在会自述**：`ignore（项目边界）命中 N 个文件，未进文件集也不解析：<glob 列表>`。
  此前报告完全不提它 —— 宿主把某个源码目录误写进 `ignore` 时，表现是"悄无声息地不判了"。
- 顺带把编排里的「读源码 → 提事实 → 缓存」抽成 `src/engine/collect.ts`（`runGuard` 又顶到了函数长度上限，
  与 `git.ts` / `filters.ts` 同一处理方式：抽模块，不抬阈值）。
- 新增 2 条测试：产物目录默认不进文件集、`ignore` 跳过数在报告与 JSON 里都可见。

### Added（`--render-docs` / `--check-docs`：文档与门禁同一份真相）

- **文档里的那几张表改为从 `arch.config.mjs` 渲染**（DESIGN §7.3 承诺了很久，现在落地）。在文档里包一块：
  ```md
  <!-- arch-guard:begin deps -->
  <!-- arch-guard:end deps -->
  ```
  `--render-docs` 重写块内容，`--check-docs` 只校验（不符即红）。`pnpm check` 已接 `--check-docs`。
- **块名即登记名**（`src/engine/docs.ts` 的 `DOC_BLOCKS`）：`deps`（能力表 + 批准清单）· `thresholds` · `layout` ·
  `structure` · `scan-scope`（include / ignore）· `roles`（角色表）· `params`（落点）· `exceptions`（规则级例外）。
  **拼错直接报错**；未闭合 / 不配对 / 嵌块同样报错；一个块都没有时明说"没有任何文档管理块"（不许安静通过）。
- 本仓 `AGENTS.md` 已接三个块（`roles` / `deps` / `thresholds`）—— 在此之前 AGENTS 目录表与 `arch.config.mjs` 是**两处手抄**。
- 两条狗粮踩出来的边界（都写进实现与测试）：
  ① **围栏代码块里的示范标记不算真块** —— 否则"在文档里示范块语法"会把自己判红（本仓 README / CHANGELOG 正是这么踩的）；
  ② **排版不算漂移** —— `prettier --write` 会把表格按列对齐、把分隔行按列宽拉长，所以比较前先归一化空白与分隔线长度
  （事实是单元格内容，不是留白；否则引擎就得去复刻 prettier 的排版算法，那是第二份真相）。
- 新增 `tests/docs.test.mjs`（8 条）：块名拼错 / 未闭合 / 不配对 / 嵌块、只改块内内容且幂等、
  `--check-docs` 指名文件与块、`--render-docs` 后转绿、config 一改块就变（阈值 × 批准清单）、
  没有块时明说、`docs/**` 里的块也扫。

### Added（`--explain`：把约束前移到写之前）

- **新增 `arch-guard --explain <路径>`**：给出这个路径的**契约** —— 角色（id / 层号 / 槽位 / 域 / 组）、
  **能依赖谁**（层序单向 S21 + 域内/域外 import 规则 S04–S06 + 组隔离 S22 + 公开面 S23）、命名契约、
  与落点有关的路径参数（令牌 / 样式 / 存储 / i18n）、以及**本配置启用的规则清单（逐条带修法）**与因能力停用的规则。
  目的是给 agent 的那一半：门禁平时只在事后说"你错了"，而"我要写的这个文件是什么角色、能 import 谁、该放哪"
  全是**既有数据**（角色表 + 布局 + 结构声明 + `params`）——**一条规则都不用跑，零误报**。
- 路径**还没写**也能问：命中不了任何角色 → 直接给出「该放哪」（复用 S01/S03 的 `placementHint`，不是第二处真相）。
  域外 / `ignore` / 资源文件 / **角色歧义**都会明确说清（歧义会点出全部命中角色）。
- `--format=json` 给结构化结果（agent 消费）；一次可问多条（逗号分隔）；支持绝对路径（IDE / agent 按文件传参的形态）；
  **退出码恒为 0**（这是查询，不是判决）。
- 实现要点：把角色匹配从 `scanProject` 抽成 `buildRoleIndex()` / `resolveRole()`，**全量扫描与解释共用一份实现** ——
  否则"解释"和"判定"迟早给出不同答案，而 agent 会照着错的那份写代码（新的假绿来源）。
- 新增 `tests/explain.test.mjs`（7 条）：命中 / 无处安放（给落点）/ 域外 / ignore / 歧义 / 绝对路径 + JSON / 多条路径。

### Changed（例外从「文件免检」收窄为「规则级例外」）

- **删掉文件级 `exempt`，换成 `exceptions: [{ rule, glob, reason, expires? }]`**。区别是决定性的：
  文件级豁免命中的文件**不进角色表、不解析事实、所有规则一起停看**（为了一条规则把整个文件免检，
  在依赖图里只留一个没有边的孤立节点）；规则级例外是对**发现项**做后置过滤 —— 文件照常有角色、进图、
  被其它规则判定，只有指名的那条规则被摘掉。
- **三重把关**：`rule` 必须真实存在（拼错 = 例外根本没生效 = 假绿 → 直接报错）；`reason` 必填（进 diff 可评审）；
  `expires`（`YYYY-MM-DD`）写了就**过期即红**，逼你续期或删掉。
- **例外必须透明**：每次运行点名每条例外（命中几处 / 未命中），未命中的提示「可能可以删掉」；
  摘要与 JSON 都给出 `例外 N 处 / M 条声明`。不透明的例外就是隐形的门禁关闭。
- 三种需求的分工写进文档与 CONTEXT：① 这片树不属于契约 → `include` / `ignore`；② 这条规则对它不适用 → `exceptions`；
  ③ 暂时不想修 → **没有这个通道**（基线已移除）。
- 本仓自己那条 `exempt: [{ glob: 'src/engine/output.ts' }]` 一并删除 —— 实测摘掉后狗粮照样全绿
  （`console.*` 那条规则 H03 已委派 eslint，本体没有规则会命中它），它是装饰而非承重。
- DESIGN §14 的 **R4 缺口随之关闭**（例外已有理由 + 期限）。
- 新增 `tests/exceptions.test.mjs`（5 条）：只摘指名规则而文件仍被其它规则判定、未命中要点名、
  规则 id 拼错 / 过期 / 缺字段全部 fail-closed。

### Removed（违规基线：门禁不再接受存量豁免）

- **`arch.baseline.json` 与 `--update-baseline` 一并移除**：违规必须修，**不符合规范就是红**。
  唯一例外只剩 config 的 `exempt` 白名单（现在**必须写理由**，缺理由在配置加载期直接报错）。
- 为什么移除：该机制同时满足「**永久**（条目无期限）+ **一键重写**（写全部当前违规）+ **锚点被格式化干掉**」。
  于是"重新写基线"永远比"修"便宜 —— 实测：2 条违规 → `--update-baseline` → 全绿；再加一条 → 红 → 再写一次 → 全绿（豁免数还从 4 涨到 6）。
  门禁的结论从「符合规范」退化成「没有新增违规」，而后者可以被无限刷。**跳过门禁的成本是 0**，这与"约束 agent 编码质量"直接冲突。
- 连带的接口变化（破坏性）：`Config.baselineFile`、`RunOptions.updateBaseline`、报告里的 `豁免 N` 与"过期豁免"提示、
  `index.ts` 的 baseline 导出（`loadBaseline` / `applyBaseline` / `saveBaseline` / `entriesFromFindings` / `anchorFor` / 相关类型）
  全部删除；`src/engine/baseline.ts` 删除（140 行）。
- **覆盖率棘轮（M04）保留**，但它与豁免无关：快照改由新开关 **`--update-coverage`** 刷新（写 `arch.coverage.json`）；
  没启用棘轮或产物读不到时**明确说"未写快照"**，不静默。
- 旧仓库若还留着 `arch.baseline.json`：文件被忽略，并在报告里提示「违规基线机制已移除」（不许静默）。
- 顺带解决的历史冲突：DESIGN §14 记过的「fixer × 棘轮」冲突随基线一起消失（`--fix` 仍不在 v1 范围）。
- 新增 `tests/no-baseline.test.mjs`（4 条）：手写基线也不再豁免且明确提示、`--update-baseline` 开关不存在（退出 2）、
  `exempt` 缺理由即 fail-closed、`--update-coverage` 只写覆盖率快照而不豁免任何违规。

### Fixed（vendor 边界：D10 漏检变量、P11 锚点误报）

- **D10 现在也守变量前缀**（DESIGN §5.2 一直是这么写的：「选择器前缀**与变量前缀**只许出现在 `styles/vendor/**`」，
  而实现只遍历了 `file.selectors`）：`--ant-*` 出现在 vendor 目录之外——无论定义（`--ant-local: …`）
  还是引用（`var(--ant-color-primary)`）——都报错。实测漏检：把变量放进 `src/shared/ui/styles/base.css`，
  `--only=D10,D10b` **零报告**，正是这条规则要防的假绿。
- **P11 不再误报「零使用」**：原先拿适配器的原始正则去 test **整份文件文本**，而 `vendorVars` 写的是 `^--ant-`
  （本意是"变量名开头"，没有 `m` 标志时却成了"文件开头"）—— 变量不在第一行就检测不到，
  于是**只在 CSS 里用组件库变量**（不 import 包）的项目被无端 warn。现在 D10 / D10b / P11
  **共用 `design-shared.ts` 的 `vendorPatterns` / `usesVendorPatterns`**：编译一份，匹配**解析后**的选择器与变量名。
- 夹具与测试：新增 `__fixtures__/vendor-var-leak`（变量漏到 vendor 之外，同时钉住 P11 不误报）+
  `tests/vendor-boundary.test.mjs`（4 条：D10 定义/引用各报一条、vendor 内合法零噪音、
  P11 认出 CSS-only 用法、P11 真的零使用仍报 warn）。

### Fixed（过滤器与空扫描域：三条「绿而不自述」的洞）

- **新增规则 S24「契约扫描域不得为空」**：`include` 非空却一个源码文件都没匹配到 → **error**，并标为全局
  （`--scope=changed` 下默认仍然失败，不许静默丢弃）。此前只有「认不出的元框架」那一轴被守住，
  `include` / `srcRoot` / 预设 `layout` 打错一个字母就会「0 个文件 → ✔ 通过」——PARADIGM §11 明说过这是**假绿**。
  `include` 为空（不限扫描域）时不判：空仓库是合法形态，改由报告 notice 自述「没有任何东西被判定」。
  新夹具 `__fixtures__/scan-scope-empty`（违规侧）。
- **`--severity` 过滤必须自述**：以前在有 error 的项目上跑 `--severity=warn` 会打印「✔ 架构守卫通过」而不交代被滤掉了什么。
  现在 notice + 摘要行 + `RunResult.filteredBySeverity` + JSON 字段四处都给条数（照 `--local-only` 的先例）。
- **`--paths` 一个文件都没匹配上必须自述**：路径打错时以前安静通过；现在明确说「0 个文件被判定，别当成通过」。
- **JSON 报告补 `notices`**：这些自述以前只存在于人读的那一行里，CI / agent 看不到；现在机读侧同样可见。

### Changed（夹具精确性：从「只查漏报」到「漏报、多报都查」）

- 12 个夹具此前没写 `exact: true`，而自检默认**只查漏报、不查多报**（`self-test.ts`）——
  实测它们本来就精确（0 漏报 / 0 多报），但那是「碰巧」，不是「被守住」。现在 **28/28 全部 `exact`**：
  将来任何规则多报（= 误报，本仓第一红线）都会让门禁直接红。
  维护提示：改写 `expect.json` 时**必须保留 `unitOnly` 之类的声明字段**（`coverage` 夹具用它登记由单测覆盖的 M05/M06）。

### Fixed（scope 的安全语义：承诺了却没实现的那两条）

- **`--scope=staged` 现在真的读 index 内容**（`git show :<path>`），不再读工作区文件。这是 pre-commit 的经典 bug：
  用户 `git add` 之后继续改文件时，工作区是"下一版"、index 才是"这次要提交的" —— 旧实现会报出用户没打算提交的改动
  （假红，hook 被绕过），也会漏掉 index 里的违规（假绿）。取不到 index blob 的（staged 删除 / git 报错）退回工作区内容，
  并在报告里明列文件名 —— 不许静默换语义。新增 `tests/scope-safety.test.mjs`（index 干净 × 工作区违规、反向两组对照）。
- **`--local-only` 跳过的全局违规条数必须可见**：以前只是把不可归属的全局违规从报告里滤掉，摘要仍旧显示"全局违规 0"
  （DESIGN §6.8 退出码表要求"零，但打印跳过条数"）。现在 notice、摘要行、`RunResult.skippedGlobals` 与 JSON 报告
  四处都给出条数；默认行为不变（全局违规仍然失败）。
- 文档/实现对齐（本仓自己的公理 1：真相唯一）：`--staged` 的语义、P07 的实现状态（已落地，此前三处文档写"未实现"）、
  `--verify-deps`（本地对账已落地 / 联网成熟度未实现）、facts 缓存键（`rel + role + 内容 sha1`，不含"配置哈希/规则集版本"，
  因为 facts 与规则无关）、§6.2 目录树（`src/**/*.ts`，不再写已不存在的 `tools/arch-guard/*.mjs`）、§1.2 依赖口径
  （改为"显式登记的审查门"，与 `commander` + P1 白名单一致）、README 的四条不变式（补 P4）与 Roadmap。
  另修 §7.0.1 里与下一节自相矛盾的一条（库范式"走三根兜底"的旧口径：现在**没有兜底**，缺落点即明列停用）。

### Changed（真相收敛）

- **阈值与命名契约只剩一份默认值**（`src/engine/defaults.ts`）：此前 `config.ts` 的兜底、`canonical()`、`library()` 各写一遍
  （`hygiene()` 里还有第四份 `functionLines: 150`），改一处另外几处静默漂移。现在三者都从同一处取，行为不变；
  `tests/presets.test.mjs` 加了一条守卫（三个范文的阈值/命名必须等于唯一默认值）。
- **删掉死字段 `Config.addRoles`**：它被赋值却无人读（`roles` 已含追加结果），留着就是同一事实的第二处存放、
  将来谁读了就会把角色重复计入。`addRoles` 仍然可以作为宿主的 `overrides` / 预设输入使用（新增 `ConfigOverrides` 类型承载它）。
- `--verify-deps` 的输出不再暗示"依赖成熟度已把关"；PARADIGM §12.5 / DESIGN §16.4 标注联网部分未实现。

### Changed（狗粮配置：只留真有消费者的轴）

- **`arch.config.mjs` 去掉 `hygiene()`**：它只贡献 H06，而 H06 需要 `uiKit.detachedApis` 能力 ——
  本项目永远不会用组件库，所以那是一条**净贡献 0、永远停用**的声明（实测：去掉它启用规则数不变）。
  H 域在本仓靠 eslint 那侧覆盖（H01–H05 按 §4.9 委派）。**这是取舍不是缺陷**：想让"H 域评估过"留在报告里，加回一行即可。
- **`arch.config.mjs` 补 `metrics()`**：M 域（8 条规则）此前一条都没在本仓跑过。现在装两条**没有产物依赖**的：
  `tests.checkChain` → **M09**（`check` 链路必须真的包含 test 与 coverage —— 门禁自己漏跑只有门禁自己能查）、
  `depsBudget.runtime: 1` → **M07**（本体只许一个运行时依赖；加第二个要改配置，diff 可见）。
  实测狗粮从 15/55 → **17/55**，新增两条今天就是绿的，且都真的会失败（把 `pnpm test` 从 check 里摘掉 → M09 立即报错）。
  依赖覆盖率产物的 M02–M06 与 M08 仍是**明列停用**：M06 要求产物比 HEAD 新，装上会让 `pnpm guard:self`
  变成"必须先跑覆盖率"；M08 要求源文件被测试 import 或同名配对，而本仓测试是**分组测试 + 跑构建产物**（import `es/`），
  实测会一次报 24 条结构性 error（不是代码问题），装上等于削弱门禁。
- `arch.config.mjs` 另补：`specVersion: '1'`（配置格式版本不一致时显式报错）、`packs: [...]` 显式声明（不再依赖 CLI 兜底包）、
  `.scratch/**` 进 `ignore`（一次性 spike 不属于项目源码树）。
  注：写 `packs` 的收益是"配置自述用了哪种源码形态"，**不是**"让 facet 白名单校验生效" ——
  那条校验一直通过 CLI 兜底包在跑（`loadConfig` 见到 pack 就校验），此处更正我先前的说法。

### Changed（pack 轴：`framework` 指源码形态，不是"用了哪个框架"）

- **新增 `tsPack`（`framework: 'typescript'`），本仓改用它。** 起因是一个纯 TS 库/CLI 竟被 `reactPack` 量：
  根因是 v1 只有一个叫 "react" 的包，而它实际承载的是「TS/TSX parser + 全部规则」——
  `framework` 只驱动两件事（哪些扩展名归本包管、S20 的报错文案），**没有任何规则按它分支**（已核对）。
  现在：`src/packs/core/rules/` 存放**共享规则实现**，`packs/typescript` 与 `packs/react` 是两份 pack 声明，
  今天引用同一份 `coreRules`（v1 没有任何 JSX 专属的**已实现**规则：C01 / D15 已委派）；
  JSX 专属规则落地时它们的家是 `packs/react/rules/`，那时两者才真正分化。
- **引擎默认源码形态从 `react` 改为 `typescript`**（`framework-sources.ts` 里第一个已实现项）：
  引擎不该假设前端框架。扩展名集合两者相同，所以行为零变化，只有标签与 S20 文案跟着变。
- 公共 API：`reactRules` → **`coreRules`**（从 `arch-guard` 与 `arch-guard/packs/core` 导出）；
  新增 `tsPack`。CLI 的兜底包**仍保持 `reactPack`** —— 忘了写 `packs` 的 React 宿主（会配 `uiKit`）不静默变红。
- 文档同步：PARADIGM §11（pack = 源码形态 + 两者今天共用规则集）、DESIGN §6.2 目录树 / §7.1 源码形态轴 / §7.5 pack 职责、
  CONTEXT 的 pack 词条、README 配置示例、AGENTS 目录表；新增 `tests/packs.test.mjs` 钉住
  「默认形态不是 react / 两包规则集一致 / packs 与 metaFramework 一处真相」。

### Added（可判定性的锚点写清）

- `docs/adr/0006-primitives-are-vocabulary.md`：十个检测原语是**分类词汇**，不是引擎里的一层（实现里没有 primitives 模块）。
  可机检的锚点是「`createRule()` 契约 + 每条规则的夹具对」；PARADIGM §3.1、CONTEXT.md、DESIGN §6.7 同步写明。
- **`tests/preset-matrix.test.mjs`：把 DESIGN §7.0.1 的「96 种组合穷举」从"手工跑过一次"变成回归保护。**
  逐条断言组合语义本身：`enable` 是各贡献者的**并集**（任取 'all' 则整体 'all'，且 32 个域子集必须给出 32 份不同规则集
  —— 谁都不能被顶掉）、`structure` 是**加法**、`roles`/`layout` 来自范式（域预设不许动）、
  落点**随范式**且域预设只写显式给的、同一预设写两遍幂等、范式两两混用 fail-closed、`disable` 在 registry 侧真的做减法。
- README「质量保障」补 P4 自检与 `pnpm check` 的实际链路；`/coverage.txt` 移出版本控制并加进 `.gitignore`
  （它是本地日志，README 的测试数/覆盖率数字跟着它一起过期过）。

### Changed（原子化收尾：落点不兜底、死参数删除、`all` 语义写清）

- **D 域落点不再兜底三根路径**：`designParams()` 只认项目/范式声明过的落点，依赖落点的 8 条规则
  （D03 / D06 / D07 / D08 / D10 / D10b / D16 / D21）改成 `requires: ['designSystem.<字段>']` —— 缺落点则**明列停用**。
  实测：`library() + designSystem()`（不声明落点）→ `因能力未声明而停用 8 条规则：D03 / D06 / D07 / D08 / D10 / D10b / D16 / D21`；
  以前它们会悄悄去量 `src/shared/styles`（只有 D21 的"零匹配"警告算线索）。
- **删掉三个没有消费者的参数**：`spacing` / `lengthProps` / `allowLengthValues` —— 它们是"魔法数字三族"（D12–D14）的输入，
  而那几条已委派 stylelint / eslint。实现时按 `requires: ['designSystem.<字段>']` 加回。
- **`enable: 'all'` 的语义写清并加测试**：它是"该 pack 的全部规则"（应用范式 `canonical()` 的有意默认）；
  收窄用 `disable`（减法），`overrides.enable` 是**整体替换** —— 三条都有单测钉住。
- 文档：DESIGN §7.0 组合语义表补 `all` 说明 + 新增「落点不设兜底默认」一条。

### Added（组合方案 `stack()`：原子预设 + 一层不含硬编码的糖）

- 新增 **`stack(options)`**：把域预设按需装配成 `presets: [范式(), ...stack({ … })]`。三条约束写进实现与文档：
  ① **不含任何硬编码**（组件库 / i18n 方案 / 语言 / 白名单 / 落点全部由选项传入，不传就用"声明空能力"的
  `noneKit()` / `noneI18nKit()` → 对应规则**明列停用**）；② **不引入新语义**（只是拼
  `designSystem()`/`copy()`/`deps()`/`hygiene()`/`i18n()`/`uiKit()`/`metrics()`，用户可以不要它、手写同样几行）；
  ③ **范式仍只有一个**（`stack()` 只管正交的域轴）。
- 顺手修掉一个语义 bug：`noneI18nKit()`（"项目不用 i18n"）以前也会被范式的 `params.i18nDir` 补上落点，
  于是 C 域照跑、C07 还会误报"声明了 i18n 却零资源"。现在**只在适配器声明了 i18n 库（`from` 非空）时才补落点**。
- 拆出 `presets/kit.ts`（`uiKit()` / `i18n()`），避免 `stack()` 与 `presets/index.ts` 循环依赖。
- 测试：`tests/stack.test.mjs`（6 条）—— 默认空能力 · 选项驱动 · 落点仍随范式 · 组合 = 各域并集 ·
  `hygiene: false` 与 `metrics` 按选项生效 · "不用 stack 手写同样几行结果一致"。
- 文档：README 配置模板换成 `...stack({ … })`；DESIGN §7 增「组合方案」小节；ALTERNATIVES §3.5 配方改用 `stack()`。

### Added（P4 自检：库名只许出现在数据表与适配器面）

- **兑现 docs/DESIGN.md §7.3 早就写下的承诺**：`engine/**`、`packs/**` 与通用预设（`presets/*.ts`）不得出现已登记库名，
  违反即门禁自身报错。`portability.ts` 以前只有 P1/P2/P3，所以库名可以随便躺在引擎里。
- 名单**不新增第二份**：从允许位置（`data/*` 与 `presets/<面>/*`）按约定登记（`from` / `packages` / `preferred` 数组，
  或常量名含 `Packages`/`Kits`/`Names`）**自己长出来** —— 新增 kit 自动纳入扫描。
- 只收**包名形状**的名字（`@scope/x`、含 `-`/`.`）：纯单词库名（`antd`、`bootstrap`）与项目里的槽位名无法区分
  （`canonical.ts` 的 `slot: 'bootstrap'` 就是误报来源），收了就是误报 —— 这条限制写进 hint 与 §6.7。
- 实测：往通用预设里注入 `from: ['react-i18next']` → `[P4] 库名只许出现在 presets/<面>/* 与 data/*：react-i18next`；撤销即恢复通过。

### Changed（库名归位：data 表 + 适配器面；i18n 拆成 kit；死声明清理）

- **`i18n` 适配器从通用预设里搬走**：`copy()` 现在**只贡献 C 域规则集**（不再内联 i18next 适配器、不再收 `resourceDir`/`languages`/`fn`/`hook`）。
  能力改由 `i18n(i18nextKit({…}))` / `i18n(noneI18nKit())` 提供 —— 与 `uiKit(adapter)` 完全同形，
  库名只出现在新的 `presets/i18n-kits/*`。修掉的旧后果：`--verify-deps` 拿 `from: ['i18next','react-i18next']`
  对账 package.json，项目换了 i18n 方案却还留着 `copy()` 就误报"声明了 i18next 却没装"。
- **引擎/框架包里的库名归位到数据表**：`engine/deps-audit.ts` 的 `KNOWN_KITS` 删除，改用既有的
  `data/kit-fingerprints.ts`（本来就是同一份数据的第二真相）；`packs/.../deps-adapters.ts` 的硬编码图标名单
  移到 `data/icon-packages.ts`。
- **删掉 `tokenPrefix`**：它没有任何消费者（D02/D18 未实现），而且是**宿主 superhive 的前缀**做通用/引擎默认 ——
  正是 P2 要防的那类宿主字面量。实现 D02/D18 时以 `designSystem({ tokenPrefix })` + 参数型能力加回
  （`registry` 新增参数型能力根：`designSystem.x` 读 `config.params.x`，缺它则规则**明列停用**）。
- **死声明清理**（按"声明必须有消费者"）：
  - 三个**零消费者** facet（`router` / `data-layer` / `styles`）从 `FACET_FIELDS` 与 `CAPABILITY_ROOTS` 删除；
  - `ui-kit` 的 `styleProps` / `policy` /（此前）`themeIntegration` 三个字段删除；
  - **`Pack.adapters` 从死声明变成 fail-closed 校验**：宿主配的 facet 必须被该 pack 支持，否则报错；
    react pack 的清单同时修正为 `['ui-kit','i18n','metrics']`（原来列了 3 个没人读的，反而漏了 metrics）。
- 测试/夹具同步：`tests/preset-compose.test.mjs` 的 i18n 用例改按新语义（`copy()` 不带适配器时**没有能力**、
  由范式补落点）、能力守卫表改成"谁负责**启用**规则"（`copy()` 而不是 kit）、`declared-gap` 夹具补上 i18next 依赖
  （P04 现在也拿 `from` 对账）。

### Changed（C 域预设**保持叫 `copy()`**：不加 `i18n()` 别名，改为让后果可见）

- 用户反馈"看到 `copy()` 想不到这是 i18n"。按设计逐条推：**预设名 = 域名 = 概念名**（域表是 S 结构 / D 设计系统 /
  **C 文案** / P 依赖 / H 反退化 / M 度量，只有 C、M 有同名预设）；`i18n` 是**机制名**（还绑 i18next），
  与"工具可替换、概念名优先"的取向冲突；而 `i18n = copy` 这种**别名让同一个东西有两个名字** ——
  正是这轮刚清掉的"第二份真相"（`config.layers` / `themeIntegration` / `languages`）。**所以不改名、不加别名。**
- 改成**让后果可见**：`copy({ languages })` 以前**没人读**（语言集合由磁盘扫描得出），
  "声明了 en 却没有 `en/`"完全无声 —— 而缺的那门语言在界面上会直接显示键名。现在 **C07** 增加第二个分支：
  **声明的语言必须有资源**（声明 ⇄ 事实，与 D21 / P11 同一形状）；总资源为零时仍只报一条（不往 C03 灌噪音）。
- 新增夹具 `__fixtures__/copy-langs` → 夹具回归 **27/27**；README 配置模板加了「预设 → 概念」目录；
  DESIGN §5.3 标明"copy = 文案，不是复制"。

### Docs（组合矩阵：96 种穷举实测）

- DESIGN 新增 §7.0.1：3 范式 × 5 域预设全部子集（96 种）**真实加载**的结果 ——
  单范式 + 任意域预设 **96/96 合法**；任取两范式 **3/3 被守卫拦下**；重复写同一预设幂等；
  域预设全开时落点仍随范式（`canonical` → `shared/styles`，`fsd` → `shared/ui/styles`）。
  另记三个"不是错误但要知道"的点：逐键覆盖类字段**顺序敏感**、库范式不声明契约落点（无能力则 skipped 明列）、
  `overrides` 是整体替换而预设之间是并集。

### Added（预设组合语义：范式唯一 + 落点跟范式 + `addRoles` 追加）

- **范式唯一性守卫（fail-closed）**：`presets` 里出现两个范式预设（如 `[canonical(), fsd()]`）→ `loadConfig` 直接报错并指路。
  以前是**静默错误组合**（实测：角色表取后者 36 条、`layout` 逐键混成库范式的空根、`structure` 取并集 → 门禁在量一个不存在的目录）。
- **契约落点改由范式声明**：`canonical()` 声明三根落点、`fsd()` 声明 FSD 落点（`src/shared/ui/styles/…`），
  `designSystem()` **只写用户显式给的路径**（不再塞三根默认值）。于是 `[fsd(), designSystem()]` 开箱就用 FSD 目录，
  以前会被悄悄改回 `src/shared/styles`（实测）。谁都没声明时仍由 `designParams()` 内置默认兜底 —— 与旧版行为一致。
  落点也跟着 `src` 走：`canonical({ src: 'app-src' })` → `app-src/shared/styles`。
- **`addRoles`（追加角色）**：项目在所选规范之外还有自己的目录（`src/legacy/**`）时，
  用 `overrides: { addRoles: [...] }` 追加即可，不必整份重写角色表（那样范式一升级就漂）。`roles` 仍是整体替换。
- 新增 `tests/preset-compose.test.mjs`（4 条）：范式唯一性 · 落点随范式 · 落点随 `src` · `addRoles` 追加与替换的分界。
- 文档：DESIGN 新增 §7.0「预设的组合语义」表（每个字段的合并规则）；PARADIGM §6.6 补一句；ALTERNATIVES §3.5 配方简化为
  `fsd() + designSystem()`（不再手写 6 条路径）。

### Fixed（i18n 落点也跟范式走：`copy()` 不再写死 `src/shared/i18n/locales`）

- `copy()` 以前把 `resourceDir` 写死成 `src/shared/i18n/locales` —— 与 `designSystem()` 塞三根默认值是同一类毛病：
  `canonical({ src: 'app-src' })` 时 i18n 目录**不跟着 src 走**。
- 修法：范式声明 `params.i18nDir`（`canonical()` / `fsd()` → `${src}/shared/i18n/locales`），`copy()` **只写显式给的** `resourceDir`，
  并在 `loadConfig` **一处补齐**（适配器没写就用 `params.i18nDir`）—— 能力判定 / i18n 索引 / 报告都只认一个完整的适配器。
- 库范式不声明 i18n 落点：`[library(), copy()]` 时适配器没有 `resourceDir` → C 域**因能力未声明而停用**（fail-closed 且可见），
  要跑就显式给 `copy({ resourceDir })`。
- 测试：`tests/preset-compose.test.mjs` 增 1 条（三根 / 自定义 `src` / FSD / 显式优先 / 库范式无能力 五种情形）；
  `tests/engine-report.test.mjs` 里那条"默认值"断言改成新语义（默认落点由范式给）。

### Fixed（`fsd()` 默认片段里有两个"按内容命名"的名字）

- 按社区官方 linter 的 [`segments-by-purpose`](https://github.com/feature-sliced/steiger/tree/master/packages/steiger-plugin-fsd/src/segments-by-purpose) 黑名单核对，
  `fsd()` 的默认片段里有**两个不合规**：`shared/assets` 与 `app/providers`（名单里明确列了 `assets` 与 React 的 `providers`）。
  默认值改成合规集 —— shared：`ui/lib/api/config/i18n`；app：`router/styles/i18n`。
- 需要这两个名字就显式加（一行）：`fsd({ sharedSegments: [...默认, 'assets'] })` / `fsd({ appSegments: [...默认, 'providers'] })`；
  这是**有意的摩擦**：默认值不该替项目"洗白"一个会被社区 linter 判为按内容命名的片段。
- 顺带记录一条容易误判的结论：**`styles` 不在黑名单里 → `shared/styles` 合规**（黑名单是穷举式，未列即允许）。
  文档：ALTERNATIVES §3.5 新增「片段名字要过 `segments-by-purpose`」小节（含完整词表与三种写法）。

### Removed（适配器里没人读的 `themeIntegration` 字段）

- **删掉 `uiKit` 适配器的 `themeIntegration` 字段**：它只在 schema 白名单与两个 kit 里出现，**没有任何规则读它**，
  而 DESIGN §7.1 的适配器契约表却写着它驱动 "exclusiveOwner（S03 落点 + D10 边界）" —— 文档在承诺一个不存在的判定。
- 更根本的理由：**第三方覆盖的落点与主题集成文件是项目决定，不是组件库事实**（同一个项目换库不该改变目录）。
  它由 `designSystem({ vendorDir, themeFile, ... })` 与目录规范声明，只有一处真相。
- ⚠️ 破坏性（fail-closed，不静默）：自定义 kit 若还写着 `themeIntegration`，`defineAdapter` 会因未知字段直接报错，
  删掉该字段即可。DESIGN §7.1 表格行与 §7.4 示例同步删除。
- 与 `uiKit()` 的 enable 修复同源：**每条声明都必须有消费者**（`config.layers` 那次的教训）。

### Fixed（`uiKit()` 只给数据不启用规则 → 适配器静默失效）

- **实测的静默失效**：`presets: [fsd(), uiKit(antdKit())]` 时 `.ant-btn` 出现在 vendor 之外**不报** ——
  `uiKit()` 只注册适配器，而读它的 5 条规则（`uiKit.vendorSelectors` → D10/D10b · `uiKit.icons` → P05 ·
  `uiKit.packages` → P11 · `uiKit.detachedApis` → H06）没被任何预设启用（`fsd()`/`library()` 的 enable 是白名单）。
  加上 `designSystem()` 才报 —— 说明这是"谁声明域、谁顺带启用"的偶然，不是设计。
- **修法**：`uiKit()` 声明自己贡献的规则集（与域预设同一套"声明即启用"语义，取并集）；是否真的跑仍由**能力协商**决定。
  修复后同一配置 13 → **18 条规则**，D10 正常报出。
- **新增通用守卫测试**「能力提供者必须启用消费它的规则」：遍历所有带 `requires` 的规则，断言提供该能力的预设
  （`copy()` / `metrics()` / `uiKit()`）确实启用了它 —— 这类"装了适配器却没人读"的漏洞以后会被测试拦住。

### Added（`fsd()` 预设：FSD 从 38 行角色表变成一行）

- 新增 **`fsd()`**：把 Feature-Sliced Design 的三层模型全部落成**数据** ——
  层 → `layer` 层号 · 切片 → `group: 'slice'` · 片段 → **封闭枚举** · 公开面（切片根 `index.ts`）→ `entry: true`；
  三条结构规矩由通用规则判：`structure: { order: true, isolate: ['slice'], publicApi: ['slice'] }` → **S21 / S22 / S23**。
  **引擎里没有一行 FSD 字面量** —— 换范式只是换预设那一行。
- 选项：`src` / `slicedLayers` / `appLayer` / `sharedLayer` / `segments` / `sharedSegments` / `appSegments`，
  以及 `slicesGrouped`（分组切片 `features/auth/login/...`）。**分组必须显式打开**：两种形态无法用一组 glob 同时表达
  （`{group}/{slice}/{seg}` 会把不分组的路径也匹配上 → 角色歧义）。
- **决策反转并记录**：结构声明化之前定的"不内置 FSD 预设"是错的 —— 预设层本来就是**规范的家**（`canonical()` 也是规范），
  让每个宿主手抄 38 行角色表才是重复劳动；引擎的零方法论字面量由 P2/P3 自检保证。
- 夹具 [`__fixtures__/fsd-preset`](./__fixtures__/fsd-preset)：一份完整 FSD 项目（合规文件 + 四类违规）→ 夹具回归 **26/26**；
  预设结构测试进 `tests/presets.test.mjs`。
- 文档：ALTERNATIVES §3.5 改成"FSD 就这么配"（原手写配方收进 `<details>`）；DESIGN §7 预设列表与 PARADIGM §6.6 同步。

### Docs（口径修正：不再把 steiger 当 FSD 的必经之路）

- [ALTERNATIVES.md](./docs/ALTERNATIVES.md) §3.3 加前置说明：结构声明化落地后**我们自己就能表达 FSD**（S21/S22/S23），
  这一节只适用于**已经在用 steiger** 的宿主；新项目走 §3.5 的声明配方即可，不必引入第二个工具。
  （原先"结构归 steiger"的前提是"我们不管目录规范"，该前提已被结构声明化推翻。）

### Changed（层序只剩一套机制：`canonical()` 也走通用规则，S07 删除）

- **`canonical()` 现在声明 `structure: { order: true }`** —— 应用范式的层序改由通用的 **S21** 判定，
  原先 shared 专属的 **S07 删除**（规则 56 → **55**，`__fixtures__/graph` 的两条期望随之改为 S21）。
- **顺带补上一个真实漏洞**：S07 只管 shared 内部，所以 `shared → modules`（低层依赖高层）与 `modules → app`
  这两类向上依赖**以前没人管**；S21 判的是"只许依赖层号 ≤ 自己的文件"，把它们一并抓住。
- **不重复报**：S21 只在 `to.layer > from.layer` 时触发，而 S05/S06（域间，同层）与 S09（layouts → modules，向下）
  都在别的方向上，所以一条边仍只被一条规则报。
- 域与装配层的**关系**（域间只能经 routes、layouts 不许引域、有 views 必有 routes）仍归 S04–S09/S14 ——
  那些不是层序，声明表达不了。
- ⚠️ **迁移提示**：宿主基线里若有 `S07` 条目，会作为「过期条目」被棘轮提示删除（可见，不静默）。

### Added（结构声明化：目录规范变成宿主可声明的数据，S22/S23）

- **`StructureSpec` 三个字段，各有一条规则消费**（不做"声明了没人读"的配置 —— `config.layers` 那次的教训）：
  - `structure.order: true` → **S21 层序单向**（门控从"猜 `layout` 是否为空"改成**读声明**）；
  - `structure.isolate: ['slice']` → **S22 组隔离**：同组维度、同层、不同组之间不许互相引用；
  - `structure.publicApi: ['slice']` → **S23 公开面**：组必须有入口文件，且组外不许直接引用组内非入口文件。
- **组与入口都是角色表里的数据**：`{ pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' }` 声明组维度，
  `entry: true` 标记入口（三根是 `routes.tsx`、FSD 是 `index.ts`）—— **规则不认识任何具体文件名**，引擎里没有方法论字面量。
- **引擎**：`FileRecord` 新增 `captures`（全部 `{name}` 捕获）/`group`（组值）/`groupName`（维度名）；
  `RoleDescriptor` 新增 `group` / `entry`；`Preset.structure` 与 `overrides.structure` 之间**加法合并**；
  S21–S23 抽到 `src/packs/react/rules/structure-declared.ts`（"声明驱动"一组）。
- **"目录枚举"这个原定缺口被设计消解**：组由文件派生（没文件的目录不构成组），"组缺入口"用文件集就能判 —— 少一处引擎改动。
- **验收**：夹具 `structure-isolate`（S22）与 `structure-public-api`（S23，顺带覆盖 `{slice}` + `{segment}` 多捕获）→ 夹具回归 **25/25**；
  新增单测「同一份引擎换范式」：用 `atoms/molecules/organisms` 三个**声明**层跑 S21，违规必报且**引擎零改动**。
- **文档**：DESIGN 新增 §6.2.1 结构声明、§5.1 加 S22/S23、§7 示例补 `structure`（并修正 `copy` 参数名）；
  PARADIGM 新增 §6.6「结构声明：范式是可换的数据」（含 L1–L3 硬边界）；ALTERNATIVES §8 标为**已实现**；
  规格 `.scratch/structure-as-data/spec.md`（done）。规则总数 54 → **56**。

### Added（S21 分层单向：`library({ modules })` 的层号不再只是声明）

- **新增 `S21`**：只许依赖**层号 ≤ 自己**的文件（`to.layer > from.layer` 即报）。
  它是 `library({ modules: { data: 1, engine: 2 } })` 里那些数字的**唯一用途** ——
  在此之前层号被写进 `record.layer` 却没有任何规则读它（唯一的消费者 S07 是 shared 专属，
  而库范式把 `layout.shared` 置空 → 恒不生效）。实测证据：**把层号倒过来，输出一模一样**。
- **自带一道门**：`layout.modules` / `layout.shared` 非空时（应用范式）直接跳过 ——
  应用范式的层序已由 S07（shared 线性层序）+ S04–S09（域/装配层）负责，不重复报同一条边。
- 哨兵层（`test` = 99）跳过：测试可以引用任何东西，不算"向上依赖"。
- 文档补了「用现有能力定义 FSD」的实测（[ALTERNATIVES.md](./docs/ALTERNATIVES.md) §3.5）：27 条角色描述符能钉住层封闭枚举 + 片段封闭枚举 + 层序；
  同层切片互不引用与公开面定义不了（根因：`{slice}` 捕获被丢 + 缺公开面规则）。
- 新增夹具 `layer-order`（`exact: true`：low(1) 引 high(2) → 恰好一条 S21）+ 门控单测；
  `library()` 的 enable 列表加入 `S21`。

### Fixed（`enable` 取并集 + `disable` 减法：预设组合不再静默关域）

- **`enable` 从"后者覆盖前者"改成"并集"**：多个预设各自声明自己贡献哪几条规则，组合是加法。
  旧行为的真实后果：`library({ modules }) + designSystem() + copy() + deps()` 只启用 **10/53** 条 ——
  D/C/M 域被静默关掉，宿主必须手抄一份 40 个 id 的并集才跑得起来（FSD 配方就是这么被逼出来的）。
- **各域预设补上"贡献声明"**：`designSystem()` → D 12 条 · `copy()` → C 6 条 · `deps()` → P 7 条 ·
  `metrics()` → M 8 条 · `hygiene()` → H06；`canonical()` 显式声明 `enable: 'all'`（应用范式默认全开）。
  并新增守卫测试：每个域预设的 enable 列表必须**等于**该域已实现的规则集，防止"加了规则没挂进预设"。
- **新增 `disable`**（预设与 `overrides` 都取并集）：`enable` 求完之后再减 —— 例如 FSD 宿主想保留具名导出时
  `overrides: { disable: ['S11'] }`。
- `overrides.enable` 语义不变：仍是"我全都要自己定"的整体替换开关。
- 文档同步：[ALTERNATIVES.md](./docs/ALTERNATIVES.md) §3.3 的 FSD 配方去掉了 40 个 id 的并集、§3.4 的阻塞点标为已修；
  PARADIGM §11.1 补上"预设各贡献规则集并取并集"的语义。

### Docs（"兼容所有规范的引擎"先例调研）

- [ALTERNATIVES.md](./docs/ALTERNATIVES.md) §8 补上先例：这类引擎在 **ArchUnit（Java）/ import-linter（Python）/
  go-arch-lint（Go）/ Nx tags（JS monorepo）** 早有成熟实现，且抽象出的都是同一个形状（映射 / 关系 / 层序 / 公开面）——
  也就是 §8 的四个字段。JS/TS 侧只有"半个"（`@boundaries/elements` 99 万/周、`dependency-cruiser` 287 万/周、
  `eslint-plugin-project-structure` 4.9 万/周），`archlint` 已停更。
- 记下硬边界与可验收定义：**只能兼容规范的可判定部分（L1–L3）**；验收 = 同一份引擎用三份声明表达
  三根 / FSD / Atomic Design 且夹具各自通过、引擎零改动。

### Docs（steiger + 我们的实测配方）

- [ALTERNATIVES.md](./docs/ALTERNATIVES.md) §3.3/§3.4 换成**实测通过的配置**：依赖安装（npm 只装 steiger；pnpm 必须显式装
  `@feature-sliced/steiger-plugin`）、`steiger.config.mjs`（`.js` 且无 `type: module` 会报 `Failed to load the ES module`）、
  我们这侧的 `library({ modules: 六层, entry: [] })` + 契约预设 + `disable: ['S21']`。
- 记录一条方法论纠正：**steiger 在场时不要用 27 条细粒度角色表**（会与 `segments-by-purpose` / `public-api` 重复报），
  粗粒度六层足够 —— 我们只兜"层外文件"与跨文件契约。
- 实测分工：steiger 14 条（层序/跨切片/公开面/死切片/片段命名）vs 我们 10 条（层外文件 + 死令牌 + 文案 + 依赖），**零重叠**；
  其中 `src/utils.ts`（层外文件）**steiger 零命中**，只有 S01 抓得住。

### Added（`docs/ALTERNATIVES.md`：替代组合与竞品盘点）

- 新增一份整体版生态审计（[ECOSYSTEM-AUDIT](./docs/ECOSYSTEM-AUDIT.md) 的补充）：
  逐条列出我们的判据在生态里谁在做（含周下载量）、**拼一套成熟组合能覆盖 ≈30/53 条**、
  以及**任何组合都补不上的七项**（跨文件令牌图 / 跨语言一致 / 声明⇄事实 / 依赖选型体系 / 统一棘轮 / 判定纪律 / CSS Module 契约）。
- 收录实测证据：steiger 在非 FSD 项目上给 **`✔ No problems found!`（静默假绿，退出码 0）**，同一个工具在 FSD 项目上报 10 条；
  eslint 的 suppressions 是 `文件+规则→计数`（**按计数不按行**，修一处可在别处加一处），与我们的行文本锚点形成实质差别。
- 收录 FSD 场景的完整配方（路径约定表、`steiger.config.js`、`library({ modules: 六层, entry: [] })` + 契约预设、四个坑），
  以及「结构声明化」方向草案（`structure: { order, isolate, publicApi, slots }` + 四条方法无关的通用规则）。
- 已知阻塞点也写进去了：**`enable` 是覆盖不是并集** —— 不写并集时 `library()` 的白名单会把 D/C/M 域静默关掉（实测 10/53）。

### Changed（依赖政策：P1 从"零依赖洁癖"改成"审查门"）

- **"整目录可搬"不再是发布形态**（本包以 npm 包发布），所以 P1 的理由改成真实的那个：
  门禁读全量源码、跑在 CI —— **新增依赖要有理由，且不得把宿主拖进版本冲突**。
  要加依赖：改 `ALLOWED_BARE_IMPORTS` + `package.json` + CHANGELOG，P1 的报错话术同步改成「依赖没登记」。
- **P2 / P3 保留**，但把理由写对：它们与发布方式无关 —— P2 是「换宿主不改引擎」，P3 是「引擎不假设布局」
  （`canonical` / `library` / 自定义目录全靠它，今天刚靠它抓到 `rootsOf` 写死 `src/modules` 的假绿）。
- README「本体自包含（可抽取）」→「**引擎不绑宿主**」；`CONTEXT.md`、`DESIGN` §0/§6.1.1/§7.1/§7.4 的措辞同步校正。

### Fixed（`globToRegExp` 花括号里的点号没转义）

- `{index.ts,cli.ts}` 会被编译成 `(?:index.ts|cli.ts)` —— 里面的 `.` 是**任意字符**，
  能匹配到 `indexXts`。现在花括号分支逐个转义正则元字符（`{ts,tsx}` 这类无点号的写法不受影响），并加测试锁住。
  之前 `library()` 的入口就是绕开了这个写法才没踩到。

### Added（oxc spike：结论是**不换 parser**）

- 量了（[.scratch/oxc-spike/](./.scratch/oxc-spike/spec.md)，脚本可重跑）：真实规模 3044 文件 / 9.8 MB 下，
  `oxc.parseSync` 比 `ts.createSourceFile` 快 **2.2×**（511ms vs 1133ms）—— 但**解析只占 extractFacts 的 32%**，
  换 parser 的端到端上界只有 **≈17%**；26k 小文件上更是 **≈1%**（每文件开销主导）。
- **真正的大头是我们自己的访问器 + 注释扫描（2.4s / 3.6s = 67%）**，换 parser 还要把这段在 oxc 的 AST 上重写一遍，
  外加 native 多平台二进制与缓存键变更。所以 `DESIGN` §6.1.1 的 oxc 行改成「可再评估」并指向 spike 结论。
- 力气挪到自有代码：注释扫描按需、`containsJsx` 自底向上标记、主循环按 `node.kind` 分派（见 spike 的「下一步」）。

### Changed（canonical 对齐：删死配置、提示指路、跨域组合拍板）

- **删掉 `layers`**（`Preset.layers` / `Config.layers` / `canonical()` 里那 12 行）：全仓没有任何规则读它 ——
  S07 用的是角色描述符上的 `record.layer`。留着就是第二个层号真相 + 一个没人读的配置面。
- **删掉 DESIGN §7 示例里的 `semanticSlots`**：消费它的 D20 从未实现，示例却把它写得像可用配置。
- **S01 / S03 的提示改成「指路」**：按文件位置直接念出落点表 —— `app/providers.tsx` → 「装配套壳写进 App.tsx，
  配置对象下沉 shared/」，`modules/<域>/types.ts` → 「域根只放 routes.tsx，类型与常量进 model/」，
  没登记的槽位 → 念出域内七个槽位，`shared/components/Button.tsx` → 「进 ui/ 或 common/」。
  闭集枚举只说"你错了"没用，迁移中的人（或 agent）要知道"放哪"。
- **R1 拍板（方案 c）**：跨域组合一律**提升**到 `shared/components/common`（业务中立组合件）或
  `shared/api`（数据契约），由 `app` 层组合；域间直连继续红（S04–S06）。
  被否的替代：给域开第二个公开面 `index.ts` —— 深模块会变成两个出口。已写进 PARADIGM §6.3，DESIGN §14 的 R1 标为已拍板。

### Fixed（layout 是唯一真相：自定义目录不再假绿）

- **`canonical({ modules, shared })` 之前是假旋钮**：角色表跟着参数变了（S01 不再报"无处安放"），
  但 S04–S09 / S15 / S18 / S03 还写死查 `${srcRoot}/modules` 与 `${srcRoot}/shared` ——
  查一个不存在的目录 → 静默空转 → 跨域引用私有 views **一条都不报**，门禁显示"通过"。
  实测 A/B：同一份违规，目录叫 `src/modules` 报 S05+S06，配置成 `src/features` 时零报告。
  现在这四处（`structure-graph.ts` 的 `rootsOf`、`structure.ts` 的 S03 / S01 域根豁免）一律读 `config.layout`。
- 新增夹具 `canonical-layout`（`exact: true`）：自定义 `modules: 'src/features'` 下，跨域引用必须报 S04/S05/S06。

### Changed（`library()` 变成真正通用的库范式）

- **角色表参数化**：`library({ modules: { utils: 1, core: 2 }, entry: ['index.ts'] })` ——
  库的结构就是「公开面入口 + 项目自己声明的目录表」。旧版把**本体的目录名写死**在预设里
  （`engine/` `packs/` `presets/` `data/`、入口写死 `cli.ts`、ignore 里一串宿主文件），
  任何第三方库用它都会得到一片 S01（实测：普通库的 `src/utils/`、`src/core/`、`src/types.ts` 全报）。
- **`layout.modules` / `.shared` 置空**表示「库没有域与共享层这两个应用概念」——
  依赖它们的图规则因此自然空转，而不是去查一个不存在的目录假装检查过。
- 内部目录角色**不设 `slot`**：目录名恰好叫 `lib` / `hooks` 时不会误套应用范式的槽位语义（S12/S13 会误判）。
- 宿主专有的 ignore（`es/**`、`examples/**`、`__fixtures__/**`、`pagoda.config.mjs` …）从预设移出，
  本仓库在 `arch.config.mjs` 里显式声明 —— `ignore`（别碰）与 `include`（不判契约但仍解析）是两件事，
  只靠 `include` 会让这些文件照样被解析（实测狗粮 71 → 340 个文件）。
- 新增夹具 `library-generic`（`exact: true`）：一个普通第三方库形态的 `src/index.ts` + `src/utils/` + `src/core/`，零发现项。

### Added（P11：组件库适配表声明了却零使用）

- **`P11`**：声明了 `uiKit(antdKit())`，但项目里既没 import 它声明的任何包、也没有任何 vendor 选择器/变量
  → warn。此时 D10 / D10b / P05 / H06 全在空转，门禁却显示"通过"。
  与 P04 的分工：**P04 管「声明了要装、装了要登记」（清单一致性，error）；P11 管「装了要真的用得上」（事实存在性，warn）**。
  `uiKit(none())`（`packages: []`）能力不存在 → 规则不注册，不会给不用组件库的项目添噪音。
- `declared-gap` 夹具扩成三面齐活：`copy()` 零资源 + `designSystem()` 零路径 + `uiKit()` 零使用 → 恰好三条 warn。

### Added（C07 / D21：声明了能力面却零事实，不再静默空转）

- **`C07`**：加了 `copy()` 但 `resourceDir` 下一个文案文件都没有 → warn。
  能力协商只保证「**没声明**就不注册」；声明了却没有对应事实时，C02–C06 会安静地遍历空集合、
  门禁显示"通过" —— 这正是「以为在跑、其实没跑」。
- **`D21`**：加了 `designSystem()` 但 `paletteFile` / `tokenDir` 零匹配 → warn。
  靠 `params.designSystemDeclared` 显式标记把「没声明设计系统」（应当安静）与「声明的路径写歪了」
  （必须报）分开 —— `designParams()` 带内置默认路径，光看参数分不出来。
- 新增夹具 `declared-gap`（`exact: true`）：两处路径都指空，恰好两条 warn。
- 顺带澄清：**`P03` / `P08` 按 DESIGN §4.9 委派给 knip · depcheck，本体不实现** ——
  `__fixtures__/deps` 的 `enable` 里还点着它们、README 与 DESIGN §16.5 说它们"已落地"，都已改正。

### Fixed（`designSystem()` 的配置根本没生效）

- **`designParams()` 只展开 `DEFAULTS`，从未把宿主的参数盖上去**，于是 `tokenPrefix` / `spacing` /
  `styleDir` / `tokenDir` / `vendorDir` / `paletteFile` / `themeFile` / `storageFile` 八个字段的配置
  **全部被静默忽略**：D03 这类规则照默认路径找不到文件，就静默 `return []`，门禁还显示"通过"。
  现在逐字段解析（可配清单在代码里可见），并把不相关的 `params` 键挡在 `DesignParams` 之外。
  这是 D21 能报出正确路径的前提。

### Added（facts 持久缓存：重复运行 ≈5×）

- 新增 `src/engine/facts-cache.ts`：把每个文件的解析结果（facts）按 **rel + role + 内容 sha1** 缓存到磁盘，
  下一轮没变的文件直接读缓存、不再解析。整份缓存的键是 `FACTS_CACHE_SPEC` + TypeScript 版本 ——
  事实模型或解析器换了就整体作废。图与全局谓词**不在缓存里**，每轮照旧从 facts 重建（保住「scope 只过滤报告」的语义）。
- **实测**（3043 个 ts 文件 / 21.5 万行）：冷跑 5.88s → 热跑 **1.22s（4.8×）**；
  26k 个**小**文件仓库 4.0s → 3.1s（−23%，文件越小解析越便宜，缓存能省的自然越少）。
- **缓存写在哪**：跟 Vite 同一策略 —— 有 `node_modules` 就写 `node_modules/.arch-guard-cache/facts.json.gz`
  （天然被 git 忽略、`rm -rf node_modules` 顺手带走），没有 `node_modules`（PnP / monorepo 子包）则退回项目根 `.arch-guard-cache/`。
- 每次运行自述**命中数与路径**；`--no-cache` 关掉；缓存损坏 / 版本不符 → 整份作废并说明原因；
  写不进去（只读盘、权限）只提示、不影响判定 —— 缓存是加速手段，不是正确性依赖。
- 7 条测试锁住：全命中、**改内容必重算（防假绿）**、role 变化重算、损坏与版本不符作废、
  `--no-cache`、`node_modules` 位置、落盘内容带 spec + ts 版本。

### Changed（框架包接进配置：规则集不再硬编码）

- **`arch.config.mjs` 支持 `packs: [reactPack]`**：规则集由框架包给出，`cli.ts` 不再硬编码 `reactRules`，
  只提供**兜底包**（引擎不认识任何 pack —— 依赖方向是 pack → 引擎）。
- **`Pack` 新增必填 `framework`**：它实现哪个元框架。于是 `metaFramework` 与 pack 不再可能各写一份：
  配了包就以包为准；两边都写且不一致直接报错。这消掉了上一版刚引入的「两处真相」。
- **一个项目只允许一个包**：换元框架是换 parser 与整套规则集，不是叠加；多包直接报错并指向 DESIGN §7.5。
- **没有任何包又没有 rules 时明确报错**，而不是「跑 0 条规则 → ✔ 通过」。
- `runGuard` 的 `rules` 变为可选（程序化调用/单测显式给规则集的路径不变），新增 `fallbackPacks`。

### Added（`metaFramework` + S20：非 React 项目不再假绿）

- **新增配置轴 `metaFramework`**（默认 `react`），取值表在 `src/data/framework-sources.ts`（纯数据，引擎里不出现框架名）。
  认不出的取值、或**还没有 pack** 的框架（`vue` / `svelte` / `astro`）一律 fail-closed 报错。
- **为什么这是红线**：`.vue` / `.svelte` 本来根本不在扫描扩展名里（`walk` 只收 ts/tsx/js/jsx/mjs/cjs + css/scss/less + json/html），
  于是拿 Vue 项目跑会得到「扫到 0 个文件 → **✔ 架构守卫通过**」—— 一行都没查还说通过了，正是本工具最反对的假绿。
- **新增规则 `S20`（框架包必须覆盖项目的源码形态）**：项目里混进当前 pack 量不了的源码即报，
  并列出 `扩展名 × 个数`。这些文件不会混进文件集参与图判定。
- 新增夹具 `framework-gap`（`exact: true`：一个 canonical 工程 + 一个 `.vue` 页面 → 恰好一条 S20）。
- 顺手补回 `__fixtures__/clean/src/shared/lib/format.ts`：`clean` 夹具的 `CrewsPage.tsx` 一直在 import 它，
  但文件同样被 `.gitignore` 吞掉，留下一个悬空引用（不报错、所以没人发现）。

### Added（S19 导出宽度与单文件组件数）

- **新增 `S19`**：单文件导出值 > `exportsPerFile`（默认 6）或单文件组件数 > `componentsPerFile`（默认 3）即报。
  「导出值」不计类型导出（类型是契约，不是宽度）。
- **只属于应用范式**：`canonical()` 默认开（`enable: 'all'`）；`library()` 的启用名单里没有它 ——
  库的入口 `src/index.ts` 就是公开面，导出几十个符号是正确形态（实测：按 error 直接落到库里会先把狗粮自己打红 9 个文件）。
  这是 ADR-0003「规则集必须跟着工程类型走」的又一次应用。
- 新增夹具 `width`（`exact: true`）：`shared/lib/many.ts` 7 个导出值、`shared/components/ui/Multi.tsx` 4 个组件，
  两个文件都接进可达图以免顺带触发 S15。
- 顺手修文档漂移：`DESIGN.md` §5.1 那句「已实现并带夹具的规则：…H01–H05」早已不准，
  改为以 `reactRules` 为准的 49 条清单，并写明 `S08` / `S10` / `P03` / `P08` 是**委派**而非漏实现。

### Changed（删掉没人读的配置旋钮）

- **删掉 `naming.pageComponentSuffix`**：全仓 grep 没有任何规则读它（`hookPrefix` / `viewSuffix` 有），
  属于「以为在管、其实没管」的假旋钮。`Thresholds.exportsPerFile` / `componentsPerFile` 这次补上了实现（见 S19）。

### Changed（范式补一条：全局 Provider 装配放哪）

- `PARADIGM.md` §6.4 唯一落点表新增两行，并把 React 习惯的 `app/providers.tsx` 写进反例表：
  **套壳写进 `app/App.tsx`，provider 的配置对象各自回家**（queryClient→`shared/api`、theme→`shared/theme`、
  i18n→`shared/i18n`、store→`shared/stores`）。
  不为此给角色表开通用口子 —— app 层仍是封闭枚举，`App.tsx` 只留几十行嵌套，也撞不到 S16 的 500 行。

### Added（契约扫描域 `include`）· 行为变更

- **新增 `include`**（配置根相对的 glob 列表，[规格](./.scratch/include-scope/spec.md)）：只有命中它的 ts/css 参与角色判定与逐文件规则。
  域外的 `vite.config.ts` / `e2e/` / `scripts/` / 生成代码**不再被报「不在目录契约内」**。
  实测把 2 万个生成文件放进项目：**20000 条 error → 0**。
- **`canonical()` / `library()` 默认 `include = [<srcRoot>/**]`**（行为变更：域外文件不再进 `missing`）。
  `overrides.include` 可覆盖，空数组 = 不限制（引擎默认）。报告摘要与 notice 会自述扫描域与域外文件数，不静默。
- 域外文件**照常解析**（角色记为 `(outside)`）：import 边与「测试是独立可达根」都靠 facts，
  少了它们，只被域外测试引用的 src 文件会被误判成孤儿（S15）。这条是夹具当场抓出来的。
- `M08`（该有测试的文件）改从**完整文件集**找测试文件：测试常放在契约域之外（`tests/`），
  它们没有角色、不进 `records`，但「有没有测试」必须看得见。
- 新增夹具 `include-scope`（默认域外不报，`exact: true` 锁零发现项）与 `include-custom`（`overrides.include` 把 `scripts/**` 纳回契约 → 重新报 S01）。

### Changed（性能：解析热路径瘦身，实测 −20%）

基准：`canonical() + hygiene()` 合成宿主，3043 个 ts 文件 / 21.5 万行，全量运行。

- **`createSourceFile` 改用 `setParentNodes: false`**（`docs/DESIGN.md` §6.1.1 本来就写的是 false，代码写成了 true）。
  只有 3 处需要父节点（字符串字面量的上下文、`prop` 名、箭头函数的变量名），改为在遍历时**显式传参**，
  不再让 TS 给每个节点都挂父指针。累计 **5.75s → 4.63s**。
- **删掉 5 组零消费者的 facts 字段**：`jsxText` / `catches` / `inlineStyles` / `anyNodes` / `nonNull`。
  对应的 H01（`any` / 非空断言）、H05（空 catch）、D15（内联样式）、C01（JSX 裸文本）早已
  [委派给 eslint 并从规则集删除](./docs/ECOSYSTEM-AUDIT.md)，收集代码却留了下来 —— 每次全量解析都在为没人读的字段付钱。
  `Facts` 类型与 `__fixtures__` 的断言同步收缩，并在 `extractFacts` 上写明「加字段前先确认有规则在读」。
- 两部分合计 **5.75s → 4.63s（−20%）**，峰值内存 277MB → 264MB。

### 补齐的夹具（曾被 `.gitignore` 吞掉，按 `expect.json` 的期望重建）

`violations` / `adapters` / `graph` / `hygiene-context` / `rules` / `coverage` 六组共 14 个文件：

| 夹具              | 补回的文件                                                    | 触发的规则      |
| ----------------- | ------------------------------------------------------------- | --------------- |
| `violations`      | `src/shared/lib/helpers.ts`（barrel + default 导出 + 孤儿）   | S11 / S13 / S15 |
| `adapters`        | `src/shared/lib/helpers.ts`（弱指纹 + `debounce` 命名指纹）   | P07 / S15       |
| `graph`           | `format.ts`（lib 反向依赖 api）、`leftover.ts`、`crewOnly.ts` | S07 / S15 / S18 |
| `hygiene-context` | `datetime.ts`、`fixtures.ts`、`timers.ts`（孤儿）             | S15             |
| `rules`           | `big.ts`（49 行 > 夹具阈值 40）                               | S16             |
| `coverage`        | `good.ts`、`bad.ts`、`zero.ts`                                | M02 / M03 / M08 |

> 这些文件是**按 `expect.json` 的期望反推重建**的，不是原作者的原始内容；原作者若手上有原件，可以直接覆盖比对。

## [0.2.3] - 2026-09-23

### Changed（依赖策略：能力表不再隐式开启 P01）· 行为变更

- **`deps({ capabilities })` 不再顺带打开 `P01` 依赖白名单**（[ADR-0005](./docs/adr/0005-allowlist-is-explicit.md)）。
  旧实现 `approved = allow ∪ capabilities.values` 以 `approved.size` 判空，于是「只限定日期格式化用 dayjs」
  写成 `deps({ capabilities: { datetime: 'dayjs' } })` 等价于宣布「批准清单里只有 dayjs」——其余运行时依赖全部报红。
  现在 `P01` 的开关是 `allow` 是否显式声明，能力表只驱动 `P06`。反重复不受影响：`policyConflicts` 仍要求
  `allow` 非空时能力首选必须登记在 `allow` 里。
- **批准名单的组成 = `allow ∪ 适配表声明的 packages`**：`uiKit(antdKit())` 这类适配器已经声明了「项目用什么库」
  （P04 读同一份数据），组件库不必在 `allow` 里重抄。适配表只**并入名单**，不打开 `P01` —— 开关仍然只有 `allow`。
- 不静默：`runGuard` 在「有 capabilities、无 allow」时打印 notice，说明 P01 未开启、如何显式开启。
  配置格式未变，故未 bump `CONFIG_SPEC_VERSION`。
- 夹具 `__fixtures__/declarations-only` 锁住「只写声明不开 P01（P06 必报 × P01 不报）」，
  `__fixtures__/allowlist-adapters` 锁住「适配表的包被批准（`exact: true`，多一条即失败）」。

## [0.2.2] - 2026-09-23

### Fixed（第三轮：审计修正）

- **`C02` / `C06` 恢复实现**：`t()` 的键存在性与死键检查回到本体，0.2.0 里「删除 `C02`（键存在）、`C06`（死键）」
  那一条随之作废。删除理由写的是「`eslint-plugin-i18next` 能覆盖」，但实测该插件只有 `no-literal-string`
  一条规则（`Object.keys(plugin.rules)`），`no-missing-keys` / `no-unused-keys` 根本不存在 ——
  于是键拼错（界面直接显示键名）与死键成了没人守的两件事。
- 文档同步更正：`docs/ECOSYSTEM-AUDIT.md` §1 / §4（补一行 C02 / C06 的交叉判定）、
  `docs/DESIGN.md` §4.9（C01 的委派对象只有 `no-literal-string`）与 §14（D / C 域的落地状态）。
- `library()` 预设去掉指向已删除规则的 `H02`，自身 `pnpm guard:self` 不再报「配置里启用了不存在的规则」。
- 规则总数 46 → **48**（C02 / C06 回归）；0.2.0 里几处「精简到 42 / 44 条」是更早的旧账，实际以 `--stats` 为准。

## [0.2.1] - 2026-09-23

### Fixed

- **`--paths` 接受绝对路径**（IDE / 编辑器插件按文件传参的形态）：之前只按配置根相对路径匹配，
  诊断工具传绝对路径时一条都匹配不上 → 门禁报「通过」但其实什么都没查（静默假绿）。
  新增 `rootRelativePattern()`：绝对路径 / 绝对 glob 归一到配置根相对（含 `/var` ↔ `/private/var` 软链写法差异），
  相对模式原样。
- **`--paths` 过滤掉全局违规时给出 notice**：`另有 N 条全局违规（架构级）被过滤，需全量运行才可见` ——
  否则「按文件跑」会让人以为架构级谓词也过了。

## [0.2.0] - 2026-09-23

### Added

- **design 域 12 条规则（D01–D11 + D10b）**：颜色唯一出处、色板只放色板令牌、色值唯一、令牌引用闭合、
  无死令牌、明暗双份齐全、对比度基线（WCAG + 半透明合成）、storage key 与 index.html 一致、禁 `!important`、
  组件库选择器只许在 vendor、vendor 目录反向封闭、无框架残留。
- **copy 域 C02–C06**：文案键必须存在、多语言键一致、一文件一命名空间、分片必须被聚合入口引用、无死键（warn）。
  C01（JSX 裸文案）委派给 `eslint-plugin-i18next` 的 `no-literal-string`。
- **CSS 结构化解析器**（`src/engine/css.ts`）：注释遮罩、块与选择器、自定义属性定义/引用、颜色求值与对比度。
- **i18n 资源索引**（`src/engine/i18n.ts`）：用 TS 解析器把 `locales/<lang>/<ns>.ts` 解析成键路径。
- `copy()` 预设改以 **i18n 适配器**声明能力（`requires: ['i18n.resourceDir']`），未声明时规则出现在 `skipped` 而不是静默失能。
- `CallFact` 增加 `stringArg` / `keyPrefix`（动态键 `t(\`ns.${x}\`)` 按静态前缀放行死键判定）。

- **structure 域补齐 S03–S09/S15/S17/S18**：域根只许 routes、域内 import 前缀白名单、跨域只经 routes、
  views 域外私有、shared 线性层序、全图无环、layouts 不 import modules、可达性三查（孤儿/routes 聚合/view 引用）、
  导出名查重、shared 单域使用。
- **design 域补齐 D12–D18**：魔法长度/层级/时长、内联样式纪律、样式落点、CSS Module 双向契约、只消费语义令牌。
- **deps 域补齐 P04/P05/P07**：适配表与实际依赖一致、图标来源唯一、弱指纹+命名指纹的疑似自造轮子。
- **hygiene 域补齐 H06–H10**：脱离上下文的全局 API、假异步与随机、硬编码地址、静默假数据、手搓时间格式化。
- **S02 目录深度上限可配**（`params.maxDepth`，默认 4）：范式自身的 `locales/<lang>/<ns>.ts` 就是 4 层，写死会误伤。
- CLI/扩展：`--format=github`（CI 注解）、`--stats`（规则耗时与命中）、`--verify-deps`（适配表对账）、
  `definePack()`（包定义契约）、config/baseline 的 `specVersion` 校验。
- **修复：根 tsconfig 只有 `references` 时别名解析失败**（Vite 官方模板形态）→ 图解析全空，
  S15 会把整个项目误报成孤儿、图规则集体失明。现在顺着 references 链取 `paths`。

### 审计：与 lint 生态的交叉（第二轮）

- 新增 `docs/ECOSYSTEM-AUDIT.md`：逐条判定 44 条规则的交叉情况（真独有 / 需重抄项目数据 / 与运行器阈值部分重叠），
  并给出可复现的核查命令（`npx oxlint --rules`、`builtinRules.has(...)`）。
- 按审计结论再删 4 条零数据重复：`H02`（→ `eslint-plugin-eslint-comments`）、`D15`（→ `no-magic-numbers` + 选择器）、
  `D02`/`D18`（→ stylelint）。
- 新增 **M 度量域**（M02/M03/M04/M06/M07）：读覆盖率产物与依赖计数，**门禁不跑测试**；
  `M06` 在产物缺失/过期时 fail-closed（这是没有工具做的那一环）。总阈值 M01 与体积预算 M08 故意不实现（vitest 阈值 / size-limit 已有）。
- 新增两条**测试治理**规则（现成工具没有的）：`M08` 测试↔源配对（静态判定「该有测试的地方有没有测试」）、
  `M09` 门禁链路自检（`check` 必须真的包含 test 与 coverage —— 本会话踩过的「覆盖率在跑但统计错了对象」）。
  测试专项审计见 `docs/ECOSYSTEM-AUDIT.md` §4.1。
- 引擎：`run.ts` 提前计算 scope 供 M05 复用、`ctx.metrics`/`ctx.git` 接入、`--coverage-report` 开关、
  `--update-baseline` 同时写覆盖率棘轮快照。

### Changed

- **从 62 条精简到 42 条**：把「重新实现 lint 已有能力」的规则全部删掉，并写清委派去处
  （`docs/DESIGN.md` §4.9 委派清单）。
  - 删除：`H01`（any/非空断言/ts 注释）、`H03`（console/debugger/alert）、`H04`（TODO）、`H05`（空 catch）、
    `H07`（假异步/随机）、`H08`（硬编码地址）、`H09`（假数据）、`S08`（依赖环）、`S10`（`../` 越级）、
    `P03`（幽灵依赖）、`P08`（登记未使用）、`D01`（颜色字面量）、`D09`（`!important`）、
    `D12/D13/D14`（魔法数字三族）、`C01`（裸文案）、`C02`（键存在）、`C06`（死键）。
  - 收窄：`S15` 去掉孤儿维度（交 dependency-cruiser）、`S16` 去掉行数维度（交 eslint max-lines）。
  - 保留的都是需要「角色表 / 适配器 / 能力表」的：角色表互斥完备、域边界与层序、路由聚合与 view 引用、
    令牌图与对比度、CSS Module 双向契约、多语言同构、能力指纹、批准清单策略等。
- **迁移约束到 lint**：本仓 `eslint.config.mjs` 承接 `no-empty`、`no-warning-comments`、
  `max-lines`(500)、`max-lines-per-function`(300)、以及原有的 any/非空断言/ts 注释/console；
  README 首段改为明确分工（本工具不是 linter）。
- **D 域在 superhive 实测与旧 `check-theme` 结论一致**（0 条），旧脚本标记 `@deprecated` 并写明退役条件。
- `designSystem()` 的对比度基线默认**留空**：token 名是项目专有数据，预设不替项目做决定。

### Fixed

- **`--scope=changed/staged` 在软链路径下会假绿**：变更路径换算没做 realpath，macOS 的 `/var`↔`/private/var`
  （以及任何软链）会让路径与文件对不上，`active` 直接变空 —— 增量门禁将永远通过。现在两侧先 realpath。
- **CLI 通过软链路径调用时静默什么都不做**：直接调用判定用字面路径比较，`/tmp`→`/private/tmp` 之类会不相等，
  于是 CLI 打印空、退出 0（比报错更糟）。改为 realpath 比较。
- **`loadBaseline` 把 specVersion 错误吞成「基线文件无法解析」**：版本检查移出 try，报错才可执行。
- `i18n` 计算属性名（`[key]`）带方括号；`ts-api` 的版本读取改为可注入（异常分支可测）。
- **基线同一行多条违规无法全部豁免**：`applyBaseline` 用消耗式匹配（`splice`），同一行上的第二条违规
  （例如 `style={{ flex: 1, minWidth: 0 }}` 报出的两条 D15）永远豁免不了，棘轮会一直在那几行报红。
  改为「按锚点匹配 + 标记已用」：锚点标识的是**行**，该行的所有违规一起豁免。
- `normalizeHex('#FFF')` 不展开缩写（没剥 `#`）；`color-mix` 只接受 `var()` 底，十六进制底解析不了。
- CSS 选择器与声明的行号系统性少 1（缓冲起点落在上一行结尾的换行上）。

### Tests

- 测试 69 → **88 项**，覆盖率 94.4%/87.8% → **97.64% 行 / 88.43% 分支 / 98.31% 函数**。
- 新增：`css`（解析器/颜色求值/对比度）、`i18n`（键路径与命名空间前缀）、`deps-audit`（适配表对账）、
  `cli-extra`（`--verify-deps`/`--format=github`/`--stats`/错误参数退出码）、`output`、
  以及把**夹具回归搬进测试进程**（此前 `pnpm coverage` 只跑单测，新规则的函数覆盖率显示为 0%）。
- 测试 88 → **112 项**，覆盖率 → **98.84% 行 / 93.61% 分支 / 98.09% 函数**（无文件低于 90% 行）。
- 新增：预设参数分支、规则空项目健壮性（62 条全部安静通过）、规则早退分支、引擎边界
  （tsconfig references、baseUrl、损坏基线、git scope 三种模式、CLI 失败分支）。
- **测试缝**：`run(argv, { packageRoot })` 与 `createProgram(version)` 可注入，CLI 失败分支得以同进程覆盖
  （spawn 子进程的执行不会被父进程覆盖率统计合并）。

### Fixed

- **没有 git 时不再把 git 自己的报错透传到用户屏幕**（`致命错误：不是 git 仓库…`）：`execFileSync` 的 stderr 默认透传，
  而三处 git 调用本来就 `catch` 掉走「明确降级」分支。改为 `stdio: ['ignore','pipe','ignore']`；
  另外 `headTimeMs`（只有 M06 会读）改成**配了 metrics 适配器才算**，没配就不起子进程。
  测试输出里的该类噪音 14 处 → 0。
- **`.gitignore` 的 `lib/` / `es/` 未锚定仓库根**，把 `__fixtures__/*/src/shared/lib/**` 一并吞掉：
  夹具文件从来没进过 git，干净克隆下 6 个夹具缺文件、自检与 2 个测试恒失败。已改为 `/lib/` `/es/`，
  并**补齐了全部 14 个缺失文件**（见下）。`pnpm self-test` 恢复 **17/17**，测试 **131 通过 / 0 失败**。
- **`M02` 的发现项改用配置根相对路径**（原来是覆盖率产物的绝对路径 `report.path`，与 M06 不一致）：
  绝对路径写进报告与棘轮基线后，换机器/换 CI 必然对不上 —— 这是真·假红来源。
  夹具里那两处机器相关数据（`coverage-summary.json` 的键、`expect.json` 里 M02 的 `file`）同步改成相对路径。
- `tests/fixtures.test.mjs` 读的是不存在的 `item.reason`（`runSelfTest` 给的字段是 `message`），
  导致夹具失败原因一直打印成 `undefined` —— 夹具回归红的时候看不见为什么红。

## [0.1.4] - 2026-09-23

### Fixed

- **superhive 首次接入暴露的 3 个误报**：`S12` 不再管 views 下的样式文件与 api 的 camelCase、
  `S13` 放行 hook 的类型导出、`S14` 定位点优先取代码文件。
- **`S14` 定位点改为首个代码文件**：原来随文件遍历顺序漂移，同一违规的棘轮锚点会不稳定。

## [0.1.3] - 2026-09-23

### Fixed

- **`dependencies.commander` 被字段重排脚本吃掉**：由 CI 的 `frozen-lockfile` 拦下；
  补 manifest 防呆测试（`tests/engine-runtime.test.mjs`）—— 运行时依赖少一个，发布的包直接不可用。

### Changed

- **删除 GitHub 托管 CI**（`.github/workflows/ci.yml`）：门禁改为本地 `pnpm check`（谁提交谁在本地跑），
  `AGENTS.md` / `README.md` 同步说明。此前的 CI 迭代（矩阵 `fail-fast: false` + 超时 + 失败注解）随之移除。
- 补 `repository` / `homepage` / `bugs` 元数据；忽略并取消跟踪 npm pack 产物
  （`.gitignore` 只对新文件生效，已跟踪的 `.tgz` 要显式移除）。

## [0.1.0] - 2026-09-23

### Added

- **测试补齐到 94% 行覆盖**（起点 83%）：新增 `tests/engine-{unit,facts,graph,runtime,report}.test.mjs`（纯函数 / 事实模型 / 依赖图 / 配置 / 报告 / run 路径 / CLI），并把「每条已实现规则必须有违规夹具」写成契约测试。`pnpm coverage` 用 Node 内置覆盖率。
- **新增 `__fixtures__/rules`**：补上此前无夹具的 S02（目录深度）、S16（体积）、H02（suppression）、H05（空 catch），以及 H01（非空断言 / `@ts-expect-error`）、H03（debugger / alert）、H04（占位字符串）、S12/S13（hooks / model 导出形态）的缺失分支。
- **引擎骨架（P0）**：配置加载（预设合并 + tsconfig 别名单一出处）、目录扫描与角色表（互斥完备自检）、TS 事实模型（parser-only，规则不接触 AST）、import 图（含动态 import 与 CSS `@import`/`composes`）、能力协商注册表、棘轮基线（行文本哈希锚点）、报告（pretty / json）、检测范围 scope（full / changed / staged / since）。
- **规则**：结构域 S00–S16（解析失败 fail-closed、目录契约、深度、相对越级、barrel、命名、导出形态、域路由必填、体积），反退化域 H01–H05（类型逃生舱、suppression、调试残留、未完成标记、吞异常）；共 14 条。
- **依赖域规则（P01/P02/P03/P06/P08）落地**：登记白名单（fail-closed）、禁用库、幽灵依赖（排除 Node 内置）、能力必须用登记方案（强指纹 + 全项目 import 判定 + 平台内置识别 + `allowOwn` 降级）、登记方案未被使用。指纹匹配前遮罩注释；无 `package.json` 的项目整体跳过依赖类规则；`deny` 与能力首选的冲突在启动时报错。
- **适配器**：`defineAdapter` 字段白名单与样例校验、UI 组件库适配器（`antdKit` / `noneKit`）、组件库指纹数据（换库残留验收）。
- **本体自包含检查**：P1 依赖白名单 / P2 宿主字面量 / P3 引擎无布局假设（`--self-check-portability`）。
- **夹具回归**：`--self-test`，三个夹具（合规零误报 / 10 条违规全报 / 坏语法 fail-closed）。
- **构建与发布链路**：`pagoda-cli build`（lib 模式、保留模块结构）→ `es/` ESM + `.d.ts`，`private: false` 可发布形态；ESM-only（CJS 产物的相对路径与 `.js` 规范不兼容，见 docs/DESIGN.md）。
- **库 / CLI 范式**：`presets/library.ts`（库角色表 + 库适用规则集），本体用自己跑狗粮（`pnpm guard:self`）；据此修正三处规则精度（H04 字符串判据收紧、S11 放行 `export type *`、hygiene 不再抢规则选择权）并让配置豁免在报告里可见。
- **选型纪律（设计）**：`data/wheel-fingerprints.ts`（能力表 + 强/弱指纹 + 库 API 名），PARADIGM §12 / SPEC §16。
- **文档**：`PARADIGM.md`（通用范式，可整篇搬到别的仓库）、`docs/DESIGN.md`（完整设计与架构自审）、`README.md`。

### Changed

- **`docs/SPEC.md` → `docs/DESIGN.md`**：按 `docs/agents/issue-tracker.md` 的约定，`spec.md` 这个名字**只给 `.scratch/<feature-slug>/spec.md`**（特性规格，做完归档）；持久的设计参考文档改名 `DESIGN.md`，并在规范文件里写明「哪些不是 spec」，避免下次再被占用。
- **体积阈值默认 400/320 → 500**（`fileLines` / `viewLines`），仍可按项目覆盖：`overrides.thresholds`。
- **`docs/DESIGN.md` 瘦身 1185 → 719 行**：规范类章节（原 §2/§3/§4/§7.5）改为指向 `PARADIGM.md` 避免两处真相；状态类章节（原 §8/§9/§10/§11/§13/§15：交付物 / superhive 落地 / 分期 / 验收 / 待拍板 / 归属抽取）删除——状态归 README + CHANGELOG；原 §14「架构自审 18 项」收敛为「已知缺口（未实现）」清单。
- **能力指纹判定改为按文件**：按全项目判会放过「部分迁移」（一个文件用了 dayjs、另一个还在手搓）；现在命中的文件必须自己 import 登记方案，正确封装在别处的文件不会被误报。
- **datetime 强指纹补齐**：`toISOString().slice`、`getFullYear/getMonth/getDate/getHours/getMinutes`、`Date.now() ± 毫秒` 等常见手搓形态；每文件报首个命中行并标注「另有 N 处」。
- **删除冗余的 `deny` 默认值**：白名单（`allow`）一旦启用，未登记依赖已被 P01 拦下，黑名单只是第二份要同步的名册；预设不再替项目做选型决定（`deps()` 默认 `allow: [] / deny: []`）。本体自己的配置也删掉 `deny`。

### Fixed

- **`typescript@7` 下必崩**：TS 7 是原生重写，JS 侧不再暴露 `createSourceFile` / `ScriptKind`，而我们的 peer 范围 `>=5.4.0` 放行了它 —— 用户装到 TS 7 会在 `ts.ScriptKind.TS` 上抛 `undefined`。现在：peer 收紧为 `>=5.4.0 <7`，并在加载时 fail-fast 给出可执行报错（"请安装 typescript@6"）。由发布验收中的真实消费方安装暴露。
- **发布产物带开发机绝对路径**：`sourcemap: true` 让 `.js.map` 里写进 `/Users/...`。关掉 sourcemap，包体 112K → 56K。
- **依赖图解析不到 `.js` 指向 `.ts` 的导入**（TS nodenext 写法）—— 我们自己的源码正是这种写法，等于依赖图对本仓库是空的，S15/S08 一旦实现就会静默失效。
- **空块内的注释漏采**（`catch { /* 忽略 */ }`）—— H05「空 catch 是否写明理由」的判据因此失效；改用 TS scanner 采集全部注释 trivia。
- **裸调用（`alert` / `confirm` / `prompt`）没进事实模型** —— H03 只记录了带 `.` 的调用，这三类调试残留抓不到。
