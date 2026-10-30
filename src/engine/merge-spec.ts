/**
 * **配置键的合并语义表**（R-144）：每一把键在**两根轴**上各是什么语义 —— **一处声明**。
 *
 * 为什么需要它：同一个键在「预设之间」与「预设 vs 项目层」的语义**可以不同**，以前那是散在
 * `mergePresets` 与 `config.ts` 里的手写分支 —— `enable` 在预设之间是**并集**，在项目层是
 * **整体替换**（"我全都要自己定"）；`entries` / `include` 在预设之间**拼接**、在项目层**替换**。
 * 语义本身都说得通，但**没写明**：读者只能读源码才知道 `overrides.enable: ['S45']` 会把预设
 * 给的清单整个换掉（而不是加一条）。
 *
 * 现在这张表是唯一真相：
 * - 合并器**读表**执行（`mergeByKind`）—— 新键不会顺手获得某种"碰巧"的语义；
 * - 文档块 `<!-- arch-guard:begin merge-spec -->` **由表渲染**（`--check-docs` 盯着漂移）；
 * - 守卫测试要求每个**可写**的键都在表里，两端都不许漏（`tests/merge-spec.test.mjs`）。
 */
export type MergeKind =
  /** 单值：后者赢（项目层 = 整体替换预设给的那份） */
  | 'single'
  /** 逐键合并（对象），后者赢 */
  | 'fields'
  /** 集合并集：去重、保序 */
  | 'union'
  /** 顺序拼接：保序、可重复 */
  | 'concat'
  /** 有**专属合并器**（失败即报的那种，见 `SPECIAL_MERGERS`） */
  | 'special'
  /** 这一层不允许写这个键（写了就是配置错误） */
  | 'n/a'

export interface KeyMerge {
  /** 多个**预设之间**怎么合 */
  presets: MergeKind
  /** **预设 vs 项目层**（`overrides`）怎么合 */
  project: MergeKind
  /** 为什么是这条（写给人看；文档块会印出来） */
  note?: string
}

/**
 * 表的两个约束（守卫测试盯着）：
 * 1. 键集合 = `Preset` 的键 ∪ `ConfigOverrides` 的键 —— 少一个就是"可写但没语义"；
 * 2. `special` 的键必须在 `SPECIAL_MERGERS` 里有名字 —— 不然"特殊"会变成"没人负责"。
 */
export const MERGE_SPEC: Record<string, KeyMerge> = {
  paradigm: {
    presets: 'special',
    project: 'n/a',
    note: '恰好一个范式预设（多范式混用由 `loadConfig` fail-closed）',
  },
  roles: { presets: 'single', project: 'single', note: '角色表整体替换；要追加用 `addRoles`' },
  addRoles: { presets: 'concat', project: 'concat', note: '在范式角色表之上追加' },
  layout: { presets: 'fields', project: 'single', note: '预设之间逐键，项目层整体替换' },
  srcRoot: { presets: 'single', project: 'single' },
  naming: { presets: 'fields', project: 'fields', note: '默认层 → 预设 → 项目' },
  thresholds: { presets: 'fields', project: 'fields', note: '默认层 → 预设 → 项目' },
  adapters: {
    presets: 'special',
    project: 'special',
    note: '一个面只能一个方案；项目层还要过 `defineAdapter`',
  },
  enable: {
    presets: 'special',
    project: 'single',
    note: '预设之间并集（`all` 吸收一切）；项目层**整体替换** —— "我全都要自己定"',
  },
  disable: { presets: 'union', project: 'union', note: '显式排除，只增不减' },
  structure: {
    presets: 'special',
    project: 'special',
    note: '加法合并 + 统一校验（`resolveStructure`）',
  },
  params: { presets: 'fields', project: 'fields', note: '面参数：项目层逐键覆盖' },
  entries: {
    presets: 'concat',
    project: 'single',
    note: '预设之间拼接，项目层替换（要加就得写全）',
  },
  ignore: { presets: 'concat', project: 'concat' },
  include: { presets: 'concat', project: 'single', note: '契约扫描域：项目层替换' },
  exceptions: {
    presets: 'concat',
    project: 'concat',
    note: '拼接；每条还要过 rule/glob/reason 校验',
  },
  adviceAllow: { presets: 'n/a', project: 'concat', note: '只有项目能声明（预设给不了）' },
  aliases: { presets: 'n/a', project: 'special', note: '默认来自 tsconfig，项目层逐键覆盖' },
  severity: {
    presets: 'n/a',
    project: 'fields',
    note: '只有项目能声明：逐规则覆盖 error/warn（报告/退出码/JSON 同一处生效）',
  },
  customRules: {
    presets: 'n/a',
    project: 'special',
    note: '只有项目能声明；追加进规则集，同 id 不同 title 报错（`mergeRules`）',
  },
}

/** `special` 的键各自归谁合并（守卫测试要求"特殊"必须有名字） */
export const SPECIAL_MERGERS: Record<string, string> = {
  paradigm: 'loadConfig 的"一个配置只许一个范式预设"校验',
  adapters: 'mergePresets / config.ts：一键一值，冲突即报 + defineAdapter 校验',
  enable: 'mergePresets：并集且 `all` 吸收',
  structure: 'mergeStructureSpec / resolveStructure：加法合并 + 统一校验',
  aliases: 'config.ts：以 tsconfig 为底逐键覆盖',
  customRules: 'mergeRules：追加 + id 冲突检测',
}

/** 表里两根轴都"不许写"的键不合法（那种键根本不该在表里） */
export const isWritable = (spec: KeyMerge): boolean =>
  spec.presets !== 'n/a' || spec.project !== 'n/a'

/**
 * **按语义合并一个键**（`single` / `fields` / `union` / `concat`）—— 唯一实现。
 * `special` 不走这里（它们有专属合并器，见 `SPECIAL_MERGERS`）。
 */
export function mergeByKind(
  kind: Exclude<MergeKind, 'special' | 'n/a'>,
  base: unknown,
  next: unknown,
): unknown {
  switch (kind) {
    case 'single':
      return next ?? base
    case 'fields':
      return {
        ...((base ?? {}) as Record<string, unknown>),
        ...((next ?? {}) as Record<string, unknown>),
      }
    case 'union':
      return [...new Set([...((base ?? []) as unknown[]), ...((next ?? []) as unknown[])])]
    case 'concat':
      return [...((base ?? []) as unknown[]), ...((next ?? []) as unknown[])]
  }
}

/* ---------------- 项目层合并的产物（读表执行） ---------------- */

/** 按 `MERGE_SPEC` 算定的项目层最终值（`special` 的键不在这里，各自单独处理） */
export interface ResolvedProject {
  srcRoot?: string
  layout?: { app: string; modules: string; shared: string }
  roles: unknown[]
  addRoles: unknown[]
  naming: Record<string, unknown>
  thresholds: Record<string, unknown>
  params: Record<string, unknown>
  entries?: string[]
  ignore: string[]
  include: string[]
  disable: string[]
  enable?: string[] | 'all'
  /** 逐规则严重度覆盖（只有项目层能写；值已由 `validateSeverity` 校验） */
  severity?: Record<string, 'error' | 'warn'>
  exceptions: unknown[]
  adviceAllow: unknown[]
}

/**
 * **预设 + 项目层 → 最终值**（R-144）：非 `special` 的键一律**读表合并**。
 *
 * 为什么单独成一步：以前这些合并散在 `config.ts` 的 15 行里，而"这个键是替换还是并集"只存在于
 * 那些写法里；现在语义在表里、执行在这里，`config.ts` 只负责"算完之后往下接"（`special` 的
 * `adapters` / `enable` / `structure` / `aliases` / `customRules` 仍各自处理）。
 */
export function resolveProject(
  preset: Record<string, unknown>,
  overrides: Record<string, unknown>,
): ResolvedProject {
  const merged: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(MERGE_SPEC)) {
    if (spec.project === 'n/a' || spec.project === 'special') continue
    merged[key] = mergeByKind(spec.project, preset[key], overrides[key])
  }
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    srcRoot: merged.srcRoot as string | undefined,
    layout: merged.layout as ResolvedProject['layout'],
    roles: list(merged.roles),
    addRoles: list(merged.addRoles),
    naming: record(merged.naming),
    thresholds: record(merged.thresholds),
    params: record(merged.params),
    entries: merged.entries as string[] | undefined,
    ignore: list(merged.ignore) as string[],
    include: list(merged.include) as string[],
    disable: list(merged.disable) as string[],
    enable: merged.enable as string[] | 'all' | undefined,
    severity: merged.severity as ResolvedProject['severity'],
    exceptions: list(merged.exceptions),
    adviceAllow: list(merged.adviceAllow),
  }
}
