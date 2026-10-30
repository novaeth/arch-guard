import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

import { defaultFramework, frameworkSourceOf, frameworkSources } from '../data/framework-sources.js'
import { defineAdapter } from './adapters.js'
import type { Diagnostic } from './codes.js'
import { DEFAULT_NAMING, DEFAULT_THRESHOLDS } from './defaults.js'
import { resolveProject } from './merge-spec.js'
import { resolveStructure } from './structure.js'
import { ADVICE_SIGNALS } from './advice-types.js'
import { mergeRules, type SourceFormBinding } from './source-form.js'
import type { StructureSpec } from './structure-spec.js'
import type {
  Adapter,
  AdviceAllowEntry,
  Config,
  ConfigOverrides,
  ExceptionEntry,
  NamingRules,
  Preset,
  RoleDescriptor,
  Rule,
  Thresholds,
} from './types.js'
import { exists, mergePresets } from './util.js'
import { enableAllNotice, resolveEnable, validateSeverity } from './config-policy.js'

export interface RawProjectConfig {
  /** 配置格式版本；与本工具不匹配时显式报错 */
  specVersion?: string
  presets?: Preset[]
  /**
   * **源码形态**（`typescript` / `react` / …）：标量、一处真相（ADR-0009）。
   * 它决定"哪些源码扩展名归我们管"以及"用哪一份内置规则集"；缺省 = 数据表里第一条（`typescript`）。
   * 规则要**追加**就写 `overrides.customRules`（不是造一个"包"）。
   */
  sourceForm?: string
  /** 项目差异只写这里；与预设合并后即最终配置 */
  overrides?: ConfigOverrides
}

export interface LoadedConfig {
  config: Config
  notices: Diagnostic[]
  path: string
}

let importCounter = 0

/** 别名只从 tsconfig 读（单一出处，避免两处真相） */
export function aliasesFromTsconfig(root: string): {
  aliases: Record<string, string>
  notice?: string
} {
  const file = join(root, 'tsconfig.json')
  if (!exists(file)) return { aliases: {} }
  try {
    /**
     * Vite 官方模板的根 tsconfig.json 只有 `references` + `files: []`，真正的 `paths` 在
     * tsconfig.app.json 里。只读根配置会让所有 `@/` 导入解析不了 —— 依赖图随之全空，
     * 图规则（S04–S09/S15/S18）在真实项目上会集体失明甚至误报「全是孤儿」。
     * 所以这里顺着 references 往下找 paths（限深，避免环）。
     */
    const readOne = (
      configPath: string,
    ): { baseUrl?: string; paths?: Record<string, string[]> } | null => {
      const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path))
      if (read.error) return null
      return (
        (
          read.config as {
            compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
            references?: { path: string }[]
          }
        ).compilerOptions ?? null
      )
    }
    const readRefs = (
      configPath: string,
      depth: number,
    ): { baseUrl?: string; paths?: Record<string, string[]> } | null => {
      if (depth > 3) return null
      const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path))
      if (read.error) return null
      const config = read.config as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
        references?: { path: string }[]
      }
      if (config.compilerOptions?.paths) return config.compilerOptions
      for (const reference of config.references ?? []) {
        const next = resolve(dirname(configPath), reference.path)
        const found = readRefs(exists(next) ? next : `${next}.json`, depth + 1)
        if (found) return found
      }
      return null
    }
    const options = readOne(file)?.paths
      ? (readOne(file) ?? undefined)
      : (readRefs(file, 0) ?? undefined)
    if (!options?.paths) return { aliases: {} }
    const viaReferences = !readOne(file)?.paths
    const baseUrl = (options.baseUrl ?? '.').replace(/^\.\//, '').replace(/\/$/, '')
    const aliases: Record<string, string> = {}
    for (const [key, targets] of Object.entries(options.paths)) {
      const target = targets[0]
      if (!target) continue
      const cleaned = target.replace(/\/\*$/, '').replace(/^\.\//, '')
      const alias = key.replace(/\/\*$/, '')
      aliases[alias] =
        baseUrl && baseUrl !== '.' ? `${baseUrl}/${cleaned}`.replace(/\/+/g, '/') : cleaned
    }
    return {
      aliases,
      notice: viaReferences
        ? `别名取自 tsconfig 的 references 链（根配置只有 references，${Object.keys(aliases).length} 条）`
        : `别名取自 tsconfig.json 的 paths（${Object.keys(aliases).length} 条）`,
    }
  } catch {
    return { aliases: {} }
  }
}

/** 配置格式版本 */
export const CONFIG_SPEC_VERSION = '2'

/**
 * **键白名单**（R-113）。为什么用 `Record<keyof X, true>` 写而不是散着的字符串数组：
 * 类型加了字段这里就**编译不过** —— 白名单不会悄悄落后于契约（它自己就是被门禁管着的）。
 *
 * 为什么需要它：声明型配置最怕"写了、看着对、实际没生效"。真实踩过 —— 把 `addRoles` 放进
 * `overrides.structure`（键名对、值是好的，只是放错一层），引擎静默忽略，S01 照旧报
 * "域根散件"，人只会去怀疑自己的 glob 写错了。
 */
const KNOWN_TOP_KEYS: Record<keyof RawProjectConfig, true> = {
  specVersion: true,
  presets: true,
  sourceForm: true,
  overrides: true,
}

/**
 * `overrides` 的可用键 = `ConfigOverrides` 的键（**显式枚举**，不是 `Partial<Config>`）。
 *
 * 为什么不再从 `Config` 推导：那样每个新字段都会顺手变成"可写但没人读"的键 ——
 * 实测就有两个（`root` / `paradigm`）。现在可写的键必须有人读，否则它压根不在类型里。
 */
const KNOWN_OVERRIDE_KEYS: Record<keyof ConfigOverrides, true> = {
  srcRoot: true,
  layout: true,
  roles: true,
  addRoles: true,
  naming: true,
  thresholds: true,
  adapters: true,
  enable: true,
  disable: true,
  structure: true,
  params: true,
  entries: true,
  ignore: true,
  include: true,
  exceptions: true,
  adviceAllow: true,
  aliases: true,
  customRules: true,
  severity: true,
}

const KNOWN_STRUCTURE_KEYS: Record<keyof StructureSpec, true> = {
  order: true,
  isolate: true,
  publicApi: true,
  publicApiUnits: true,
  segmentedGroups: true,
  reservedNames: true,
  groupCountLimits: true,
  directoryItemLimits: true,
  groupInDegree: true,
  nameCollisions: true,
  repetitiveNaming: true,
  pluralConsistency: true,
  degreeLimits: true,
  importLocality: true,
  couplingLimits: true,
  migrating: true,
  clientState: true,
  authRedirects: true,
  maxRelativeUp: true,
  generated: true,
  // 运行时面（R-139 / R-140，ADR-0008）：`runtimes` 给运行时与入口，`faces` 给面文件与面值模式
  runtimes: true,
  faces: true,
}

/** 不认识的键直接拒（fail-closed）：声明了却没人读，等于这条纪律根本没配 */
function assertKnownKeys(
  where: string,
  value: Record<string, unknown>,
  known: Record<string, true>,
  hint = '',
): void {
  const unknown = Object.keys(value).filter((key) => !(key in known))
  if (unknown.length === 0) return
  throw new Error(
    `${where} 里有不认识的键：${unknown.join(' / ')}\n` +
      `可用：${Object.keys(known).join(' / ')}\n` +
      (hint === '' ? '' : `${hint}\n`) +
      '（不认识的键会被静默忽略 —— 与其让人去怀疑自己的 glob，不如现在就说）',
  )
}

export async function loadConfig(options: {
  root: string
  configPath?: string
  /**
   * **调用方注入的源码形态实现**（`rules` + `adapters`）。引擎不认识任何"包" ——
   * 实现是代码（层 4），依赖方向只能是它 → 引擎，所以由调用方传进来（CLI 传内置的那份）。
   * 宿主不写这个：配置里只写 `sourceForm: 'react'`（ADR-0009）。
   */
  sourceForms?: SourceFormBinding[]
  /**
   * **调用方提供的完整规则集**：给了就替代内置集（程序化调用 / 单测 / 工具集成）。
   * 与配置里的 `overrides.customRules`（**追加**）语义不同，名字也不同。
   */
  ruleSet?: Rule[]
}): Promise<LoadedConfig> {
  const { root } = options
  const path = options.configPath ? join(root, options.configPath) : join(root, 'arch.config.mjs')
  if (!exists(path)) {
    throw new Error(
      `找不到配置文件：${path}\n（arch-guard 不会回退猜测；请用 --config 指定，或在项目根放 arch.config.mjs ——
没有的话跑 \`arch-guard init --ui <组件库> --data <取数> --i18n <文案>\` 生成一份）`,
    )
  }
  importCounter += 1
  const module = (await import(`${pathToFileURL(path).href}?v=${importCounter}`)) as {
    default?: RawProjectConfig
    presets?: Preset[]
  }
  const raw: RawProjectConfig = module.default ?? { presets: module.presets }
  if (raw.specVersion !== undefined && raw.specVersion !== CONFIG_SPEC_VERSION) {
    throw new Error(
      `配置 specVersion 不支持：${raw.specVersion}（本工具是 ${CONFIG_SPEC_VERSION}）\n` +
        '（版本不同意味着配置语义可能变了，不猜测、不降级）',
    )
  }

  assertKnownKeys('arch.config.mjs', raw as unknown as Record<string, unknown>, KNOWN_TOP_KEYS)
  if (raw.overrides !== undefined) {
    const values = raw.overrides as unknown as Record<string, unknown>
    assertKnownKeys(
      'overrides',
      values,
      KNOWN_OVERRIDE_KEYS,
      '判据：要选片段 → `presets`；要选源码形态 → `sourceForm`；**其余全是 `overrides`**（`addRoles` / `include` / `entries` 与 `structure` 平级）。',
    )
    if (values.structure !== undefined) {
      assertKnownKeys(
        'overrides.structure',
        values.structure as Record<string, unknown>,
        KNOWN_STRUCTURE_KEYS,
        '提示：结构声明（层序 / 隔离 / 公开面…）写在 `structure` 里；`addRoles` 在它**外面**（overrides 层）。',
      )
    }
  }

  const notices: Diagnostic[] = []
  const presetList = raw.presets ?? []
  /**
   * 一个配置只能有**一个范式预设**。角色表是整体替换的，两个范式混用会得到
   * "角色表来自后者、`layout` 逐键混合、`structure` 取并集"的组合 —— 静默的错误组合，
   * 所以这里直接报错（fail-closed），而不是让门禁去量一个不存在的目录。
   */
  const paradigms = [...new Set(presetList.map((item) => item.paradigm).filter(Boolean))]
  if (paradigms.length > 1) {
    throw new Error(
      `一个配置只能有一个范式预设，却同时出现了：${paradigms.join(' / ')}。` +
        'canonical / library / fsd 各带一份角色表与布局，混用会得到"角色表一半、布局另一半"的错误组合。' +
        '要在某个范式之上加自己的目录，用 addRoles（追加）而不是再叠加一个范式。',
    )
  }
  const preset = mergePresets(presetList)
  const overrides = raw.overrides ?? {}

  /* ---- 源码形态：**一个标量**，实现由调用方注入的绑定表给出（ADR-0009） ---- */
  const sourceForms = options.sourceForms ?? []
  /** 宿主**显式声明**的形态（没写 ≠ 声明 typescript —— 缺省由数据表给，见下） */
  const declaredSourceForm = raw.sourceForm
  const sourceFormId = declaredSourceForm ?? sourceForms[0]?.id ?? defaultFramework
  const sourceForm = frameworkSourceOf(sourceFormId)
  // 认不出的取值、或「声明了某个形态却没有实现」都必须 fail-closed：
  // 否则「本工具量不了这个项目」会表现为「扫到 0 个文件 → ✔ 通过」的假绿。
  if (!sourceForm) {
    throw new Error(
      `未知的 sourceForm：${sourceFormId}（已登记：${frameworkSources.map((item) => item.id).join(' / ')}）`,
    )
  }
  const binding = sourceForms.find((item) => item.id === sourceForm.id)
  /**
   * 规则集的**底**：调用方给的完整集优先，否则用绑定里的内置集。
   *
   * 两种"没有"要分开（判据不同）：
   * - 调用方**注入了一份绑定表**，而宿主声明的形态不在其中 → 配置期**报错**
   *   （说好要量 vue 却量不了，拿它跑只会得到「0 个文件 → 通过」的假绿）；
   * - 调用方**一行都没注入**（`sourceForms` 为空）→ 规则集为空 + 自述。这是**调用方**的省略：
   *   `loadConfig` 仍然把配置语义解析完（很多调用方只关心角色 / 布局 / 结构），
   *   而 `runGuard` 会在"没有任何可跑的规则"那里硬报错 —— 不会静默通过。
   */
  const baseRules = options.ruleSet ?? binding?.rules
  if (!baseRules && sourceForms.length > 0) {
    throw new Error(
      `本工具还没有 ${sourceForm.id} 的实现（现在只有 ${sourceForms.map((item) => item.id).join(' / ') || '（调用方一个都没注入）'}）：` +
        `拿它跑只会得到「0 个文件 → 通过」的假绿，所以这里直接拒绝，而不是静默通过\n` +
        `（写 sourceForm: '${sourceForms[0]?.id ?? 'typescript'}'，或让调用方传 sourceForms / ruleSet）`,
    )
  }
  /**
   * **规则集**（R-143）：内置集 + `overrides.customRules` 追加，**解析期算定**成 `Config.rules`。
   * 以前 `run.ts` 与 CLI 各推一遍（两处真相）；合并的冲突语义只有一份实现（`mergeRules`）。
   */
  const rules = mergeRules('overrides.customRules', baseRules ?? [], overrides.customRules ?? [])

  if (!baseRules && sourceForms.length === 0) {
    notices.push({
      code: 'source-form-missing',
      text: '调用方没有注入源码形态实现（sourceForms）：规则集为空，本次只解析了配置语义',
    })
  }

  /**
   * 声明的适配器 facet 必须被这套规则集支持（fail-closed）——
   * 否则就是"配了却没有任何规则读它"。
   * 调用方用 `ruleSet` 自带规则集、又没注入绑定时**不查**：那时规则集的所有权在调用方手里。
   */
  if (binding) {
    const supported = new Set(binding.adapters)
    const configured = Object.keys({ ...preset.adapters, ...overrides.adapters })
    const unknown = configured.filter((facet) => !supported.has(facet))
    if (unknown.length > 0) {
      throw new Error(
        `源码形态 ${binding.id} 的规则集不支持这些适配器 facet：${unknown.join(' / ')}（支持：${[...supported].join(' / ')}）\n` +
          '（每个 facet 都必须有规则消费它 —— 没有消费者的 facet 已按"声明必须有消费者"删除）',
      )
    }
  }

  // 预设 + 项目层 → 最终值：语义由 `MERGE_SPEC` 声明，执行在 `resolveProject`（R-144）
  const project = resolveProject(
    preset as unknown as Record<string, unknown>,
    overrides as unknown as Record<string, unknown>,
  )

  const expandedNotice = enableAllNotice(project, preset, rules, overrides)
  if (expandedNotice) notices.push(expandedNotice)

  // 布局默认值属于预设（canonical），引擎不假设任何项目布局（见 §15.2 P3）
  const layout = project.layout
  if (!layout) {
    throw new Error('配置里没有 layout（项目布局）。请引入结构预设，例如 presets: [canonical()]')
  }

  const tsconfigAliases = aliasesFromTsconfig(root)
  if (tsconfigAliases.notice) notices.push({ code: 'config-aliases', text: tsconfigAliases.notice })

  // `aliases` 是 `special`：底来自 tsconfig（不是预设），项目层逐键覆盖
  const aliases: Record<string, string> = { ...tsconfigAliases.aliases, ...overrides.aliases }
  const entries = project.entries ?? [`${layout.app}/main.tsx`]
  if (exists(join(root, 'index.html'))) entries.push('index.html')

  const adapters = { ...preset.adapters, ...overrides.adapters }
  /**
   * **合并后的适配器全部过一遍 `defineAdapter`**：预设里的本来就校验过（幂等重跑），
   * 但 `overrides.adapters` 是**绕开 kit 的通道** —— 以前它既不校验字段（拼错 = 静默失能），
   * 又能在面没登记时让引擎彻底不认识它（`facetOfCapabilityRoot` 找不到 → 能力协商看不见、
   * `--explain` 也不提它）。同一个面的两处真相已经由 `mergePresets` 拦住，这里拦住"没校验的通道"。
   */
  for (const [facet, adapter] of Object.entries(adapters)) {
    adapters[facet] = defineAdapter(facet, { ...(adapter as Record<string, unknown>) })
  }
  /**
   * **适配器缺的落点可以由范式通过 `params` 声明**（`canonical()` / `fsd()` 的 `i18nDir`）。
   *
   * 在这一处补齐，而不是让能力判定 / i18n 索引 / 报告各自兜底：下游只认"一个完整的适配器"。
   * 为什么需要它：`copy()` 不该写死默认路径 —— 否则 `canonical({ src: 'app-src' })` 时
   * i18n 目录不跟着走（和 `designSystem()` 塞三根默认值是同一类毛病）。
   */
  const i18nAdapter = adapters.i18n as { from?: string[]; resourceDir?: string } | undefined
  const usesI18nLibrary = Array.isArray(i18nAdapter?.from) && i18nAdapter.from.length > 0
  if (
    i18nAdapter &&
    usesI18nLibrary &&
    !i18nAdapter.resourceDir &&
    typeof project.params.i18nDir === 'string'
  ) {
    // 只在适配器**声明了 i18n 库**（`from` 非空）时补落点：
    // `noneI18nKit()` 表达的是"项目不用 i18n"，给它补落点会让 C 域照跑、C07 还会误报"声明了 i18n 却零资源"。
    adapters.i18n = { ...i18nAdapter, resourceDir: project.params.i18nDir } as Adapter
  }

  // 追加角色：项目自己的目录（`src/legacy/**`）加在范式角色表之上，不必整份重写
  const roles = [...(project.roles as RoleDescriptor[]), ...(project.addRoles as RoleDescriptor[])]

  const config: Config = {
    root,
    srcRoot: project.srcRoot ?? 'src',
    layout,
    // 角色表：范式角色表**整体替换**（`overrides.roles`），再在其上**追加** addRoles
    // （预设的 addRoles 与 overrides 的 addRoles 都追加 —— 项目自己的目录不必重写范式角色表）。
    // 注：Config 上不再单独保留 `addRoles` 字段 —— 它曾被赋值却无人读，而 `roles` 已含追加结果，
    // 留着就是同一个事实的第二处存放。结构声明的校验也要看到**同一份** roles，所以先算成局部常量。
    roles,
    naming: { ...DEFAULT_NAMING, ...(project.naming as Partial<NamingRules>) },
    thresholds: { ...DEFAULT_THRESHOLDS, ...(project.thresholds as Partial<Thresholds>) },
    adapters,
    // `enable`：预设之间是并集（`all` 吸收，special），项目层是**整体替换**（表里写着）；
    // 谁都没写 = 'all'（"全部注册的规则"）
    enable: resolveEnable(project.enable as string[] | 'all' | undefined, overrides),
    disable: project.disable,
    severity: validateSeverity(project.severity, rules),
    // 结构声明同样是加法：预设与 overrides 合并后**统一校验**（维度/角色必须真实存在，见 resolveStructure）
    structure: resolveStructure({
      preset: preset.structure,
      overrides: overrides.structure,
      roles,
    }),
    params: project.params,
    entries,
    ignore: project.ignore,
    // 契约扫描域：预设之间拼接、项目层替换（表里写着）；空 = 不限制
    include: project.include,
    sourceForm: sourceForm.id,
    rules,
    // 范式标识带进最终配置：`placementHint` / `--explain` 靠它区分「三根 / 库 / FSD」三套落点
    ...(paradigms[0] ? { paradigm: paradigms[0] } : {}),
    exceptions: project.exceptions as ExceptionEntry[],
    adviceAllow: project.adviceAllow as AdviceAllowEntry[],
    aliases,
  }

  // 例外是唯一的宽松通道（基线已移除），所以必须指名"哪条规则对哪类文件不适用"、并写清理由
  const badException = config.exceptions.find(
    (entry) => !entry.rule?.trim() || !entry.glob?.trim() || !entry.reason?.trim(),
  )
  if (badException !== undefined) {
    throw new Error(
      'exceptions 的每一条都必须写清 rule / glob / reason —— 例外是「某条规则对某类文件不适用」，' +
        '不是「某个文件免检」：' +
        JSON.stringify(badException),
    )
  }
  const badExpiry = config.exceptions.find(
    (entry) => entry.expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires),
  )
  if (badExpiry !== undefined) {
    throw new Error(`exceptions 的 expires 必须是 YYYY-MM-DD：${JSON.stringify(badExpiry)}`)
  }
  // 建议的例外（R-121）：与 exceptions 同一套纪律 —— 指名信号 / 写理由 / 到期必过期
  const badAllow = config.adviceAllow.find(
    (entry) => !entry.signal?.trim() || !entry.glob?.trim() || !entry.reason?.trim(),
  )
  if (badAllow !== undefined) {
    throw new Error(
      'adviceAllow 的每一条都必须写清 signal / glob / reason —— 它是「这条建议对这类主体不适用」，' +
        '不是「别提示我」：' +
        JSON.stringify(badAllow),
    )
  }
  const badSignal = config.adviceAllow.find(
    (entry) => !(ADVICE_SIGNALS as readonly string[]).includes(entry.signal),
  )
  if (badSignal !== undefined) {
    throw new Error(
      `adviceAllow 里不认识的信号：${badSignal.signal}（可用：${ADVICE_SIGNALS.join(' / ')}）\n` +
        '（拼错的信号等于没写 —— 与其静默不生效，不如现在就说）',
    )
  }
  const badAllowExpiry = config.adviceAllow.find(
    (entry) => entry.expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires),
  )
  if (badAllowExpiry !== undefined) {
    throw new Error(`adviceAllow 的 expires 必须是 YYYY-MM-DD：${JSON.stringify(badAllowExpiry)}`)
  }

  if (config.roles.length === 0) {
    throw new Error(
      '配置里没有角色表（roles）。请至少引入一个结构预设，例如 presets: [canonical()]',
    )
  }
  if (!exists(join(root, 'package.json')))
    notices.push({
      code: 'config-no-manifest',
      text: '项目根没有 package.json：依赖类规则会被跳过',
    })

  return { config, notices, path }
}
