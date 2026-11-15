/**
 * **事实模型**的类型（从 `types.ts` 拆出来：那一份已经顶到 500 行上限）。
 *
 * 规则读的就是这些字段 —— 加字段前先确认有规则在读（见 `facts.ts`）。
 */
export interface ImportFact {
  spec: string
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  typeOnly: boolean
  dynamic: boolean
  /** 具名导入的**原名**（`import { a as b }` 记 `a`）· 是否有默认导入 —— S45 靠它们与目标的导出集对账 */
  names?: string[]
  hasDefault?: boolean
  /** `import * as ns` / `export * from`：导出集未知，S45 跳过名字对账 */
  star?: boolean
}

export interface ExportFact {
  name: string
  kind: string
  isStar: boolean
  isDefault: boolean
  typeOnly: boolean
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  declared?: boolean
}

/** 成员访问链的事实（`import.meta.env.VITE_X` / `process.env.X`）：读取落点类规则用 */
export interface ReadFact {
  /** 完整链文本（`import.meta.env.VITE_API_BASE`） */
  name: string
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
}

export interface StringFact {
  value: string
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  context: string
  prop: string | null
  /** 最近的**外层调用名**（`notification.open({ message: '保存' })` 里的那截）；C01 的对象实参形态靠它 */
  inCall?: string
  /**
   * 这个字面量是**数组首元素**时，它所属的「导出/变量 + 属性」路径（`crewKeys.list` / `crewKeys.detail`）：
   * D26 靠它按"每个 key 工厂"分组比对前缀（R-100）。不是数组首元素时为 undefined。
   */
  arrayPath?: string
}

export interface CallFact {
  callee: string
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  /** 第一个字符串字面量参数（t('nav.crews') 里的 nav.crews）；没有则缺省 */
  stringArg?: string
  /** 第一个参数是模板串时的静态前缀（t(`nav.${x}`) 里的 "nav."），动态键靠它判定「被用过」 */
  keyPrefix?: string
  /**
   * 第一个参数是模板串时的**全部静态段**（`` `${BASE}/crews?limit=${n}` `` → `['', '/crews?limit=', '']`）——
   * 端点是写在模板串里的，静态前缀常常为空，只有拿到全部静态段才看得见路径（R-99 / D25）。
   */
  templateParts?: string[]
}

/** JSX `style={{ … }}` 里的一条**字面量**属性（D15）：模板插值 / 变量引用不进 facts —— 那正是它该有的样子 */
export interface StylePropFact {
  prop: string // 属性名原样（camelCase：backgroundColor）；规则自己归一到 kebab 再比词汇表
  value: string // 字面量文本（字符串去引号：`#ff5a1f` / `13px`；数字：`13`）
  numeric: boolean // 值是不是数字字面量（决定要不要按刻度白名单判）
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
}

/** **有名字**的数字字面量（D19 / D20）：最近的属性名（`staleTime: 300_000`）或 `const` 名（`PAGE_SIZE = 20`） */
export interface NumberFact {
  value: number
  raw: string // 原样文本（`300_000` / `1e3` / `0x10`）
  name: string | null
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
}

export interface FunctionFact {
  name: string
  /**
   * 这个函数是**对象属性的值**时，那个属性名（`retry: (n) => …` → `retry`）—— 且**不随函数体断开**。
   * D30 靠它判"函数型策略写在了家外"（D20 只看得到带名字的**数字**，函数体里的数看不见）。
   */
  ownedProp?: string
  /**
   * 这个函数所在的**最近外层调用名**（`useQuery({ retry: (n) => … })` → `useQuery`）。
   * 用于收窄"撞名"：`retry` 既可能是查询策略，也可能是 UI 回调（D30 只判前者）。
   */
  inCall?: string
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  lines: number
  isComponent: boolean
}

export interface CommentFact {
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  text: string
  kind: string
  /** 区间 [pos, end)：指纹扫描时要遮罩掉注释，避免「注释里写了轮子」被误报 */
  pos: number
  end: number
}

export interface ParseErrorFact {
  line: number
  /** 列号（1 起）：报告与 CI 注解用它精确定位；合成事实可以不给 */
  column?: number
  message: string
}

/** 单个文件的事实模型：字段是**规则实际会读的**那些 —— 加字段前先确认有规则在读（见 `facts.ts`） */
export interface Facts {
  file: string
  rel: string
  role: string
  lineCount: number
  /** 代码行（空行与整行注释不计）：S16 量体积用它，`lineCount` 是原始行数 */
  codeLineCount: number
  parseErrors: ParseErrorFact[]
  imports: ImportFact[]
  exports: ExportFact[]
  strings: StringFact[]
  /** 环境相关的读取链（`import.meta.env.X` / `process.env.X`），根名单在 `data/env-roots.ts` */
  reads: ReadFact[]
  calls: CallFact[]
  /** D15 的 JSX 内联样式字面量属性 · D19 / D20 的有名字数字字面量 */
  styleProps: StylePropFact[]
  numbers: NumberFact[]
  functions: FunctionFact[]
  comments: CommentFact[]
  hasJsx: boolean
}
