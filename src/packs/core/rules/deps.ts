import type { WheelFingerprint } from '../../../data/wheel-fingerprints.js'
import { maskTs } from './mask.js'
import { packageNameOf } from '../../../engine/graph.js'

import { effectiveFingerprints } from './deps-fingerprints.js'
import { fileUsesPreferred, lineAt, lineMatchesAny, lineStartsOf } from './fingerprint-scan.js'
import type { Finding, Rule, RuleContext } from '../../../engine/types.js'
import { finding } from './finding.js'

/**
 * 依赖域（P）：管两件事
 *   1. 依赖清单纪律 —— 装了什么（P01 白名单 / P02 禁用 / P03 幽灵依赖）
 *   2. 能力纪律 —— 代码里干了什么活、有没有用登记的方案（P06 / P08）
 *
 * 判定等级：清单类 L1（读 package.json），能力类 L2（单文件形态 + 全项目 import 集合）。
 */

/**
 * 适配表声明的包也算「已批准」：适配器是「项目用什么库」的唯一声明（P04 用同一份数据），
 * 不必在 allow 里重抄一遍。注意它只**并入名单**，不负责打开 P01 —— 开关仍然只有 allow。
 */
function adapterPackages(ctx: RuleContext): string[] {
  const out = new Set<string>()
  for (const adapter of Object.values(ctx.config.adapters)) {
    // `packages` ∪ `from`：i18n 适配器把库名放在 `from` 里（同 deps-adapters 的 helper）
    const spec = adapter as { packages?: string[]; from?: string[] }
    for (const name of [...(spec.packages ?? []), ...(spec.from ?? [])]) out.add(name)
  }
  return [...out]
}

/**
 * P01 新增依赖必须登记：**没登记 = 没批准**。
 *
 * 开关是 `allow`（显式声明才进入 fail-closed）。`capabilities` **不再**隐式开启本规则 ——
 * 否则「只想声明一个能力（datetime → dayjs）」会等价于「批准清单里只有 dayjs」，
 * 项目其余依赖全部报红，而用户并没有要过白名单。能力表只驱动 P06（手搓指纹）。
 * 反重复由 `policyConflicts` 保证：只要 allow 非空，能力首选必须同时登记在 allow 里；
 * 适配表声明的包则由 `adapterPackages()` 自动并入名单。
 */
export const depsAllowlist: Rule = {
  id: 'P01',
  domain: 'deps',
  level: 'L1',
  severity: 'error',
  title: '运行时依赖必须登记',
  hint: '把包加进 arch.config.mjs 的 deps({ allow })，或登记为能力的首选方案 / 适配表里的组件库；devDependencies 不受此限',
  run: (ctx) => {
    if (!ctx.deps.hasManifest) return []
    const { allow, deny } = ctx.policy
    if (allow.length === 0) return [] // 没声明白名单就不进入 fail-closed 模式
    const approved = new Set([...allow, ...adapterPackages(ctx)])
    return (
      ctx.deps.runtime
        // deny 里的库由 P02 报，不在这里重复
        .filter((name) => !approved.has(name) && !deny.includes(name))
        .map((name) =>
          finding('P01', 'package.json', 1, `未登记的运行时依赖：${name}`, undefined, true),
        )
    )
  },
}

/**
 * P02 明确禁用库。
 * 注意：启用 allow 白名单（P01）后，这个规则基本是多余的 —— 未登记的依赖已经被拦下。
 * 保留它只为两种情况：① 项目不想维护白名单，只想表达少数硬禁令；② 想给某个库更明确的报错。
 */
export const depsDenied: Rule = {
  id: 'P02',
  domain: 'deps',
  level: 'L1',
  severity: 'error',
  title: '明确禁用的库',
  hint: '从 package.json 移除；若确需引入，先在配置里把它从 deny 移出并说明理由',
  run: (ctx) => {
    if (!ctx.deps.hasManifest) return []
    const { deny } = ctx.policy
    if (deny.length === 0) return []
    return ctx.deps.runtime
      .filter((name) => deny.includes(name))
      .map((name) => finding('P02', 'package.json', 1, `禁用的依赖：${name}`, undefined, true))
  },
}

/**
 * P03 幽灵依赖：**import 了但没在任何 dependencies 段声明**（靠别人的依赖碰巧能跑）。
 *
 * 为什么收回本体（原委派给 knip / depcheck）：事实早就读进来了（`ctx.deps.phantom` 一直在给
 * `--verify-deps` 用），而生态侧要**装 eslint-plugin-import 并显式开 `no-extraneous-dependencies`**
 * 才有覆盖 —— 那是个"要装插件 + 写 resolver 配置"的门槛，宿主没配就等于零覆盖。
 *
 * 锚在**引用它的那个文件**上（`package.json` 只说明"没登记"，说不出哪行在用它）。
 */
export const depsPhantom: Rule = {
  id: 'P03',
  domain: 'deps',
  level: 'L2',
  severity: 'error',
  title: '幽灵依赖',
  hint: '这个包没写进 package.json（靠别人的依赖碰巧装着）：换机器 / CI 就崩；要么声明它，要么别用',
  run: (ctx) => {
    if (!ctx.deps.hasManifest || ctx.deps.phantom.length === 0) return []
    const phantom = new Set(ctx.deps.phantom)
    const out: Finding[] = []
    for (const record of ctx.records) {
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      for (const imported of facts.imports) {
        const name = packageNameOf(imported.spec)
        if (!phantom.has(name)) continue
        out.push(
          finding(
            'P03',
            record.rel,
            imported,
            `幽灵依赖：${name} 没声明在 package.json 里（这里 import 了它）`,
          ),
        )
      }
    }
    return out
  },
}

/**
 * P08 声明但未使用：**写进 `dependencies` 却全项目零引用**。
 *
 * 为什么收回本体：tsc 与 eslint 都**不知道 package.json** —— `noUnusedLocals` 看的是文件内局部变量、
 * `no-unused-vars` 看的是文件内声明与导入，`no-extraneous-dependencies` 是反方向（用了没声明）。
 * 真正的工具只有 knip / depcheck（要单独装 + 写 entry 配置），而我们的事实 `ctx.deps.unused` 现成。
 *
 * 只报 `dependencies`（dev 与 peer 可能只给工具链 / 宿主用，报它们是噪音）。
 * 默认 **warn**：未用依赖多数是遗留，清不清是维护决策。
 */
export const depsUnused: Rule = {
  id: 'P08',
  domain: 'deps',
  level: 'L1',
  severity: 'warn',
  title: '声明但未使用',
  hint: '没人 import 它了：从 package.json 删掉（还在用就说明 import 写在别处，别急着删）',
  run: (ctx) => {
    if (!ctx.deps.hasManifest) return []
    // **声明才判**：`deps({ unusedDeps: true })`。
    // 为什么默认关：只按"有没有 import"判会把"靠 JSX 自动运行时"的 react、
    // 副作用型依赖（polyfill / normalize.css）、只在构建配置里用的包全部误报 ——
    // 真正判准需要 entry / 插件知识（knip 就是靠这些），我们宁可默认不判。
    if (ctx.config.params.unusedDeps !== true) return []
    // 适配表声明的包交给 P11：它同时看 import、vendor 选择器与 CSS 变量 ——
    // 只按 "有没有 import" 判会把"只在全局样式里用"的组件库误报成未使用
    const adapterOwned = new Set(adapterPackages(ctx))
    return ctx.deps.unused
      .filter((name) => !adapterOwned.has(name))
      .map((name) =>
        finding(
          'P08',
          'package.json',
          1,
          `声明了但全项目零引用的运行时依赖：${name}`,
          undefined,
          true,
        ),
      )
  },
}

interface ActiveFingerprint {
  capability: string
  preferred: string
  entry: WheelFingerprint
  regexes: RegExp[]
  /** 已在用首选方案的证据（命中行 / 下一行）；空数组 = 不做同行豁免 */
  exempt: RegExp[]
}

/** 生效表里**这次真的要扫**的条目：声明了能力 + 该条目有强指纹 */
function activeFingerprints(
  fingerprints: readonly WheelFingerprint[],
  capabilities: Record<string, string>,
): ActiveFingerprint[] {
  const out: ActiveFingerprint[] = []
  for (const [capability, preferred] of Object.entries(capabilities)) {
    const entry = fingerprints.find((item) => item.capability === capability)
    if (!entry?.syntax || entry.syntax.length === 0) continue
    out.push({
      capability,
      preferred,
      entry,
      // `gm`：整份匹配，但 `^` / `$` 仍是行锚点 —— 宿主自定义 pattern 的逐行语义不变
      regexes: entry.syntax.map((pattern) => new RegExp(pattern, 'gm')),
      exempt: (entry.exemptSyntax ?? []).map((pattern) => new RegExp(pattern)),
    })
  }
  return out
}

interface FileHits {
  line: number
  count: number
}

/**
 * P06 能力必须用登记方案：命中「手工轮子」强指纹时，必须已经在用该能力的首选方案。
 *
 * 两种能力的豁免方式不同（这里曾经写反，导致 5 个平台能力静默失效）：
 * - **需要依赖的能力**（dayjs / commander / zod…）：看**这个文件**有没有 import 首选方案 ——
 *   按文件判而非按项目判，否则"部分迁移"（A 文件用了、B 文件还在手搓）会被整体放过；
 * - **平台内置能力**（structuredClone / Intl / crypto.randomUUID / URLSearchParams…）：**没有依赖可查**，
 *   但数据表的 `exemptSyntax` 命中行 / 下一行时是直接证据 —— 那是推荐写法（`'?' + new URLSearchParams(…)`），
 *   不再误报（R-165）。除此之外命中即报：同文件另一处用了 structuredClone 管不了这一处的 JSON 深拷贝。
 *
 * 指纹按**整份遮罩后的文件**匹配（`gm`）：跨行调用是格式化工具的默认输出，逐行扫描会整片漏判。
 *
 * `allowOwn: true` 的能力（query-string / validation / debounce-throttle）**降级为 warn**：
 * 有些小工具自研是合理的，但"提示"要真的出现在报告里，而不是只往 hint 追加一句话。
 */
export const capabilityPreferred: Rule = {
  id: 'P06',
  domain: 'deps',
  level: 'L2',
  severity: 'error',
  // 能力纪律是**产品代码**的：测试夹具要真起子进程 / 真解析 argv 才能验行为本身
  appliesTo: 'product',
  title: '能力必须用登记方案',
  hint: '用能力表里登记的首选方案，别手搓',
  run: (ctx) => {
    const active = activeFingerprints(effectiveFingerprints(ctx.policy), ctx.policy.capabilities)
    if (active.length === 0) return []
    const out: Finding[] = []
    // capability → file → { 首个命中行, 命中数 }
    const hits = new Map<string, Map<string, FileHits>>()
    for (const record of ctx.records) {
      // 只扫脚本文件：指纹全是 JS/TS 形态；CSS/SCSS 没有 facts（兜底遮罩也认不出 `//` 注释），
      // 扫它只会把样式注释里的示例当成代码（R-167）。
      if (record.kind !== 'ts') continue
      const raw = ctx.sourceOf(record.rel)
      if (!raw) continue
      const masked = maskTs(raw, ctx.facts.get(record.rel))
      const starts = lineStartsOf(masked)
      for (const activeEntry of active) {
        for (const regex of activeEntry.regexes) {
          regex.lastIndex = 0
          let match: RegExpExecArray | null
          while ((match = regex.exec(masked)) !== null) {
            // 空匹配保护：`/x*/g` 会在同一位置反复命中
            if (match[0] === '') {
              regex.lastIndex += 1
              continue
            }
            const line = lineAt(starts, match.index)
            // 命中行 / 下一行已经在用首选方案（数据表的 exemptSyntax，如 URLSearchParams）→ 推荐写法，不报
            if (lineMatchesAny(masked, starts, line, activeEntry.exempt)) continue
            let byFile = hits.get(activeEntry.capability)
            if (!byFile) {
              byFile = new Map()
              hits.set(activeEntry.capability, byFile)
            }
            const current = byFile.get(record.rel)
            if (current) {
              current.count += 1
              // 报告取**全文最早**命中：pattern 的枚举顺序不该决定行号（R-166）
              current.line = Math.min(current.line, line)
            } else {
              byFile.set(record.rel, { line, count: 1 })
            }
          }
        }
      }
    }

    for (const activeEntry of active) {
      const byFile = hits.get(activeEntry.capability)
      if (!byFile) continue
      for (const [file, hit] of byFile) {
        // 按**文件**判定：这个文件自己有没有在用登记方案。
        // 用全项目判定会放过「部分迁移」（A 文件用了 dayjs、B 文件还在手搓）。
        if (
          fileUsesPreferred(ctx.facts.get(file), activeEntry.preferred, activeEntry.entry.platform)
        ) {
          continue
        }
        const others = hit.count - 1
        const findingEntry = finding(
          'P06',
          file,
          hit.line,
          `手搓了 ${activeEntry.capability} 的活，但没在用登记的 ${activeEntry.preferred}${others > 0 ? `（该文件另有 ${others} 处）` : ''}`,
          activeEntry.entry.hint,
        )
        if (activeEntry.entry.allowOwn === true) {
          // 数据表说"只提示不报错" → 真的降级（此前只改 hint，finding 仍是 error）
          findingEntry.severity = 'warn'
          findingEntry.hint = `${activeEntry.entry.hint}（该能力允许自研，仅提示）`
        }
        out.push(findingEntry)
      }
    }
    return out
  },
}

export const depsRules: Rule[] = [
  depsAllowlist,
  depsDenied,
  // 幽灵依赖（P03）与「声明但未使用」（P08）原委派给 knip / depcheck，0.4.0 收回本体：
  // 事实早就算好了（`ctx.deps.phantom` / `unused` 一直在给 --verify-deps 用），
  // 而生态侧要装专门工具 / 插件并写配置才有覆盖 —— 配置成本高到多数宿主不会做。
  depsPhantom,
  depsUnused,
  capabilityPreferred,
]
