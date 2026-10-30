/**
 * 规则面向的契约：事实模型、配置、规则与发现项。
 * 规则只依赖这里定义的结构，不依赖任何 parser 或框架（见 docs/DESIGN.md §6.1.1）。
 */
import type { Facts } from './facts-types.js'
import type { ResolvedStructure, StructureSpec } from './structure-spec.js'

export type FileKind = 'ts' | 'css' | 'json' | 'other'

/* ---------------- 事实模型（类型定义在 facts-types.ts） ---------------- */

export type {
  ImportFact,
  ExportFact,
  ReadFact,
  StringFact,
  CallFact,
  StylePropFact,
  NumberFact,
  ParseErrorFact,
  FunctionFact,
  CommentFact,
  Facts,
} from './facts-types.js'

/* ---------------- 结构与角色 ---------------- */

export interface FileRecord {
  rel: string
  abs: string
  role: string
  layer: number
  domain: string | null
  slot: string | null
  /**
   * 角色 pattern 里**所有** `{name}` 捕获。`domain` 只是 `captures.domain` 的快捷方式，
   * 结构声明化之后规则靠这里拿"这段路径到底在哪一组"（如 `{slice}`）。
   */
  captures: Record<string, string>
  /** 组值：角色声明了 `group: '<捕获名>'` 时取该捕获的值（如 `crews`），否则 null */
  group: string | null
  /** 组维度名（捕获名），如 `slice`；无组为 null */
  groupName: string | null
  kind: FileKind
  /** 页面级单元（来自角色的 `pageLike`）：S16 用 `viewLines` 判它 */
  pageLike?: boolean
  /**
   * **公开面入口**（角色声明了 `entry: true`，或库范式的 `slot: 'entry'`）：
   * 它的 `export *` 是契约本身（包 / 切片对外的那一面），不是"随手造的转发层"——S11 不判。
   */
  entry?: boolean
}

export interface RoleDescriptor {
  id: string
  pattern: string
  layer: number
  slot?: string
  /** 排他角色：命中即独占（测试文件之类不该再和槽位争角色） */
  exclusive?: boolean
  /** 组维度：组名取该捕获名的值（`src/pages/{slice}/ui/**` + `group: 'slice'`）；S22 / S23 的判定单位 */
  group?: string
  /** 本角色是所属组的**公开面（入口）**，配合 `structure.publicApi` 使用 */
  entry?: boolean
  /**
   * 本角色是「**页面级**」单元 —— S16 对它用 `viewLines` 而不是 `fileLines`。
   * 为什么要有这个字段：S16 原来只看 `slot === 'views'`，于是没有槽位语义的范式
   * （library / FSD 的 `pages/<切片>/ui`）下 `viewLines` **静默失效** —— 配了也不生效。
   * 页面级由**角色表**声明，规则不再猜。
   */
  pageLike?: boolean
}

/* ---------------- 配置与适配器 ---------------- */

export interface Thresholds {
  fileLines: number
  viewLines: number
  functionLines: number
  exportsPerFile: number
  componentsPerFile: number
}

export interface NamingRules {
  hookPrefix: string
  viewSuffix: string
}

/**
 * **规则级例外**：声明「**这条规则**对**这类文件**不适用」—— 不是「这个文件免检」。
 * 为什么必须是规则级：文件级豁免（曾经那个 `exempt`）让整个文件不进角色表、不解析事实、
 * 所有规则一起停看 —— 为了表达"console 对输出口是合法的"，代价是这个文件从此不受任何架构约束。
 * 现在的实现是**对发现项做后置过滤**：文件照常有角色、进依赖图、被其它规则判定，只有指名的那条规则被摘掉。
 * 三种需求的分工（别再混用）：
 *   ① 这片树不属于契约 → `include` / `ignore`（覆盖面问题，不是违规问题）
 *   ② 这条规则对它不适用 → 这里（唯一需要例外的情形：修了功能就没了 / 夹具就没意义了）
 *   ③ 暂时不想修（存量债）→ **没有这个通道**（基线机制已移除，不合规就是红）
 */
/**
 * **架构建议的已知例外**（R-121）：形状照抄 `ExceptionEntry` —— 必须指名信号、必须写理由、
 * 写了到期日就必过期。为什么需要它：建议若不能豁免，团队会学会**无视整个建议区**
 * （比没有建议更糟）；而豁免必须**可见**（报告里自述"被豁免了几条"），不能变成隐形关闭。
 */
export interface AdviceAllowEntry {
  /** 信号 id（见 `ADVICE_SIGNALS`）：`per-domain-exports` / `group-granularity` */
  signal: string
  /** 主体：文件路径（前者的 rel）或组名（后者的 `domain crews`），支持 glob */
  glob: string
  /** 为什么这条建议对它不适用（必填，进 diff 可评审） */
  reason: string
  /** 到期日 `YYYY-MM-DD`：写了就必过期 —— 过期后门禁直接报错，逼你续期或删掉 */
  expires?: string
}

export interface ExceptionEntry {
  /** 规则 id，必须真实存在（`runGuard` 会校验，拼错直接报错） */
  rule: string
  /** 文件 glob（配置根相对） */
  glob: string
  /** 为什么这条规则对它不适用（必填，进 diff 可评审） */
  reason: string
  /** 到期日 `YYYY-MM-DD`：写了就必过期 —— 过期后门禁直接报错，逼你续期或删掉 */
  expires?: string
}

export interface AdapterExamples {
  vendorSelectors?: { hit: string[]; miss: string[] }
  [key: string]: unknown
}

export interface DetachedApi {
  from: string[]
  members: string[]
  kind?: string
  suggest?: string
}

export interface UiKitAdapter {
  facet: 'ui-kit'
  id: string
  specVersion?: string
  packages: string[]
  icons?: { from: string[] }
  vendorSelectors?: string[]
  vendorVars?: string[]
  /** **这套库的「文案位」调用名**（C01）：`message.success`…—— 库的事实；项目自己的封装用 `copy()` 覆盖 */
  messageApis?: string[]
  /** 这套库里**哪些对象属性算文案**（`message` / `description` / `title`…）；同样可被 `copy()` 覆盖 */
  messageProps?: string[]
  detachedApis?: DetachedApi[]
  examples?: AdapterExamples
}

/**
 * i18n 适配器（文案域的能力来源）。
 * 库名（`from`）只许出现在 `presets/i18n-kits/*` —— 通用预设 `copy()` 里不许有。
 */
export interface I18nAdapter {
  facet: 'i18n'
  id: string
  specVersion?: string
  from?: string[]
  /** 翻译函数名（默认 `t`） */
  fn?: string
  /** 翻译 hook 名（默认 `useTranslation`） */
  hook?: string
  /** 资源目录：`<resourceDir>/<lang>/<namespace>.ts`；缺省由范式的 `params.i18nDir` 补 */
  resourceDir?: string
  /** 项目声明要支持的语言（与磁盘实况对账，C07） */
  languages?: string[]
  examples?: AdapterExamples
}

/**
 * 路由适配器（T1）：项目用哪个路由方案。
 * 库名只许出现在 `presets/router-kits/*`（P4 自检拦住别处）。
 */
export interface RouterAdapter {
  facet: 'router'
  id: string
  specVersion?: string
  packages: string[]
  /**
   * 域的**公开面入口文件名**（S03 / S04 / S05 / S14 / S15 的词汇）。
   * 缺省 = `src/data/face-forms.ts` 的 `DEFAULT_ROUTE_FILES`（`routes.ts` / `routes.tsx`）。
   * 声明 `[]` 表达的是「**这种文件不存在**」—— 文件路由的元框架里路由由目录约定产生，
   * 没有 per-domain 出口文件；依赖它的规则因此不判，而不是拿 `routes.tsx` 去量一个
   * 不存在的约定（那才是误报）。
   */
  routeFiles?: string[]
  /**
   * **路由路径的唯一出处**（落点，如 `src/shared/config/paths.ts`）：D23 判「路径字面量只许出现在这里」。
   * 落点是**项目决定**（同 `designSystem({ styleDir })`），由 kit 选项传入而不是 kit 写死；
   * 没声明 → D23 明列停用（`requires`），不空转。
   */
  pathSource?: string
  /** 承载路径的属性名（默认 `['path','to']`，见 `data/face-forms.ts`） */
  pathProps?: string[]
  /** 触发跳转的调用名（默认 `navigate` / `router.push`… 见 `data/face-forms.ts`） */
  navigateCalls?: string[]
  examples?: AdapterExamples
}

/**
 * 数据层适配器（T1）：服务端状态的取数方案。
 * `queryKeyFrom` 是"缓存键唯一出处"的落点 —— 项目决定路径，适配器只声明形态。
 */
export interface DataLayerAdapter {
  facet: 'data-layer'
  id: string
  specVersion?: string
  packages: string[]
  /**
   * **缓存键的唯一出处**（落点）：D22 判「键字面量只许出现在这里」；没声明 → D22 停用。
   * 收字符串或数组，每项可 glob（键跟着域/切片走时一行覆盖所有域，见 R-97）。
   */
  queryKeyFrom?: string | string[]
  /** 缓存键挂在哪几个属性上（默认 `['queryKey']`） */
  queryKeyProps?: string[]
  /**
   * **取数 / 缓存 API 的名字**（`useQuery` / `useMutation`…）—— 由 kit 按方案声明。
   * 判据按**整名或 `.` 后缀**匹配（声明 `invalidateQueries` 也能抓到
   * `queryClient.invalidateQueries(...)`），因为接收者变量名由项目决定。
   */
  fetchApis?: string[]
  /** 这套方案里**策略/阈值数字**的属性名（`staleTime` / `retry`…）：D20 的 `numberHomes` 缺省用它 */
  numberNames?: string[]
  /** 这套方案里**只许单例**的构造器（`QueryClient`…）：`callSites([{ from: 'data-layer.singletons' }])` 的来源 */
  singletons?: string[]
  /**
   * **取数只许出现的落点**（glob 列表，如 `['src/modules/<域>/hooks/**','src/shared/api/**']`）——
   * 落点是**项目决定**，所以由 kit 选项传入；没声明 → 这条门禁明列停用。
   */
  fetchIn?: string[]
  examples?: AdapterExamples
}

/** 样式适配器（T1）：项目用哪个样式方案（CSS Module / CSS-in-JS / 原子类…） */
export interface HttpAdapter {
  facet: 'http'
  id: string
  specVersion?: string
  packages: string[]
  /**
   * **哪些调用算"打后端"**（D25 的端点判据用它）：供 `endpoints({ from: 'http.apis' })` 解析。
   *
   * 只列**请求方法**（`axios.get` 等）—— 裸 `axios` 会连 `axios.create({ baseURL })` 一起认下来，
   * 那是误报。可调用形态与 `axios.create()` 的实例名由项目自己补。
   */
  apis?: string[]
}

export interface StylesAdapter {
  facet: 'styles'
  id: string
  specVersion?: string
  packages: string[]
  /**
   * **组件样式**文件形态的正则（D16 / D17 的词汇），缺省 = `*.module.css`。
   *
   * 收正则而不是后缀：换方案换的是**形态**（`*.module.scss` / `*.module.less`…）。
   * 声明 `[]` = 这套方案没有组件样式文件（Tailwind / CSS-in-JS / 原子类）→ D16 / D17 不判；
   * 宿主若要连规则本身也从报告里去掉，用 `disable` 显式关（那是配置层的决定）。
   * 与 `vendorSelectors` 同类：**必须给 hit / miss 样例**（§7.4 第 4 条）。
   */
  modulePatterns?: string[]
  examples?: AdapterExamples
}

export interface GenericAdapter {
  facet: string
  id: string
  specVersion?: string
  packages?: string[]
  examples?: AdapterExamples
  [key: string]: unknown
}

export type Adapter =
  | UiKitAdapter
  | I18nAdapter
  | RouterAdapter
  | DataLayerAdapter
  | StylesAdapter
  | HttpAdapter
  | GenericAdapter

export type {
  DegreeLimit,
  DirectoryItemLimit,
  FaceSpec,
  GroupCountLimit,
  GroupInDegree,
  NameCollisionSpec,
  PluralConsistencySpec,
  PublicApiUnit,
  ResolvedStructure,
  RuntimeSpec,
  StructureSpec,
} from './structure-spec.js'

export interface Preset {
  /**
   * 范式标识（`canonical` / `library` / `fsd`）。
   *
   * 一个配置**只能有一个范式预设** —— 角色表是整体替换的，两个范式混用会得到
   * "角色表来自后者、layout 逐键混合、structure 取并集"的静默错误组合，所以 `loadConfig` 见到
   * 两个不同范式就直接报错（fail-closed）。
   */
  paradigm?: string
  roles?: RoleDescriptor[]
  /**
   * 在范式角色表**之上追加**角色（不替换）。
   *
   * 用途：项目在所选规范之外还有自己的目录（如 `src/legacy/**`）——
   * 不追加的话只能整份重写 `roles`，那样范式一升级就漂了。
   */
  addRoles?: RoleDescriptor[]
  layout?: { app: string; modules: string; shared: string }
  srcRoot?: string
  naming?: Partial<NamingRules>
  thresholds?: Partial<Thresholds>
  adapters?: Record<string, Adapter>
  /**
   * 本预设**贡献**的规则。多个预设是**并集**（相加），不是后者覆盖前者 ——
   * 否则 `library() + designSystem()` 这种组合会把后者贡献的域静默关掉。
   * `'all'` 表示"全部注册的规则"，与任何列表并集仍是 `'all'`。
   */
  enable?: string[] | 'all'
  /** 本预设**排除**的规则（并从所有预设的 disable 取并集） */
  disable?: string[]
  /** 结构声明（层序 / 组隔离 / 公开面）：多个预设之间**加法合并** */
  structure?: StructureSpec
  params?: Record<string, unknown>
  entries?: string[]
  ignore?: string[]
  /** 契约扫描域：只有命中这些 glob 的 ts/css 参与角色判定（空 = 不限制） */
  include?: string[]
  exceptions?: ExceptionEntry[]
}

/**
 * 宿主 `overrides` 的形状：Config 的逐键覆盖，**外加一个 Config 上不存在的字段** `addRoles`。
 *
 * 为什么单独建模：`addRoles` 是"在范式角色表之上追加"的**输入**，不是解析结果的一部分 ——
 * 解析后追加结果已经并进 `Config.roles`。曾经 Config 上也留了一份 `addRoles`，赋值后无人读，
 * 是同一事实的第二处存放（读它就会把角色重复计入）；现在只留在输入侧。
 */
/**
 * 项目层的声明（`overrides`）：**显式枚举**，不再 `Partial<Config>`。
 *
 * 为什么显式：`Partial<Config>` 会让**每一个** `Config` 字段顺手变成"可写但没人读"的键 ——
 * 实测就有两个（`root` / `paradigm`）：写进去被静默忽略，正是 R-113 那族病。
 * 显式之后，"可写的键"必须有人读，否则它根本不在这个类型里（配置期就报未知键）。
 *
 * 键的去留判据：**项目层只放"项目自己能声明"的**；派生量（`root` / `paradigm`）与
 * 装配量（`sourceForm` / `presets`）留在顶层。
 */
export interface ConfigOverrides {
  srcRoot?: string
  layout?: { app: string; modules: string; shared: string }
  roles?: RoleDescriptor[]
  /** 在范式角色表之上**追加**角色（不是替换；要整体替换用 `roles`） */
  addRoles?: RoleDescriptor[]
  naming?: Partial<NamingRules>
  thresholds?: Partial<Thresholds>
  adapters?: Record<string, Adapter>
  enable?: string[] | 'all'
  disable?: string[]
  /** 逐规则严重度覆盖（`{ M08: 'warn' }`）：先看见、暂不拦，不必整条关规则 */
  severity?: Record<string, Severity>
  structure?: StructureSpec
  params?: Record<string, unknown>
  entries?: string[]
  ignore?: string[]
  include?: string[]
  exceptions?: ExceptionEntry[]
  adviceAllow?: AdviceAllowEntry[]
  aliases?: Record<string, string>
  /**
   * **追加规则**（R-143）：与内置规则集并集，合并结果就是 `Config.rules`。
   * 同 id 同 title 幂等；同 id 不同 title → 配置期报错（见 `mergeRules`）。
   * 规则本身由 `createRule()` 产出（id 前缀 / 等级 / title / hint 的校验在它那儿）。
   */
  customRules?: Rule[]
}

export interface Config {
  root: string
  srcRoot: string
  /**
   * 范式标识（`canonical` / `library` / `fsd`；自写预设可不写）。
   *
   * 以前只有 `loadConfig` 的"一个配置只许一个范式"校验在读它，**没进合并后的配置** ——
   * 于是 `placementHint` 只能靠 `layout` 猜范式，FSD 被猜成库范式、给出
   * 「先在 `library({ modules })` 里补上」这种不相干的建议。现在它是**可消费的事实**。
   */
  paradigm?: string
  layout: { app: string; modules: string; shared: string }
  roles: RoleDescriptor[]
  naming: NamingRules
  thresholds: Thresholds
  adapters: Record<string, Adapter>
  enable: string[] | 'all'
  /** 显式排除的规则：`enable` 求完之后再减掉 */
  disable: string[]
  /**
   * **逐规则严重度覆盖**（只项目层能写）：报告 / 退出码 / JSON 走同一处 `severityOf`。
   * 用于渐进接入：先降成 warn 看见它，而不是把规则整条关掉（关掉连"有没有在判"都失去）。
   */
  severity: Record<string, Severity>
  /** 结构声明：层序 / 组隔离 / 公开面（S21–S23 的判据来源）。**已归一化**，三个字段都在 */
  structure: ResolvedStructure
  params: Record<string, unknown>
  entries: string[]
  ignore: string[]
  /** 契约扫描域（配置根相对 glob）；空 = 全树都参与契约判定 */
  include: string[]
  /** **源码形态**（`typescript` / `react` / …）：决定哪些源码扩展名归我们管（见 src/data/framework-sources.ts） */
  sourceForm: string
  /**
   * **解析后的规则集**（R-143）：内置规则集 + `overrides.customRules` 追加，在 `loadConfig` 里算定。
   * 为什么放进配置：以前 `run.ts` 与 CLI 各自推导一遍（两处真相），而"哪些规则在跑"是配置的结论。
   */
  rules: Rule[]
  exceptions: ExceptionEntry[]
  /** 建议的已知例外（R-121）：豁免必须带理由、且会在报告里自述 */
  adviceAllow: AdviceAllowEntry[]
  aliases: Record<string, string>
}

/* ---------------- 规则与发现项 ---------------- */

export type Level = 'L1' | 'L2' | 'L3' | 'L4'
export type Severity = 'error' | 'warn'
export type Domain = 'structure' | 'design' | 'copy' | 'deps' | 'hygiene' | 'metrics'

export interface Finding {
  /** 列号（1 起）—— 事实里有就给，报告与 GitHub 注解用它精确定位 */
  column?: number
  rule: string
  file: string
  line: number
  text: string
  hint?: string
  /** 棘轮锚点：单行取规范化行文本哈希；文件级/符号级由规则给出稳定签名 */
  anchor?: string
  anchorKind?: 'line' | 'file' | 'symbol'
  /** 全局谓词（不可归属到变更文件）标记，scope 过滤时不能被静默丢弃 */
  global?: boolean
  /**
   * 该发现项的严重度**覆盖**（默认取规则声明的严重度）。
   *
   * 只在"同一判据、两种严重度"时用 —— 目前只有 P06：会不会降级由**数据表**决定
   * （能力条目的 `allowOwn: true` = 允许自研，只提示），规则只负责落实。
   * 唯一读取点是 `severityOf()`，所以报告、统计、`--severity` 过滤三处自动一致。
   */
  severity?: Severity
}

export interface RuleContext {
  config: Config
  records: FileRecord[]
  facts: Map<string, Facts>
  graph: import('./graph.js').Graph
  scan: import('./scan.js').ScanResult
  /** 依赖事实：声明了什么、真实用了什么 */
  deps: import('./deps.js').ProjectDeps
  /** 依赖策略：allow / deny / capabilities */
  policy: import('./deps.js').DepsPolicy
  /** i18n 资源索引（文案域规则用；未配置资源目录时为空） */
  i18n?: import('./i18n.js').I18nIndex
  /** 度量产物（M 域规则用）：报告本体或读取失败的原因 */
  metrics?: {
    reportPath: string
    report: import('./coverage.js').CoverageReport | null
    error?: string
  }
  /** git 事实（M05 变更必须被覆盖用；无 git 时为 undefined） */
  git?: { changedFiles: string[] | null; headTimeMs: number | null }
  files: string[]
  /** 按 rel 读原始文本（规则需要行文本算锚点时用） */
  sourceOf: (rel: string) => string | undefined
}

export interface Rule {
  id: string
  domain: Domain
  level: Level
  severity: Severity
  title: string
  /** 能力依赖：未声明的能力对应规则不注册（见 docs/DESIGN.md §7.4） */
  requires?: string[]
  hint?: string
  /** 判谁：`'product'` = 测试脚手架不算产品代码纪律的对象（缺省 `'all'`，行为不变） */
  appliesTo?: 'product' | 'all'
  run: (ctx: RuleContext) => Finding[]
}
