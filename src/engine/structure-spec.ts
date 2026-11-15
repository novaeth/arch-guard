/**
 * **结构声明的词汇表**（`structure: { … }` 的字段类型）。
 *
 * 为什么单独成模块：这些类型是宿主**写在 `arch.config.mjs` 里的那张表**的形状 ——
 * 与引擎内部的运行期类型（`Config` / `Rule` / `Finding`）不是一回事；
 * `types.ts` 也有文件长度上限（同 `codes.ts` 的理由），放一起会互相挤。
 *
 * 每个字段都必须有且只有一条规则消费（括号里的 S 编号）—— 不做"声明了没人读"的配置。
 * 参照系：ArchUnit / import-linter / go-arch-lint / Nx tags 都是这个形状。
 */

/**
 * 无捕获单元（**没有** `{name}` 捕获的角色目录，如 `shared/ui`）的公开面（S23 扩展）。
 *
 * 捕获维度（`structure.publicApi`）管"组必须有入口"，这一条管"没有组的单元也要有入口"——
 * 两种单元的来源不同，所以是两条声明，而不是给 `publicApi` 开特例。
 */
export interface PublicApiUnit {
  /** 角色 id：命中它的目录是一个"单元" */
  role: string
  /**
   * 要求该目录的**一级子目录**各有一个入口，而不是目录本身。
   * （FSD 的 `shared/ui` / `shared/lib` 是这个形状：每个组件/模块一个目录，片段根反而不放 index。）
   */
  children?: boolean
}

/**
 * **运行时**（S23 ④，R-139 / ADR-0008）：一个执行环境 + 它的入口。
 *
 * 消费者属于哪个运行时**不逐文件标注**，而是按**可达性**推导：文件 A 属于运行时 r
 * ⇔ A 从 r 的某个入口可达。于是同构模块天然同时属于两个运行时（可用任意面），
 * 而"只有浏览器能到"的文件进不了宿主面。
 *
 * `name` 是**不透明字符串**（host / client / worker / edge…）—— 引擎不认识任何具体运行时。
 */
export interface RuntimeSpec {
  name: string
  /** 这个运行时的入口（glob，相对项目根） */
  entries: string[]
}

/**
 * **运行时面**（S23 ④⑤，R-139 / R-140）：某个模式的文件是"某个运行时的门"。
 *
 * 为什么不做成角色字段：`library()` 范式的域目录**没有 group / slot**
 * （`lib:modules/issues` 只是一个目录角色），挂不上；模式声明在三种范式下都成立。
 */
export interface FaceSpec {
  /** 面文件的路径模式（glob，如 `src/modules/<域>/index.ts` —— 其中的域名段写成 `*`）；只收 glob，不收捕获 */
  pattern: string
  /** 这个面属于哪个运行时（必须先在 `runtimes` 里声明过） */
  runtime: string
  /**
   * 面文件对外**只许**导出的名字模式（glob，如 `*Host`）；不给 = 不判面值。
   * 类型导出不受限（类型是跨运行时的公共词汇，不是实现）。
   */
  value?: string
}

/** 组数量上限：按「层 + 父组桶」分桶后，桶内组数 > `max` 即报（S26） */
export interface GroupCountLimit {
  /** 组维度名（角色表里 `group` 用的捕获名） */
  dimension: string
  max: number
}

/** 目录一级子项数上限（S27） */
export interface DirectoryItemLimit {
  /** 角色 id：按它 pattern 匹配到的**实际目录**分别计数（`{domain}` 会展开成每个域的真实目录） */
  role: string
  max: number
  /** 只数一级子目录、不数文件 */
  foldersOnly?: boolean
}

/** 组的外部引用组数下限（S28） */
export interface GroupInDegree {
  dimension: string
  /** 下限：外部引用**组**数少于它即报 */
  min: number
  /** 整层跳过（页面天然只被 app 引用，查它只会全是噪音） */
  exceptLayers?: number[]
  /** 唯一引用者来自这些层时不算违规 */
  singleFromLayers?: number[]
}

/**
 * 文件级入/出度上限（S34）。
 *
 * 与 S26/S28 的粒度差：那两条看**组**，这条看**单个文件** ——
 * 「这个文件被 80 个文件引用」（改动会波及全项目）与「这个文件引用了 40 个模块」（神模块）
 * 都是组粒度看不见的。`maxIn` / `maxOut` 至少要给一个（两边都不给 = 这条声明什么都没说）。
 */
export interface DegreeLimit {
  /** 角色 id：命中它的文件受这条上限约束 */
  role: string
  /** 入度上限：被多少个**项目内**文件引用 */
  maxIn?: number
  /** 出度上限：引用了多少个**项目内**文件 */
  maxOut?: number
}

/**
 * **组耦合上限**（S39）：一个组被多少个**其它组**依赖（fan-in）/ 依赖了多少个其它组（fan-out）。
 *
 * 与 S34 的粒度差：S34 锚在**单个文件**（神模块 / 改一处动全身），这条锚在**组**——
 * 「整个域被一半的域依赖」是文件级度数看不见的架构耦合。
 * `maxFanIn` / `maxFanOut` 至少要给一个；维度用捕获名（`domain` / `slice` / 自定义），
 * 所以 canonical 与 FSD 共用同一条规则。
 */
export interface CouplingLimit {
  /** 组维度名（角色表里捕获名的名字，如 `domain` / `slice`） */
  dimension: string
  /** 被多少个其它组依赖，超过即报（上帝域） */
  maxFanIn?: number
  /** 依赖了多少个其它组，超过即报（什么都碰） */
  maxFanOut?: number
}

/** 相对越级的层数上限（S43）：`../` 最多向上爬几层 —— 超过就报（不声明不判） */
export interface RelativeUpLimit {
  /** 上限：`../x` 记 1 层、`../../x` 记 2 层，超过 max 即报 */
  max: number
}

/** **生成物**路径（glob）：这些文件必须带 `@generated` 标记（H13） */
export type GeneratedPaths = string[]

/** 客户端状态单元的**命名形态 + 落点**（S41）：导出名命中 `naming` 的文件必须在 `in` 里 */
export interface ClientStateSpec {
  /** 导出名 glob（如 `use*Store`）：只比导出名，不比文件内容 */
  naming: string
  /** 允许的落点（glob 列表） */
  in: string[]
}

/** 跳转守卫的**落点**（S42）：跳到登录页这种动作只许出现在 `in` 里 */
export interface AuthRedirectSpec {
  /** 登录路径（字符串实参 / JSX `to` 命中它即视为"跳登录"） */
  loginPaths: string[]
  /** 守卫落点（glob 列表） */
  in: string[]
}

/** 组名不许与其它单元重名（S29） */
export interface NameCollisionSpec {
  dimension: string
  /**
   * 词汇来源：这些角色目录的**目录名**构成保留词汇。
   * 只收"项目里真实存在"的目录（命中该角色的文件数为 0 就不进词汇表）——
   * 声明一整张词表会把项目里根本没有的单元也算进来（那是误报）。
   */
  vocabularyRoles: string[]
}

/** 单复数一致性（S31） */
export interface PluralConsistencySpec {
  dimension: string
  /** 只查这些层（缺省 = 所有层） */
  layers?: number[]
  /** 中性词（天然不分单复数）；缺省用 `src/data/plural-forms.ts` 的默认表 */
  neutralWords?: string[]
}

/**
 * 结构声明：把"目录规范"变成宿主可声明的数据，规则从声明推导。
 *
 * **每个字段都必须有且只有一条规则消费**（括号里的 S 编号）—— 不做"声明了没人读"的配置。
 * 参照系：ArchUnit / import-linter / go-arch-lint / Nx tags 都是这个形状。
 */
export interface StructureSpec {
  /** 层序单向：只许依赖**层号 ≤ 自己**的文件（S21）。应用范式与库/FSD 都声明它 —— 一套机制 */
  order?: boolean
  /** 组隔离：组维度名列表（捕获名）。同维度、同层、不同组之间**不许互相引用**（S22） */
  isolate?: string[]
  /** 公开面：组维度名列表。这些维度的组**必须有入口文件**，且组外不许直接引用组内非入口文件（S23） */
  publicApi?: string[]
  /** 无捕获单元的公开面（S23 扩展） */
  publicApiUnits?: PublicApiUnit[]
  /** 运行时（S23 ④）：运行时名 → 入口 glob。消费者的运行时按可达性推导（R-139） */
  runtimes?: RuntimeSpec[]
  /** 运行时面（S23 ④⑤）：面文件模式 → 所属性运行时 →（可选）面值名模式（R-139 / R-140） */
  faces?: FaceSpec[]
  /** 这些组维度的每个组必须含 ≥1 个**非入口**文件（S24） */
  segmentedGroups?: string[]
  /** 保留名表：角色目录**内部**的任何嵌套子目录，基名命中即报（S25） */
  reservedNames?: string[]
  /** 组数量上限（S26） */
  groupCountLimits?: GroupCountLimit[]
  /** 目录一级子项数上限（S27） */
  directoryItemLimits?: DirectoryItemLimit[]
  /**
   * 所有 product 目录的**默认**一级子项预算（S27）。不声明时用引擎默认值（20）；
   * 想给某个角色更宽 / 更严的预算，用 `directoryItemLimits` 覆盖。
   */
  maxItemsPerDir?: number
  /** 组的外部引用组数下限（S28） */
  groupInDegree?: GroupInDegree[]
  /** 组名与保留词汇的重名（S29） */
  nameCollisions?: NameCollisionSpec[]
  /** 重复命名：这些组维度按「层 + 父组桶」检查"所有组名共有的词"（S30） */
  repetitiveNaming?: string[]
  /** 单复数一致性（S31） */
  pluralConsistency?: PluralConsistencySpec[]
  /** 文件级入/出度上限（S34） */
  degreeLimits?: DegreeLimit[]
  /** 导入局部性：这些组维度内必须相对导入、跨组必须非相对导入（S32） */
  importLocality?: string[]
  /** 组耦合上限：这些组维度的 fan-in / fan-out（S39） */
  couplingLimits?: CouplingLimit[]
  /** **在迁移中**的路径（glob）：它们可以引用别处，别处不许引用它们（S40） */
  migrating?: string[]
  /** 客户端状态单元：命名形态 + 落点（S41） */
  clientState?: ClientStateSpec[]
  /** 跳转守卫：登录路径 + 守卫落点（S42） */
  authRedirects?: AuthRedirectSpec
  /** 相对越级的层数上限（S43） */
  maxRelativeUp?: RelativeUpLimit
  /** **生成物**路径（glob）：这些文件必须带 `@generated` 标记（H13） */
  generated?: GeneratedPaths
}

/** 归一化后的结构声明：宿主只声明一部分，配置加载后**每个字段都补齐**（数组默认空） */
export interface ResolvedStructure {
  order: boolean
  isolate: string[]
  publicApi: string[]
  publicApiUnits: PublicApiUnit[]
  runtimes: RuntimeSpec[]
  faces: FaceSpec[]
  segmentedGroups: string[]
  reservedNames: string[]
  groupCountLimits: GroupCountLimit[]
  directoryItemLimits: DirectoryItemLimit[]
  maxItemsPerDir: number
  groupInDegree: GroupInDegree[]
  nameCollisions: NameCollisionSpec[]
  repetitiveNaming: string[]
  pluralConsistency: PluralConsistencySpec[]
  degreeLimits: DegreeLimit[]
  importLocality: string[]
  couplingLimits: CouplingLimit[]
  migrating: string[]
  clientState: ClientStateSpec[]
  authRedirects: AuthRedirectSpec | undefined
  maxRelativeUp: RelativeUpLimit | undefined
  generated: GeneratedPaths
}
