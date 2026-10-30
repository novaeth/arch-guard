import { capabilityOf, wheelFingerprints } from '../data/wheel-fingerprints.js'
import { AdapterError } from '../engine/adapters.js'
import {
  parseCapabilities,
  type CapabilityDeclaration,
  type FingerprintOverride,
} from '../engine/deps.js'
import type { Preset } from '../engine/types.js'

export interface ContrastPair {
  fg: string
  bg: string
  /**
   * `bg` 是半透明柔底时，压在哪个底色上算对比度（`bg` 的 alpha = 1 时忽略）。
   *
   * 为什么要有它：`--success-soft` 这类"某语义色 + transparent"的底**本身不是一个能看的面** ——
   * 它压在卡片上还是压在画布上，观感完全不同。声明 parent 之后 D07 先把它压到 parent 上再算比值；
   * 不声明就退回压白色（暗色主题下那是灾难性的偏亮，会算出假通过）。
   * 它同时算作"被引用"，所以只被它引用的令牌不会被 D05 报成死令牌。
   */
  parent?: string
  usage: string
  min: number
}

export interface DesignSystemOptions {
  /** 主题名集合（明暗两套时是 ['dark','light']） */
  themes?: string[]
  /**
   * **外部运行时提供的令牌命名空间**（D04 / D05）：宿主不拥有主题、令牌由运行时或另一个包注入时，
   * 这些前缀的 `var()` 引用视为闭合，且不进死令牌账。
   *
   * 例：`[{ prefix: '--ext-', provider: '主题运行时' }]`。`prefix` 按**字符串前缀**匹配；
   * `provider` 只进文档 / `--render-docs`（不参与判定，也无法校验版本 —— 那归宿主依赖管理）。
   */
  externalTokens?: ExternalTokenNamespace[]
  /**
   * **本包之外（或契约扫描域之外）会消费本包令牌的文件**（D05）：相对配置根的 glob 或绝对路径，
   * 允许 `..`。D05 只读这些文件里的令牌名当"被引用"证据，不引入跨包图、不改扫描根。
   *
   * **0 命中 = 声明没生效**：此时 D05 与没声明时一致（该报的假死令牌照报），不会静默放过。
   */
  externalConsumers?: string[]
  /** 令牌目录（palette/foundation/scales/theme 都在这里） */
  tokenDir?: string
  /** 色板文件：颜色字面量的唯一出处 */
  paletteFile?: string
  /** 语义令牌文件：明暗两套 */
  themeFile?: string
  /** 全局样式根目录（tokens/ vendor/ base.css 等） */
  styleDir?: string
  /** 第三方组件库覆盖文件的目录（.ant-* 只许在这里） */
  vendorDir?: string
  /** 持久化 key 的文件（D08 校验它与 index.html 内联脚本一致） */
  storageFile?: string
  /** 哪些 key 必须出现在 index.html 里（默认主题 key） */
  htmlKeys?: string[]
  /**
   * 对比度基线：**项目专有**，默认空 —— 预设不替项目做决定。
   * 形状 `[{ fg, bg, usage, min, parent? }]`，token 名由项目按自己的语义层填。
   * `parent` 只在 `bg` 是半透明柔底时才需要（见 `ContrastPair`）。
   */
  contrastPairs?: ContrastPair[]
  /**
   * **静态令牌前缀**（D02 / D18）：例如 `'--sh-static-'`。色板只放静态值、组件样式只消费语义令牌 ——
   * 两个「不能跨层用」的方向都靠它判；**不声明这两条就不判**（前缀是项目的事实）。
   */
  staticPrefix?: string
  /**
   * 数值三族的白名单（D12 长度 / D13 层级 / D14 时长）：**声明哪一族才判哪一族**。
   * 例：`[{ rule: 'D12', allow: ['4px','8px','12px'] }, { rule: 'D13', allow: ['1','10'] }]`
   */
  valueWhitelists?: { rule: string; allow: string[] }[]
  /**
   * **策略 / 阈值数字的家**（D20）：这些名字（对象属性名或常量名）的数字必须有落点。
   * 例：`[{ name: '请求策略', names: ['staleTime','retry','refetchInterval'], in: ['src/shared/api/queryClient.ts'] }]`
   * —— 声明之外的文件里给这些名字写数字字面量就报；**不声明不判**（哪些数字算"策略"是项目的事实）。
   */
  numberHomes?: NumberHome[]
}

/** D20 的声明形状：一组"该有家的名字" + 它们的家（glob） */
export interface NumberHome {
  /** 组名（进报告："请求策略的数字该在 …"） */
  name: string
  /**
   * 哪些名字算这一类：属性名（`staleTime`）或常量名（`PAGE_SIZE`）。
   * **可以不写** —— 缺省取组件库/方案适配器声明的名字（如 `reactQueryKit()` 的 `numberNames`：
   * `staleTime` / `retry` / `gcTime`… 那是**库的事实**）。项目自己的常量（`PAGE_SIZE`）仍然要在这里列。
   */
  names?: string[]
  /** 只许出现在哪些落点（glob 列表） */
  in: string[]
}

/** 外部提供的令牌命名空间（D04 / D05）：命名空间是提供方能承诺的最小事实，不抄令牌名单 */
export interface ExternalTokenNamespace {
  /** 命名空间前缀（以 `--` 开头，如 `--ext-`）；按**字符串前缀**匹配 */
  prefix: string
  /** 提供方（只进文档 / `--render-docs`；不参与判定） */
  provider?: string
}

/**
 * 外部令牌声明**配置期 fail-closed**：形状不对直接抛，而不是"看起来配了、其实不生效"。
 * 校验放在预设里（与 `deps()` 的 fail-closed 同口径），错误信息给出正确形态。
 */
function normalizeExternalTokens(
  input: DesignSystemOptions['externalTokens'],
): ExternalTokenNamespace[] {
  if (input === undefined) return []
  if (!Array.isArray(input)) {
    throw new Error(
      'designSystem({ externalTokens }) 必须是数组：' +
        `[{ prefix: '--ext-', provider: '主题运行时' }]（当前 ${JSON.stringify(input)}）`,
    )
  }
  const seen = new Set<string>()
  return input.map((item) => {
    if (item === null || typeof item !== 'object') {
      throw new Error(
        `designSystem({ externalTokens }) 的每一项必须是对象（当前 ${JSON.stringify(item)}）`,
      )
    }
    const prefix = item.prefix
    if (
      typeof prefix !== 'string' ||
      !prefix.startsWith('--') ||
      prefix.length <= 2 ||
      /\s/.test(prefix)
    ) {
      throw new Error(
        `designSystem({ externalTokens }) 的 prefix 必须形如 '--ext-'（以 -- 开头、不含空白）：${JSON.stringify(prefix)}`,
      )
    }
    if (seen.has(prefix)) {
      throw new Error(
        `designSystem({ externalTokens }) 的 prefix 重复：${prefix}（同一命名空间只声明一次）`,
      )
    }
    seen.add(prefix)
    if (
      item.provider !== undefined &&
      (typeof item.provider !== 'string' || item.provider.trim() === '')
    ) {
      throw new Error(
        `designSystem({ externalTokens }) 的 provider 写了就必须是非空字符串：${JSON.stringify(item.provider)}`,
      )
    }
    return { prefix, ...(item.provider === undefined ? {} : { provider: item.provider.trim() }) }
  })
}

function normalizeExternalConsumers(input: DesignSystemOptions['externalConsumers']): string[] {
  if (input === undefined) return []
  if (!Array.isArray(input)) {
    throw new Error(
      'designSystem({ externalConsumers }) 必须是字符串数组（相对配置根的 glob 或绝对路径）：' +
        `['../shared/src/**/*.css']（当前 ${JSON.stringify(input)}）`,
    )
  }
  const out: string[] = []
  for (const pattern of input) {
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      throw new Error(
        `designSystem({ externalConsumers }) 的每一项必须是非空字符串：${JSON.stringify(pattern)}`,
      )
    }
    if (!out.includes(pattern.trim())) out.push(pattern.trim())
  }
  return out
}

/**
 * 设计系统预设：令牌分层、颜色唯一出处、明暗双份、对比度、魔法数字、样式落点。
 * 规则实现在 packs 里；本预设只贡献参数（换项目改这里，不改引擎）。
 */
export function designSystem(options: DesignSystemOptions = {}): Preset {
  /**
   * **落点由范式声明，域预设只写用户显式给的**（见 `Preset.paradigm`）。
   *
   * 为什么：`canonical()` 与 `fsd()` 各有惯用落点（三根是 `shared/styles`，FSD 是官方 app 段的 `app/styles`）。
   * 如果这里塞三根默认值，`[fsd(), designSystem()]` 就会被悄悄改回三根路径 —— **组合起来就不符合所选规范了**（实测过）。
   * 谁都没声明时，`designParams()` 的内置默认兜底（仍是三根路径），行为与旧版一致。
   */
  const paths: Record<string, unknown> = {}
  if (options.styleDir) {
    // 给了 styleDir 时其余路径从它推导（少写几行）；任何一项显式给出都直接采纳
    paths.styleDir = options.styleDir
    paths.tokenDir = options.tokenDir ?? `${options.styleDir}/tokens`
    paths.vendorDir = options.vendorDir ?? `${options.styleDir}/vendor`
    paths.paletteFile = options.paletteFile ?? `${options.styleDir}/tokens/palette.css`
    paths.themeFile = options.themeFile ?? `${options.styleDir}/tokens/theme.css`
  } else {
    if (options.tokenDir) paths.tokenDir = options.tokenDir
    if (options.vendorDir) paths.vendorDir = options.vendorDir
    if (options.paletteFile) paths.paletteFile = options.paletteFile
    if (options.themeFile) paths.themeFile = options.themeFile
  }
  if (options.storageFile) paths.storageFile = options.storageFile
  const externalTokens = normalizeExternalTokens(options.externalTokens)
  const externalConsumers = normalizeExternalConsumers(options.externalConsumers)
  return {
    /**
     * 本预设贡献 **D 域全部规则**（多个预设之间是**并集**，见 `Preset.enable` 的说明）。
     *
     * `D22` / `D23`（缓存键 / 路由路径的唯一出处）由 `dataLayer()` / `router()` 那侧**也**启用 ——
     * 域预设列全、方案面预设列自己消费的那几条，两处都列不冲突（并集），
     * 保证「只装设计系统」和「只装方案适配器」两种配法都不会漏挂规则（`engine-unit` 那条守卫盯着）。
     * 它们真正的开关是**能力**：没声明 `queryKeyFrom` / `pathSource` 就明列停用。
     */
    enable: [
      'D03',
      'D01',
      'D09',
      'D04',
      'D05',
      'D06',
      'D07',
      'D08',
      'D10',
      'D10b',
      'D11',
      'D16',
      'D17',
      'D21',
      'D22',
      'D23',
      'D12',
      'D13',
      'D14',
      'D24',
      'D25',
      'D26',
      'D27',
      'D28',
      'D29',
      'D30',
      'D02',
      'D18',
      'D15',
      'D19',
      'D20',
    ],
    params: {
      /**
       * 显式标记「项目声明了设计系统」。D21 靠它把两种情况分开：
       * - 没加这个预设 → D 域安静空转（项目本来就不做设计系统，不该被吵）
       * - 加了但路径指空 → 报出来（否则门禁显示"通过"，其实 D 域一条都没查）
       * 光看其余参数分不出来：`designParams()` 带内置默认路径。
       */
      designSystemDeclared: true,
      themes: options.themes ?? ['dark', 'light'],
      htmlKeys: options.htmlKeys ?? ['theme'],
      valueWhitelists: options.valueWhitelists ?? [],
      ...(options.staticPrefix ? { staticPrefix: options.staticPrefix } : {}),
      // 只在给了的时候落进 params：D20 的 `requires: ['designSystem.numberHomes']` 靠"有没有这个键"判声明
      ...(options.numberHomes ? { numberHomes: options.numberHomes } : {}),
      // 外部令牌 / 外部消费者：缺省不落键（行为与旧版一致），声明了才进 `--render-docs`
      ...(externalTokens.length > 0 ? { externalTokens } : {}),
      ...(externalConsumers.length > 0 ? { externalConsumers } : {}),
      contrastPairs: options.contrastPairs ?? [],
      // 落点：用户显式给的（paths）放最后，压过任何默认推导
      ...paths,
    },
  }
}

export interface DepsOptions {
  /** fail-closed 白名单：声明后，任何未登记的运行时依赖都报错（P01） */
  allow?: string[]
  /** 明确禁用（P02）。**白名单已启用时它是多余的**，只在想给某几个库更明确的报错时用 */
  deny?: string[]
  /**
   * 能力 → 首选方案：`{ 'cli-args': 'commander', datetime: 'dayjs' }`。
   *
   * 值也可以是**对象形态**（R-154）：`preferred` + `syntax` / `softSyntax` + `apiNames` + `hint`，
   * 用来登记内置表没有的能力（企业请求层 / 事件总线 / 内部库）。对象与内置能力走同一张生效表。
   */
  capabilities?: Record<string, CapabilityDeclaration>
  /**
   * 开启「声明但未使用」（P08，warn）。**默认关**：只按 import 判会误伤
   * 自动 JSX 运行时（react）、副作用型依赖与只在构建配置里用的包。
   */
  unusedDeps?: boolean
  /**
   * 覆盖某个能力的**指纹证据**（R-73）：加 / 删 pattern、改 API 名清单、放宽 `allowOwn`。
   * 首选方案不在这里 —— 那是 `capabilities` 的活（一个事实一个出处）。能力名可以是内置能力或自定义能力。
   */
  fingerprints?: FingerprintOverride[]
}

export function deps(options: DepsOptions = {}): Preset {
  // 校验放在这里（宿主写配置的地方）而不是规则里：
  // 能力名拼错、证据缺失、pattern 写不成正则 —— 都是"配了但不生效"，必须当场报错
  const parsed = parseCapabilities(options.capabilities ?? {})
  if (parsed.problems.length > 0) {
    throw new AdapterError(
      `deps() 的 capabilities 配置有误：\n  - ${parsed.problems.join('\n  - ')}`,
    )
  }
  const customNames = new Set(parsed.customCapabilities.map((entry) => entry.capability))
  for (const override of options.fingerprints ?? []) {
    const entry = capabilityOf(override.capability)
    if (!entry && !customNames.has(override.capability)) {
      const known = [...wheelFingerprints.map((item) => item.capability), ...customNames].join(
        ' / ',
      )
      throw new AdapterError(
        `deps() 的指纹覆盖指向不存在的能力「${override.capability}」\n` +
          `（内置能力与本次声明的自定义能力：${known}）`,
      )
    }
    for (const field of [
      'addSyntax',
      'removeSyntax',
      'addSoftSyntax',
      'removeSoftSyntax',
    ] as const) {
      for (const pattern of override[field] ?? []) {
        try {
          new RegExp(pattern)
        } catch {
          throw new AdapterError(
            `deps() 的指纹覆盖 ${field} 里「${pattern}」不是合法正则 —— 这条覆盖永远不会命中`,
          )
        }
      }
    }
  }
  return {
    enable: ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P11', 'P12'],
    params: {
      // 默认两条都为空：**预设不替项目做选型决定**。
      // 项目要么用 allow（fail-closed，推荐），要么用 deny（只表达少数硬禁令），不必两者都维护。
      allow: options.allow ?? [],
      deny: options.deny ?? [],
      capabilities: options.capabilities ?? {},
      fingerprints: options.fingerprints ?? [],
      unusedDeps: options.unusedDeps === true,
    },
  }
}
