import { colorKey, findColorLiterals } from '../../../engine/css.js'
import type { Finding, Rule } from '../../../engine/types.js'

import {
  cssFiles,
  designParams,
  externalConsumerTokens,
  finding,
  isExternalToken,
  isTokenFile,
  tryRead,
} from './design-shared.js'

/* ---------------- D03 色值唯一 ---------------- */

export const paletteColorUnique: Rule = {
  id: 'D03',
  domain: 'design',
  requires: ['designSystem.paletteFile'],
  level: 'L2',
  severity: 'error',
  title: '色板色值唯一',
  hint: '同一色值只写一次；跨族共用请写成 var() 别名',
  run: (ctx) => {
    const params = designParams(ctx)
    const file = cssFiles(ctx).find((item) => item.rel === params.paletteFile)
    if (!file) return []
    const seen = new Map<string, { line: number; name: string }>()
    const out: Finding[] = []
    for (const item of file.vars) {
      /**
       * 色值身份 = **解析成 sRGB 之后的颜色**（R-153），不是 hex 的拼写：
       * `--a: rgb(255, 90, 31)` 与 `--b: #ff5a1f` 是同一个色值（旧实现只认 hex 字面量，
       * 前者取不到键 → 跨族重复静默漏报）。`var()` 别名是官方推荐的共用方式，解析不了就跳过。
       */
      const key = colorKey(item.value)
      if (!key) continue
      const prev = seen.get(key)
      if (prev) {
        out.push(
          finding('D03', file.rel, item, `色值 #${key} 与 ${prev.name}（第 ${prev.line} 行）重复`),
        )
        continue
      }
      seen.set(key, { line: item.line, name: item.name })
    }
    return out
  },
}

/* ---------------- D04 引用闭合（无悬空 var） ---------------- */

export const tokenRefsClosed: Rule = {
  id: 'D04',
  domain: 'design',
  level: 'L3',
  severity: 'error',
  title: '令牌引用闭合',
  hint: '悬空引用说明令牌被改名或删了；改名要一次改完消费方',
  run: (ctx) => {
    const params = designParams(ctx)
    const files = cssFiles(ctx)
    const defined = new Set<string>()
    for (const file of files) for (const item of file.vars) defined.add(item.name)
    const out: Finding[] = []
    for (const file of files) {
      for (const ref of file.varRefs) {
        // 外部运行时提供的命名空间：引用闭合由提供方保证，不归本仓的令牌表判
        if (isExternalToken(ref.name, params.externalTokens)) continue
        if (defined.has(ref.name) || ref.hasFallback) continue
        out.push(finding('D04', file.rel, ref, `未定义的令牌引用：${ref.name}`))
      }
    }
    return out
  },
}

/* ---------------- D05 无死令牌 ---------------- */

export const noDeadTokens: Rule = {
  id: 'D05',
  domain: 'design',
  level: 'L3',
  severity: 'error',
  title: '无死令牌',
  hint: '没被任何地方引用的令牌就是死代码，删掉或接上消费方',
  run: (ctx) => {
    const params = designParams(ctx)
    const files = cssFiles(ctx)
    const mention = /--[a-zA-Z0-9-]+(?![a-zA-Z0-9-])/g
    const defLine = /^\s*(--[a-zA-Z0-9-]+)\s*:/

    // 只在令牌目录里统计定义（vendor 的组件库令牌由组件库运行时消费，判死会误伤）
    const defined = new Map<string, { line: number; file: string }>()
    const edges = new Map<string, Set<string>>()

    /** 令牌定义行 → 该行提到的其他令牌；其他行 → 根 */
    const scan = (file: string, text: string, isDefFile: boolean, roots: Set<string>): void => {
      for (const [index, raw] of text.split('\n').entries()) {
        const line = raw.replace(/\/\*[\s\S]*?\*\//g, ' ')
        const names = line.match(mention) ?? []
        const def = isDefFile ? line.match(defLine) : null
        if (def?.[1]) {
          // 归外部命名空间的令牌不进本仓的退化账（本地定义可能只是兜底值，引用方在世界外）
          if (isExternalToken(def[1], params.externalTokens)) continue
          const refs = edges.get(def[1]) ?? new Set<string>()
          for (const name of names) if (name !== def[1]) refs.add(name)
          edges.set(def[1], refs)
          if (!defined.has(def[1])) defined.set(def[1], { line: index + 1, file })
          continue
        }
        // 非定义行：这里出现的令牌都算「被引用」——含 TS 里的令牌清单字符串
        for (const name of names) roots.add(name)
      }
    }

    const roots = new Set<string>()
    for (const file of files) scan(file.rel, file.text, isTokenFile(file.rel, params), roots)
    for (const record of ctx.records) {
      if (record.kind !== 'ts') continue
      scan(record.rel, ctx.sourceOf(record.rel) ?? '', false, roots)
    }
    const html = tryRead(ctx, 'index.html')
    if (html) scan('index.html', html, false, roots)
    // 对比度基线引用的令牌也算活着（项目专有数据，宿主声明）
    for (const pair of params.contrastPairs) {
      roots.add(pair.fg)
      roots.add(pair.bg)
      if (pair.parent) roots.add(pair.parent)
    }

    // 外部消费者（本包外 / 契约域外的文件）：只把出现的令牌名当"被引用"，不做跨包图。
    // 0 命中 = 声明没生效：与没声明时一致（该报的假死令牌照报），不静默放过。
    for (const name of externalConsumerTokens(ctx, params.externalConsumers)) roots.add(name)

    const live = new Set<string>()
    const queue = [...roots]
    while (queue.length > 0) {
      const name = queue.pop() as string
      if (live.has(name)) continue
      live.add(name)
      for (const next of edges.get(name) ?? []) if (!live.has(next)) queue.push(next)
    }

    const out: Finding[] = []
    for (const [name, info] of defined) {
      if (live.has(name)) continue
      out.push(finding('D05', info.file, info, `未被引用的令牌：${name}`))
      if (out.length >= 40) break
    }
    return out
  },
}

/* ---------------- D06 明暗双份 ---------------- */

export const themeTwinBlocks: Rule = {
  id: 'D06',
  domain: 'design',
  requires: ['designSystem.themeFile'],
  level: 'L2',
  severity: 'error',
  title: '明暗令牌双份齐全',
  hint: '两套主题的令牌名必须一致；只在一侧加的令牌会在另一侧掉色',
  run: (ctx) => {
    const params = designParams(ctx)
    const file = cssFiles(ctx).find((item) => item.rel === params.themeFile)
    if (!file) return []
    const blocks = params.themes.map((theme) => {
      const rule = file.rules.find(
        (item) =>
          item.selector.includes(`data-theme="${theme}"`) ||
          item.selector.includes(`data-theme='${theme}'`),
      )
      return {
        theme,
        line: rule?.line ?? 1,
        names: new Set((rule?.vars ?? []).map((item) => item.name)),
      }
    })
    if (blocks.some((block) => block.names.size === 0)) return []
    const reference = blocks[0] as { theme: string; line: number; names: Set<string> }
    const out: Finding[] = []
    for (const block of blocks.slice(1)) {
      for (const name of reference.names) {
        if (!block.names.has(name)) {
          out.push(
            finding(
              'D06',
              file.rel,
              block,
              `${block.theme} 缺少令牌：${name}（${reference.theme} 有）`,
            ),
          )
        }
      }
      for (const name of block.names) {
        if (!reference.names.has(name)) {
          out.push(
            finding(
              'D06',
              file.rel,
              reference,
              `${reference.theme} 缺少令牌：${name}（${block.theme} 有）`,
            ),
          )
        }
      }
    }
    return out
  },
}

/* ---------------- D21 声明了设计系统却零匹配 ---------------- */

/**
 * 加了 `designSystem()`，但它指向的位置一个 CSS 都没匹配上 → 整片设计系统规则等于没跑。
 *
 * 为什么需要它：D03 找不到 palette 文件时是**静默 `return []`**，而 `designParams()` 又带内置默认路径，
 * 所以「没声明设计系统」和「声明的路径写歪了」从参数上分不出来。用 `designSystemDeclared`
 * 这个显式标记把两者分开：只有真的声明过才检查，不做设计系统的项目一条噪音都不会多。
 */
export const declaredDesignSystem: Rule = {
  id: 'D21',
  domain: 'design',
  requires: ['designSystem.paletteFile', 'designSystem.tokenDir'],
  level: 'L1',
  severity: 'warn',
  title: '声明了设计系统就必须真有令牌文件',
  hint: '确认 designSystem() 里的 styleDir / tokenDir / paletteFile 写对了；确实没有设计系统就把这个预设去掉',
  run: (ctx) => {
    if (ctx.config.params.designSystemDeclared !== true) return []
    const params = designParams(ctx)
    const files = cssFiles(ctx)
    const missing: string[] = []
    if (!files.some((file) => file.rel === params.paletteFile)) {
      missing.push(`色板 ${params.paletteFile}`)
    }
    if (!files.some((file) => file.rel.startsWith(`${params.tokenDir}/`))) {
      missing.push(`令牌目录 ${params.tokenDir}/`)
    }
    if (missing.length === 0) return []
    return [
      finding(
        'D21',
        params.paletteFile,
        1,
        `声明了设计系统，但这些位置零匹配：${missing.join('、')} —— D 域这部分规则等于没跑`,
      ),
    ]
  },
}

/* ---------------- 注册 ---------------- */

/* ---------------- D02 色板只放静态令牌 ---------------- */

/**
 * 判据：色板文件里定义的自定义属性，**名字必须带声明的静态前缀**。
 *
 * 为什么需要：语义令牌（会被明暗两套覆盖的那种）必须定义在主题文件里 —— 混进色板就会出现
 * 「它永远不随主题变」的假语义名（明暗切换时那处不变，排查半天）。
 */
export const paletteStaticOnly: Rule = {
  id: 'D02',
  domain: 'design',
  requires: ['designSystem.paletteFile', 'designSystem.staticPrefix'],
  level: 'L2',
  severity: 'error',
  title: '色板只放静态令牌',
  hint: '色板只定义静态值（带静态前缀）；语义令牌放主题文件 —— 否则那个语义名不会随主题变',
  run: (ctx) => {
    const params = designParams(ctx)
    const prefix = ctx.config.params.staticPrefix
    if (typeof prefix !== 'string' || prefix === '') return []
    const file = cssFiles(ctx).find((item) => item.rel === params.paletteFile)
    if (!file) return []
    const out: Finding[] = []
    for (const item of file.vars) {
      if (item.name.startsWith(prefix)) continue
      out.push(
        finding(
          'D02',
          file.rel,
          item,
          `色板里定义了非静态令牌 ${item.name}：语义令牌该放主题文件（否则它不会随主题变）`,
          `只有 ${prefix}* 属于色板；语义层放 themeFile`,
        ),
      )
    }
    return out
  },
}

/* ---------------- D01 颜色字面量只在色板 ---------------- */

/**
 * 判据：样式里出现颜色字面量（hex / rgb / hsl），而文件既不是**色板**也不在**令牌目录**里。
 *
 * 为什么收回本体（原委派给 stylelint `color-no-hex` + `overrides`）：那段 overrides 要项目逐条写
 * "哪些文件允许写字面量"，而我们**已经知道**色板与令牌目录在哪（`designSystem()` 的 params）——
 * 直接判更准，也不用宿主维护第二份白名单。
 *
 * 只判**样式文件**：JSX 内联 `style` 里的颜色归 D15；**TS 里的主题常量颜色不判** ——
 * CSS-in-JS 项目里那个 TS 对象可能**就是**颜色的家，按文件类型判必然误伤（见 REQUIREMENTS N-12）。
 */
export const colorLiteralsOnlyInPalette: Rule = {
  id: 'D01',
  domain: 'design',
  requires: ['designSystem.paletteFile', 'designSystem.tokenDir'],
  level: 'L2',
  severity: 'error',
  title: '颜色字面量只在色板',
  hint: '色值只写进色板，其余地方引用令牌（var(--…)）—— 同一套设计出现三种近似色的根源就是随手写 hex',
  run: (ctx) => {
    const params = designParams(ctx)
    const out: Finding[] = []
    for (const file of cssFiles(ctx)) {
      if (file.rel === params.paletteFile) continue
      if (file.rel.startsWith(`${params.tokenDir}/`)) continue
      for (const literal of findColorLiterals(file.text)) {
        out.push(
          finding(
            'D01',
            file.rel,
            literal,
            `颜色字面量 ${literal.text}：色值只许写进色板（${params.paletteFile}）`,
            '在色板里登记后引用令牌变量',
          ),
        )
      }
    }
    return out
  },
}

export const designTokenRules: Rule[] = [
  paletteStaticOnly,
  // 颜色字面量只在色板（D01，0.4.0 收回本体；原先委派 stylelint color-no-hex + overrides）
  colorLiteralsOnlyInPalette,
  paletteColorUnique,
  tokenRefsClosed,
  noDeadTokens,
  themeTwinBlocks,
  declaredDesignSystem,
]
