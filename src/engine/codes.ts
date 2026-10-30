/**
 * **报告契约里的枚举值**（自述 code / 停用原因 code）—— 单一出处 + 派生常量表 + 派生守卫。
 *
 * 为什么单独成模块：它们是**对外契约**（DESIGN §6.9），与"引擎内部的类型形状"不是一回事；
 * `types.ts` 也有文件长度上限，把它们放在一起会互相挤。
 *
 * 标准形状（新加契约枚举照这个来）：
 *   ① 一份 `as const` 数组（编译期 union 与运行期可枚举同源）；
 *   ② 从数组**派生**的常量表（`NOTICE.PATHS_NO_MATCH`）与守卫（`isNoticeCode`）—— 绝不手写第二份清单；
 *   ③ 从**包入口**导出（`exports` 映射不暴露 `./engine/*`，拿不到就等于没有）；
 *   ④ 由 `tests/report-contract.test.mjs` 冻结（含"常量名集合 ↔ 数组一一对应"）。
 */

/**
 * 机读自述（notice）的**稳定 code 清单** —— **这是对外契约的一部分，文案不是**。
 *
 * 为什么要有它：`notices` 原来是 `string[]`，消费方只能去**字符串匹配中文措辞**才能判定
 * 「这次到底判了没有」。而措辞是随时可以改的内部细节 —— 把它变成契约等于制造第二处真相。
 * 现在按 `code` 判：文案随便改，code 不变。
 *
 * 增删或改名 code 都是**破坏性变更**，要按 `REPORT_API_VERSION` 的规矩走（见 docs/DESIGN.md §6.9）。
 */
export const NOTICE_CODES = [
  /** 声明配了却 0 命中：那条纪律什么都没看（M1） */
  'declaration-no-match',
  /** 架构建议：可核对的信号 + 处方选项，**不阻断**（R-118） */
  'architecture-advice',
  /** 显式停用的规则：门禁自己的账（与「因能力未声明而停用」不同，R-125） */
  'rules-disabled',
  /** 调用方没注入源码形态实现（`sourceForms`）：规则集为空，只解析了配置语义（ADR-0009） */
  'source-form-missing',
  /** 生效的适配器（`facet=id` 清单）：适配器只写在配置里，报告不提它就看不出"跑的是哪套 kit" */
  'adapters-in-use',
  /** 别名取自 tsconfig（含"取自哪个 tsconfig"这类说明） */
  'config-aliases',
  /** 项目根没有 package.json：依赖类规则跳过 */
  'config-no-manifest',
  /** scope 需要 git 变更集但取不到（无 git / 无提交）→ 降级为全量 */
  'scope-degraded-no-git',
  /** 仓库根 ≠ 配置根：变更路径做过换算（说明一下，免得读者算错） */
  'scope-changed-relocated',
  /** `--local-only` 跳过了不可归属的全局违规 */
  'local-only-globals-skipped',
  /** `--paths` 一个文件都没匹配上：什么都没判（**退出码也会非零**） */
  'paths-no-match',
  /** `--paths` 之外还有全局违规被过滤掉 */
  'paths-globals-filtered',
  /** `--severity` 过滤掉了 finding（含 error） */
  'severity-filtered',
  /** `include` 非空：域外的 ts/css 不参与契约判定（仍进依赖图） */
  'scan-scope-outside',
  /** `include` 未限制，但全项目 0 个 ts/css：本次没有任何东西被判定 */
  'scan-empty',
  /** `staged` 有文件取不到 index 内容，已退回工作区内容 */
  'staged-fallback',
  /** 配了 `viewLines` 但本范式没有页面级角色：这条阈值不会生效 */
  'viewlines-no-page-role',
  /** 因 `.gitignore`（git 判定）跳过：契约域外、不解析 */
  'vcs-ignored-skipped',
  /** `ignore`（项目边界）命中：不解析、不进图 */
  'ignore-skipped',
  /** 能力表只驱动 P06，未开启 P01 白名单 */
  'deps-allow-not-enabled',
  /** facts 缓存命中情况（省下的就是解析） */
  'facts-cache',
  /** facts 缓存作废（规范版本 / TS 版本 / 内容损坏）：本轮全量重算 */
  'facts-cache-reset',
  /** facts 缓存不可用（读写异常）：全量重算，不影响判定 */
  'facts-cache-unavailable',
  /** facts 缓存写入失败（不影响判定） */
  'facts-cache-write-failed',
  /** 某个文件读不出来（解析不了 → 那部分检查没跑） */
  'read-failed',
  /** `--update-coverage` 写入了覆盖率快照 */
  'coverage-updated',
  /** `--update-coverage` 没能写快照（未启用棘轮或读不到产物） */
  'coverage-update-skipped',
  /** 检测到 arch.baseline.json：基线机制已移除 */
  'legacy-baseline',
  /** C01 的「文案位名单」取自哪里（项目声明 / 组件库适配器默认 / 无）—— 换库时那一半会静默关掉 */
  'copy-list-source',
  /** 项目层 `enable: 'all'` 把预设没给的规则也打开了：副作用点名（能力没配的规则会空转） */
  'enable-all-expanded',
] as const

export type NoticeCode = (typeof NOTICE_CODES)[number]

/**
 * 规则**没跑**的原因（`skipped[].code`）—— 同样是契约，消费方不许匹配中文 `reason`。
 * 三种（R-142：**账目必须闭合** —— 注册的规则 ∈ `enabled` ∪ `skipped` ∪ 被 `disable` 的）：
 *   - `capability-missing`：能力未声明（只有这一种的 `missing` 非空）
 *   - `not-enabled`：注册了，但不在当前 `enable` 名单里（以前它落在所有桶之外，报告一个字都不提）
 *   - `filtered`：在名单里，但被 `--only` / `--domain` / `--min-level` 收窄掉了
 * 加新的就在这里加，并同步冻结测试。
 */
export const SKIP_CODES = ['capability-missing', 'not-enabled', 'filtered'] as const
export type SkipCode = (typeof SKIP_CODES)[number]

/** 一条「这条规则本次没跑」的记录：`code` 稳定可判，`reason` 只给人看 */
export interface SkippedRule {
  rule: string
  code: SkipCode
  /** 缺哪些能力 —— **当且仅当** `code === 'capability-missing'` 时非空（机读侧不必解析 `reason`） */
  missing: string[]
  reason: string
}

/** 一条机读自述：`code` 稳定可判，`text` 只给人看 */
export interface Diagnostic {
  code: NoticeCode
  text: string
}

/**
 * 契约枚举的**标准形状**（`NOTICE_CODES` / `SKIP_CODES` 都照这个来，见 DESIGN §6.9）：
 *
 * 1. **单一出处**：一份 `as const` 数组（编译期 union + 运行期可枚举，二者同源）；
 * 2. **派生常量表**：`NOTICE.PATHS_NO_MATCH` —— 给**没有类型系统**的消费方（`.mjs` adapter / shell / CI 脚本）用；
 *    TS 消费方其实不需要它（`NoticeCode` union 已经能在编译期抓住拼错的字面量），但同一个名字两种写法会分叉，
 *    所以这里**只派生、不手写**：加一个 code 只需要往数组里加一行。
 * 3. **派生守卫**：`isNoticeCode()` —— 消费方解析 JSON 时用来 fail-closed（不认识的 code 应当明说，
 *    而不是当它不存在然后静默少处理一类情况）。
 *
 * 名字规则：kebab-case → `SCREAMING_SNAKE`（`paths-no-match` → `PATHS_NO_MATCH`）。类型层用模板字面量推导，
 * 所以 `NOTICE.PATHS_NO_MATCH` 的类型就是字面量 `'paths-no-match'`，写错名字编译期即报错。
 */
type ScreamingCase<C extends string> = C extends `${infer Head}-${infer Rest}`
  ? `${Uppercase<Head>}_${ScreamingCase<Rest>}`
  : Uppercase<C>

const constantsOf = <C extends string>(
  codes: readonly C[],
): { readonly [K in C as ScreamingCase<K>]: K } =>
  Object.fromEntries(codes.map((code) => [code.toUpperCase().replace(/-/g, '_'), code])) as {
    readonly [K in C as ScreamingCase<K>]: K
  }

const codeGuard = <C extends string>(codes: readonly C[]) => {
  const known = new Set<string>(codes)
  return (value: unknown): value is C => typeof value === 'string' && known.has(value)
}

/** `notices[].code` 的常量表（从 `NOTICE_CODES` 派生，不是第二份清单） */
export const NOTICE = constantsOf(NOTICE_CODES)
/** 消费方解析 JSON 用：不认识的 code 要明说，不要静默少处理一类 */
export const isNoticeCode = codeGuard(NOTICE_CODES)

/** `skipped[].code` 的常量表（同样派生） */
export const SKIP = constantsOf(SKIP_CODES)
/** 消费方解析 JSON 用 */
export const isSkipCode = codeGuard(SKIP_CODES)
