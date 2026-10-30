import type { Diagnostic } from './codes.js'
import type { ScanResult } from './scan.js'
import { matchesApi } from './api-match.js'
import { globToRegExp } from './util.js'
import { recipeFor } from '../data/capability-recipes.js'
import { CALL_SITE_SOURCES } from '../data/call-site-sources.js'
import { resolveCallSiteApis } from './call-site-sources.js'
import type { CallSiteGroupLike } from './call-site-sources.js'
import type { Config, Facts } from './types.js'

/**
 * **自述**（`notices`）：把"声明了什么、跳过了什么、什么不会生效、谁在生效"讲清楚。
 *
 * 抽成独立模块有两个原因：`runGuard` 有函数长度上限（与 `git.ts` / `filters.ts` / `collect.ts`
 * 同一处理方式），而它们本身也内聚 —— 都要求"说的每一句都能被机读判到"，且都带稳定 `code`。
 */

/** 扫描域 / 边界 / 阈值这三类自述 */
export function pushScanNotices(config: Config, scan: ScanResult, notices: Diagnostic[]): void {
  if (config.include.length > 0) {
    notices.push({
      code: 'scan-scope-outside',
      text: `契约扫描域 ${config.include.join(' , ')}：域外 ${scan.outside.length} 个 ts/css 不参与目录契约判定（仍在依赖图里）`,
    })
  } else if (scan.records.length === 0) {
    // include 不限（引擎默认）且全树 0 个源码：没有任何东西被判定，必须说出来。
    // include 非空的情况由 S24 报错（那是配置写错，不是空仓库）。
    notices.push({
      code: 'scan-empty',
      text: 'include 未限制，但全项目 0 个 ts/css 文件：本次没有任何东西被判定',
    })
  }

  // 阈值 `viewLines` 只对**页面级**角色生效（`pageLike` / `views` 槽位）：本范式没有这类角色时
  // 它**永远不会生效** —— 配了却没效果正是本仓最忌讳的静默失效，所以当场自述（D21 同款套路）
  if (
    config.thresholds.viewLines !== config.thresholds.fileLines &&
    !config.roles.some((role) => role.pageLike === true || role.slot === 'views')
  ) {
    notices.push({
      code: 'viewlines-no-page-role',
      text: `阈值 viewLines=${config.thresholds.viewLines} 已设，但本范式没有页面级角色（pageLike / views 槽位）：这条阈值不会生效`,
    })
  }

  // `ignore`（项目边界）跳过了什么必须自述：它是"别碰"，被跳过的东西**不进文件集、不解析、不进图**，
  // 而报告此前完全不提它 —— 宿主把某个源码目录误写进 ignore 时，表现就是"悄无声息地不判了"
  if (scan.vcsIgnored.length > 0) {
    notices.push({
      code: 'vcs-ignored-skipped',
      text: `因 .gitignore（git 判定）跳过 ${scan.vcsIgnored.length} 个文件：契约域外、不进文件集也不解析`,
    })
  }
  if (scan.ignored.length > 0) {
    // 文件 + **全部模式**：用户要靠模式去改配置（以前数字是文件、后面列的却是模式，对不上）
    const patterns = config.ignore
    const patternLines: string[] = []
    for (let index = 0; index < patterns.length; index += 3) {
      patternLines.push(patterns.slice(index, index + 3).join(' · '))
    }
    notices.push({
      code: 'ignore-skipped',
      text:
        `ignore（项目边界）命中 ${scan.ignored.length} 个文件（不进文件集也不解析）：` +
        `${scan.ignored.slice(0, 3).join(' · ')}${scan.ignored.length > 3 ? ' …' : ''}\n` +
        `    模式（${patterns.length} 条）：${patternLines.join('\n      ')}`,
    })
  }
}

/**
 * **生效的适配器**必须自述：适配器只写在配置里，报告此前完全不提它 ——
 * 于是"到底跑的是哪套 kit"只能去翻 `arch.config.mjs`（换库换错、组合 `stack()` 时手滑多写一份，
 * 现场都看不出来）。重复声明同一个面已经由 `mergePresets` 直接报错，这里报"谁在生效"。
 * 字段级全貌（形态 / 包对账）在 `--verify-deps` 的全表里。
 */
export function pushAdapterNotice(config: Config, notices: Diagnostic[]): void {
  const adapters = Object.values(config.adapters)
  if (adapters.length === 0) return
  const list = [...adapters]
    .sort((a, b) => a.facet.localeCompare(b.facet))
    .map((adapter) => `${adapter.facet}=${adapter.id}`)
  // 每行 3 个：12 个挤成一行（250+ 字符）在窄终端里读不动
  const lines: string[] = []
  for (let index = 0; index < list.length; index += 3) {
    lines.push(list.slice(index, index + 3).join(' · '))
  }
  notices.push({
    code: 'adapters-in-use',
    text: `生效的适配器（${list.length} 个）：\n${lines.map((line) => `    ${line}`).join('\n')}`,
  })
}

/**
 * **M1 / R-86：声明配了却 0 命中 —— 那条纪律什么都没看**。
 *
 * 与 §4.9 的"委派跑没跑"同类问题，只是发生在**声明**这一侧：声明合法、规则也在跑，
 * 但项目里没有任何文件 / 组 / 调用能命中它 —— 报告显示"通过"，而那条纪律其实是空的。
 * （配置期的"可命中性"由 `structure.ts` 的 validate 管；这里管**运行期**：角色表里有这个维度，
 * 但没有任何文件命中那些角色。）
 *
 * 覆盖两侧：`structure.*`（R-77 = M1）与**方案面的声明**（R-86：`callSites` / `envReads` /
 * `analytics` / `router.pathSource` / `dataLayer.queryKeyFrom` / `designSystem.numberHomes`）——
 * 后者原来没人管：名字多打一个字母，报告还写着"生效的适配器：analytics=declared"。
 */
/**
 * 报告里的 label（`data-layer.fetchApis` / `analytics.apis` / `design-system.paletteFile`）→
 * 能力根（`dataLayer.fetchApis` / `analytics.apis` / `designSystem.paletteFile`）。
 * 只是为了在报告末尾附上"怎么补"的片段 —— 认不出就返回空串（不多说废话）。
 */
const LABEL_TO_ROOT: Record<string, string> = {
  'data-layer': 'dataLayer',
  'design-system': 'designSystem',
  'ui-kit': 'uiKit',
  'env-reads': 'envReads',
  'call-sites': 'callSites',
}

function capabilityOfLabel(label: string): string {
  const dot = label.indexOf('.')
  const facet = dot === -1 ? label : label.slice(0, dot)
  const rest = dot === -1 ? '' : label.slice(dot + 1)
  const root = LABEL_TO_ROOT[facet] ?? facet
  return rest === '' ? root : `${root}.${rest}`
}

/** 数据层 kit 给的策略属性名（R-111）：用它当 `policyProps` 的"既有清单"基准 */
function dataLayerPolicyProps(config: Config): string[] | undefined {
  return (config.adapters['data-layer'] as { policyProps?: string[] } | undefined)?.policyProps
}

export function pushDeclarationNotices(
  config: Config,
  records: { rel: string; captures?: Record<string, string> }[],
  files: string[],
  notices: Diagnostic[],
  facts: Map<string, Facts> = new Map(),
): void {
  const empty: string[] = []
  const hasFile = (glob: string): boolean => {
    const pattern = globToRegExp(glob)
    return files.some((rel) => pattern.test(rel))
  }
  const hasDimension = (dimension: string): boolean =>
    records.some((record) => Boolean(record.captures?.[dimension]))

  for (const glob of config.structure.generated ?? []) {
    if (!hasFile(glob)) empty.push(`generated 的 ${glob}`)
  }
  // 入口（`config.entries`）是可达性规则的根：0 命中 = S15/S37 这类规则"没判定"，必须自述
  const entries: string[] = Array.isArray(config.entries) ? config.entries : []
  for (const entry of entries) {
    if (!hasFile(entry)) empty.push(`entries 的 ${entry}`)
  }
  for (const glob of config.structure.migrating ?? []) {
    if (!hasFile(glob)) empty.push(`migrating 的 ${glob}`)
  }
  for (const spec of config.structure.clientState ?? []) {
    for (const glob of spec.in ?? []) if (!hasFile(glob)) empty.push(`clientState.in 的 ${glob}`)
  }
  if (config.structure.authRedirects) {
    for (const glob of config.structure.authRedirects.in ?? []) {
      if (!hasFile(glob)) empty.push(`authRedirects.in 的 ${glob}`)
    }
  }
  const dimensions = [
    ...(config.structure.isolate ?? []),
    ...(config.structure.publicApi ?? []),
    ...(config.structure.segmentedGroups ?? []),
    ...(config.structure.repetitiveNaming ?? []),
    ...(config.structure.importLocality ?? []),
    ...(config.structure.groupCountLimits ?? []).map((item) => item.dimension),
    ...(config.structure.groupInDegree ?? []).map((item) => item.dimension),
    ...(config.structure.nameCollisions ?? []).map((item) => item.dimension),
    ...(config.structure.pluralConsistency ?? []).map((item) => item.dimension),
    ...(config.structure.couplingLimits ?? []).map((item) => item.dimension),
  ]
  for (const dimension of new Set(dimensions)) {
    if (!hasDimension(dimension)) empty.push(`维度 ${dimension}`)
  }

  empty.push(...emptyFaceDeclarations(config, facts, hasFile))

  // "正确形态参考"是**建议**不是"第 N 条 0 命中"，单独一句（R-106）
  const recipe = empty.find((item) => item.startsWith('正确形态参考'))
  const items = recipe ? empty.filter((item) => item !== recipe) : empty
  if (items.length === 0 && !recipe) return
  // 一条一行：以前 6 条挤成一条 400+ 字符的长行，80 列终端里整份报告被折成两倍长（UX）
  const shown = items.slice(0, 8)
  notices.push({
    code: 'declaration-no-match',
    text:
      `有 ${items.length} 条声明 0 命中（那条纪律这次什么都没看，建议删掉或修对）：\n` +
      shown.map((item) => `    · ${item}`).join('\n') +
      (items.length > shown.length
        ? `\n    …还有 ${items.length - shown.length} 条（\`--format=json\` 拿全）`
        : '') +
      (recipe ? `\n    ${recipe}` : ''),
  })
}

/** **方案面的声明**（R-86）：落点看文件是否存在、清单看在最宽松的匹配下有没有任何命中 */
function emptyFaceDeclarations(
  config: Config,
  facts: Map<string, Facts>,
  hasFile: (glob: string) => boolean,
): string[] {
  const empty: string[] = []
  const callees = [...facts.values()].flatMap((item) => item.calls.map((call) => call.callee))
  const reads = [...facts.values()].flatMap((item) => item.reads.map((read) => read.name))
  /**
   * **最宽松的匹配**（整名 / 对象前缀 / 方法后缀）：它都命中不了，那条声明必定是空的。
   * 刻意不去复用规则里那两套匹配（S38 认前缀、D24 不认）：这里宁少报不误报，而且要跨层复用就得
   * 把匹配语义搬到引擎侧，那是给一个提示功能加的真实耦合。
   */
  // 池里的每个名字当 callee，看它能不能匹配这个 api（`can.has` 命中 `can`）
  const called = (api: string, pool: string[]): boolean =>
    pool.some((name) => matchesApi(name, [api]))
  /**
   * 0 命中时顺便记下"这属于哪个能力根" —— 报告末尾据此附上**正确形态的片段**（R-106）：
   * 用户不必去翻文档全表，报告自己给出可以粘进配置的那一行。
   */
  const receptors = new Set<string>()
  const checkFiles = (label: string, globs: readonly string[]): void => {
    for (const glob of globs) {
      if (hasFile(glob)) continue
      empty.push(`${label} 的 ${glob}`)
      receptors.add(capabilityOfLabel(label))
    }
  }
  const checkCalls = (label: string, apis: readonly string[]): void => {
    for (const api of apis) {
      if (called(api, callees)) continue
      empty.push(`${label} 的调用名 ${api}`)
      receptors.add(capabilityOfLabel(label))
    }
  }
  /**
   * **出处代理**（R-114 / R-92）：一份清单如果**等于**数据表 / kit 给的那一份，就是"既有清单" ——
   * 它天然包含"这次没用到"的项，报了只会逼宿主把清单收窄（把表抄一遍）。用表就照抄整份，必然相等。
   */
  const fromExisting = (list: readonly string[], known: readonly (readonly string[])[]): boolean =>
    known.some(
      (entry) =>
        entry.length > 0 && entry.length === list.length && entry.every((n) => list.includes(n)),
    )
  const checkApis = (
    label: string,
    apis: readonly string[],
    known: readonly (readonly string[])[] = [],
  ): void => {
    if (fromExisting(apis, known)) return
    checkCalls(label, apis)
  }
  /** 实参名清单（`callSites[].args`）：比项目里出现过的字符串字面量 */
  const literals = new Set(
    [...facts.values()].flatMap((item) => (item.strings ?? []).map((entry) => entry.value)),
  )
  const checkArgs = (label: string, args: readonly string[]): void => {
    for (const arg of args) {
      if (literals.has(arg)) continue
      empty.push(`${label} 的实参名 ${arg}`)
      receptors.add(capabilityOfLabel(label))
    }
  }
  /** 属性名清单（`errorPolicy.policyProps`）：比项目里出现过的属性名 */
  const propertyNames = new Set(
    [...facts.values()].flatMap((item) => [
      ...(item.functions ?? []).map((entry) => entry.ownedProp),
      ...(item.strings ?? []).map((entry) => entry.prop),
    ]),
  )
  const checkProps = (
    label: string,
    props: readonly string[],
    known: readonly (readonly string[])[] = [],
  ): void => {
    if (fromExisting(props, known)) return
    for (const prop of props) {
      if (prop !== null && propertyNames.has(prop)) continue
      empty.push(`${label} 的属性名 ${prop}`)
      receptors.add(capabilityOfLabel(label))
    }
  }

  for (const adapter of Object.values(config.adapters ?? {})) {
    const face = adapter as Record<string, unknown>
    const label = String(adapter.facet)
    for (const key of ['pathSource', 'queryKeyFrom', 'eventSource']) {
      const value = face[key]
      // `queryKeyFrom` 收字符串或数组（多落点 / glob）：逐项查"这个落点真的命中文件了吗"
      const values =
        typeof value === 'string' ? [value] : Array.isArray(value) ? (value as string[]) : []
      if (values.length > 0) checkFiles(`${label}.${key}`, values)
    }
    for (const key of ['fetchIn', 'in'] as const) {
      const value = face[key]
      if (Array.isArray(value)) checkFiles(`${label}.${key}`, value as string[])
    }
    /**
     * **只盯项目自己写的名字**（R-92）：`apis` 是宿主的（`analytics({ apis })` / `callSites([{ apis }])`），
     * 写错一个字母就会 0 命中 ✓ 要报。而 `fetchApis`（react-query kit 的默认清单，8 个钩子）与
     * `env-reads.apis`（平台表给的读取根）是**面/平台/kit 的既有清单** —— 它们天然包含"这次没用到"的项，
     * 报出来只会逼宿主把清单收窄（把 kit 的事实抄一遍），而收窄本身没有任何收益。
     */
    if (label === 'call-sites') {
      for (const group of (face.groups ?? []) as CallSiteGroupLike[]) {
        const groupLabel = `${label}[${group.name ?? '?'}]`
        checkCalls(`${groupLabel}.apis`, group.apis ?? [])
        checkArgs(`${groupLabel}.args`, group.args ?? [])
        checkFiles(`${groupLabel}.in`, group.in ?? [])
        // `from` 指向的清单解析不出来（面没声明 / 字段为空）→ 那一组什么都没判，必须自述
        if (group.from && resolveCallSiteApis(config, group).length === 0) {
          empty.push(`${groupLabel}.from 的来源 ${group.from}`)
        }
      }
      continue
    }
    if (label === 'analytics' && Array.isArray(face.apis)) {
      checkCalls(`${label}.apis`, face.apis as string[])
    }
    // R-114：这几个面的 `apis` 是**宿主自己写的调用名**，拼错一个字母 = 规则静默不判 —— 要报。
    // 用 `from` 指向来源表 / kit 的既有清单时不报（R-92）：那类清单天然包含"这次没用到"的项。
    if (
      (label === 'endpoints' || label === 'permissions') &&
      face.from === undefined &&
      Array.isArray(face.apis)
    ) {
      checkApis(`${label}.apis`, face.apis as string[], Object.values(CALL_SITE_SOURCES))
    }
    /**
     * **`from` 解析出来是空的**（R-138）：指向来源表 / kit 的清单一般不报（R-92：那类清单天然含
     * "这次没用到"的项）—— 但**整份解析为空**是另一回事：它意味着那条纪律这轮什么都没看
     * （典型情形：`endpoints({ from: 'http.apis' })` 却忘了 `http(axiosKit())`）。
     * 不报的话报告显示 ✔、而端点字面量一个都没判 —— 与 R-114 同一类静默假绿。
     */
    if ((label === 'endpoints' || label === 'permissions') && typeof face.from === 'string') {
      if (resolveCallSiteApis(config, { from: face.from }).length === 0) {
        empty.push(`${label}.from 的 ${face.from} 解析出来是空的（少装了对应的适配器？）`)
      }
    }
    if (label === 'error-policy' && Array.isArray(face.policyProps)) {
      checkProps(
        `${label}.policyProps`,
        face.policyProps as string[],
        [dataLayerPolicyProps(config)].filter((item): item is string[] => Array.isArray(item)),
      )
    }
    if (label === 'env-reads') {
      // 读取根默认来自平台表（R-93）：只在宿主**显式给了** apis 时才校验它写得对不对（`in` 上面已查过）
      if (!face.apisFrom && Array.isArray(face.apis)) {
        for (const api of face.apis as string[]) {
          if (!called(api, reads)) empty.push(`${label}.apis 的读取根 ${api}`)
        }
      }
    }
    if (Array.isArray(face.groups)) {
      for (const group of face.groups as { name?: string; apis?: string[]; in?: string[] }[]) {
        const groupLabel = `${label}[${group.name ?? '?'}]`
        checkCalls(`${groupLabel}.apis`, group.apis ?? [])
        checkFiles(`${groupLabel}.in`, group.in ?? [])
      }
    }
  }

  /**
   * **`designSystem` 的落点参数**（R-96）：`styleDir` / `tokenDir` / `vendorDir`（目录）与
   * `paletteFile` / `themeFile` / `storageFile`（文件）—— 写错路径时那几条规则**安静地返回空**
   * （文件不存在 → 没有东西可判），与 R-86 的"声明配了却 0 命中"是同一种病。
   * 目录按"这个目录下有没有文件"判（不能拿目录名本身当 glob —— 那样永远不命中）。
   */
  const params = config.params ?? {}
  for (const key of ['styleDir', 'tokenDir', 'vendorDir'] as const) {
    const dir = params[key]
    if (typeof dir === 'string' && dir !== '' && !hasFile(`${dir}/**`)) {
      empty.push(`designSystem.${key} 的 ${dir}`)
      receptors.add(`designSystem.${key}`)
    }
  }
  for (const key of ['paletteFile', 'themeFile', 'storageFile'] as const) {
    const file = params[key]
    if (typeof file === 'string' && file !== '' && !hasFile(file)) {
      empty.push(`designSystem.${key} 的 ${file}`)
      receptors.add(`designSystem.${key}`)
    }
  }

  // 域预设里的声明（`designSystem.numberHomes`）：名字与家两侧都可能在配置期写错
  const homes = config.params?.numberHomes as
    { name: string; names?: string[]; in?: string[] }[] | undefined
  const numberNames = [...facts.values()].flatMap((item) =>
    (item.numbers ?? []).map((number) => number.name ?? ''),
  )
  for (const home of homes ?? []) {
    checkFiles(`numberHomes[${home.name}].in`, home.in ?? [])
    if ((home.in ?? []).some((glob) => !hasFile(glob))) receptors.add('designSystem.numberHomes')
    for (const name of home.names ?? []) {
      if (!numberNames.includes(name)) empty.push(`numberHomes[${home.name}] 的名字 ${name}`)
    }
  }

  /**
   * **附上正确形态**（R-106）：只说"配了却 0 命中"还不够，用户要的是"那该怎么写"。
   */
  if (empty.length > 0) {
    const recipes = new Set<string>()
    for (const root of receptors) {
      const recipe = recipeFor([root])
      if (recipe) recipes.add(recipe)
    }
    if (recipes.size > 0) {
      empty.push(
        `正确形态参考（可粘进配置）：\n${[...recipes].map((item) => `    ${item}`).join('\n')}`,
      )
    }
  }
  return empty
}

/**
 * **C01 的「文案位名单」取自哪里**（R-89）。
 *
 * 为什么需要：名单可以来自项目（`copy({ messageApis })`）或组件库适配器（`uiKit(antdKit())` 自带 antd 那份）。
 * 后者让宿主少抄一张表，但也带来一个后果：**换个没有这份数据的 kit（或干脆没装 uiKit），那一半会安静地关掉** ——
 * 报告显示"✔ 通过"，却不提它没在判。`requires` 是**整条规则**粒度，盖不住"一条规则两半"这种情况，
 * 所以把来源**自述**出来：三种取值（项目声明 / 适配器默认 / 无）互相不可混淆。
 */
export function pushCopyListNotice(
  config: Config,
  registry: { enabled: { id: string }[] },
  notices: Diagnostic[],
): void {
  // C01 没在跑就没有"名单来源"可谈（它为什么停用，报告已经明列在「因能力未声明而停用」里）
  if (!registry.enabled.some((rule) => rule.id === 'C01')) return
  const project = config.params.messageApis as string[] | undefined
  const adapter = Object.values(config.adapters ?? {}).find((item) => item.facet === 'ui-kit') as
    { id?: string; messageApis?: string[] } | undefined
  const kitCount = adapter?.messageApis?.length ?? 0
  const kitName = adapter?.id ? `uiKit(${adapter.id})` : '组件库适配器'

  let source: string
  if (project !== undefined && project.length === 0) {
    source = '`copy({ messageApis: [] })` —— 显式关掉「组件库调用里的文案」这一半'
  } else if (project !== undefined) {
    source =
      `\`copy({ messageApis })\` 项目声明 ${project.length} 条` +
      (kitCount > 0 ? `（覆盖 ${kitName} 默认 ${kitCount} 条）` : '')
  } else if (kitCount > 0) {
    source = `${kitName} 默认 ${kitCount} 条`
  } else {
    source =
      '无 ——「组件库调用里的文案」这一半没在判（写 copy({ messageApis })，或在组件库适配器里声明 messageApis）'
  }
  notices.push({ code: 'copy-list-source', text: `C01 的文案位名单：${source}` })
}

/**
 * **显式停用的规则**（R-125）：`disable` 是**整条关掉、不会自己恢复** —— 门禁自己的账。
 *
 * 与「因能力未声明而停用」分开说：后者带"想要就跑"的配方（补一行就好），
 * 而这条没有任何配方可跑，只能删掉条目。所以要自述，否则门禁在**静默缩水**。
 */
export function pushDisabledRulesNotice(config: Config, notices: Diagnostic[]): void {
  const ids = config.disable
  if (ids.length === 0) return
  notices.push({
    code: 'rules-disabled',
    text:
      `显式停用 ${ids.length} 条规则：${ids.slice(0, 8).join(' / ')}${ids.length > 8 ? ' …' : ''}` +
      ' —— 这些纪律这一轮没跑。删掉 `disable` 里的条目即可恢复；' +
      '若只是"某条规则对某类文件不适用"，用 `exceptions`（带理由与到期）而不是整条关掉',
  })
}
