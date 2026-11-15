import { assertAdviceAllowConsumed } from './declaration-consumers.js'
import { TEST_LAYER_MIN } from './defaults.js'
import { resolveSpecifier, type Graph } from './graph.js'
import { globToRegExp } from './util.js'
import { groupLevelAdvice } from './advice-groups.js'
import type { Advice } from './advice-types.js'
import type { Diagnostic } from './codes.js'
import type { Config, Facts, FileRecord } from './types.js'

/** 保守阈值：**≥3 个导出各自只被一个域用**才算信号（2 个可能是巧合） */
const MIN_PER_DOMAIN_EXPORTS = 3
/** 组粒度的保守阈值：1 个文件太细、20 个文件太粗（先写死，后续可声明化） */
const MIN_GROUP_FILES = 2
const MAX_GROUP_FILES = 20

export interface AdviceInput {
  config: Config
  records: FileRecord[]
  facts: Map<string, Facts>
  graph: Graph
  files: string[]
}

/** 一个文件里"各归各域"的导出（名字 + 它唯一的消费域） */
interface PerDomainExport {
  name: string
  domain: string
}

/**
 * **架构建议**（R-118）：从已有事实算出**可核对的信号**，给出**处方选项**，并且**永不阻断**。
 *
 * 为什么放在「自述」里而不是规则里：规则是"违规 → 红"，必须机械可判定、零误报；而"这坨东西该不该
 * 跟域走"是**判断**，只能给信号 + 选项，让人来定。所以建议走 notice：进报告、进 JSON、**不影响退出码**。
 *
 * 两条信号：
 * - `per-domain-exports`：一个文件里 **≥3 个导出各自只被一个域用**（域各不相同）——
 *   架构审查里"shared 长成第二套 modules"的可判定形态（加 / 下线一个域都要改这个文件）。
 * - `group-granularity`：某个组只有 1 个源文件（"组"其实是一个文件）/ 超过 20 个（可能装了俩业务）。
 *
 * **豁免**（R-121）：`overrides.adviceAllow` 可以按（信号 × 主体 glob）声明"这条建议对它不适用"，
 * 但必须写理由、写了到期就必过期，而且**豁免本身会在报告里自述**（静默关闭是这套机制最该防的事）。
 */
export function pushAdviceNotices(input: AdviceInput, notices: Diagnostic[]): void {
  const { config, records } = input
  const candidates: Advice[] =
    records.length === 0
      ? []
      : [
          ...perDomainExportAdvice(input),
          ...groupGranularityAdvice(records),
          ...groupLevelAdvice(input),
        ]
  const allow = config.adviceAllow ?? []
  const used = new Set<number>()
  let suppressed = 0
  for (const advice of candidates) {
    const hit = allow.findIndex(
      (entry) => entry.signal === advice.signal && globToRegExp(entry.glob).test(advice.subject),
    )
    if (hit === -1) {
      notices.push({ code: 'architecture-advice', text: advice.text })
      continue
    }
    used.add(hit)
    suppressed += 1
  }
  // **豁免必须可见**：静默关闭是这套机制最该防的事
  if (suppressed > 0) {
    notices.push({
      code: 'architecture-advice',
      text:
        `架构建议：${suppressed} 条被 \`adviceAllow\` 声明豁免（理由与到期在配置里）—— ` +
        '豁免是**可见的**，不是关掉提示',
    })
  }
  const unused = allow.filter((_, index) => !used.has(index))
  /**
   * **声明必须有消费者**（R-171）：0 命中不是"提示"，而是配置腐烂 ——
   * 本工具面向 AI，非阻断的"可能可以删掉"不会有人处理；留着只会变成隐形的门禁关闭。
   */
  assertAdviceAllowConsumed(unused)
}

/**
 * 信号一：**一个文件里的导出各归各域**。
 *
 * 边界（宁少报不误伤）：
 * - **纯类型导出不算**（`interface` / `type`）：DTO 这类"契约镜像"常常按域命名却该集中；
 * - 被**多个域**共用的导出不算（那是真的跨域中立）；
 * - 只看**具名导入**；`export *` 中转、默认导入、动态导入不参与；
 * - 已经声明为公开面入口（`entry: true`）的文件不判 —— 那个的用途就是给外面引。
 */
function perDomainExportAdvice(input: AdviceInput): Advice[] {
  const { config, records, facts, graph, files } = input
  const fileSet = new Set(files)
  const byRel = new Map(records.map((record) => [record.rel, record]))
  const domainOf = (rel: string): string => {
    const record = byRel.get(rel)
    return record?.domain ?? record?.captures?.domain ?? record?.captures?.slice ?? ''
  }
  const entryRoleIds = new Set(
    config.roles.filter((role) => role.entry === true).map((role) => role.id),
  )
  const out: Advice[] = []

  for (const record of records) {
    const own = facts.get(record.rel)
    if (!own || own.exports.length === 0) continue
    if (entryRoleIds.has(record.role)) continue // 公开面入口就是给外面引的
    /** 导出名 → 消费它的域集合（只数具名导入） */
    const consumers = new Map<string, Set<string>>()
    for (const importer of graph.importers.get(record.rel) ?? []) {
      const domain = domainOf(importer)
      if (domain === '') continue
      const importerFacts = facts.get(importer)
      if (!importerFacts) continue
      for (const item of importerFacts.imports) {
        if (!item.names || item.names.length === 0) continue
        if (resolveSpecifier(item.spec, importer, config, fileSet) !== record.rel) continue
        for (const name of item.names) {
          const set = consumers.get(name) ?? new Set<string>()
          set.add(domain)
          consumers.set(name, set)
        }
      }
    }
    if (consumers.size === 0) continue
    const perDomain: PerDomainExport[] = []
    for (const item of own.exports) {
      if (!item.declared) continue
      if (item.typeOnly) continue // 契约镜像（DTO）按域命名但该集中
      const set = consumers.get(item.name)
      if (!set || set.size !== 1) continue
      perDomain.push({ name: item.name, domain: [...set][0] as string })
    }
    const domains = new Set(perDomain.map((item) => item.domain))
    if (perDomain.length < MIN_PER_DOMAIN_EXPORTS || domains.size < 2) continue
    const listing = perDomain
      .slice(0, 4)
      .map((item) => `${item.name}→${item.domain}`)
      .join(' · ')
    out.push({
      signal: 'per-domain-exports',
      subject: record.rel,
      text:
        `${record.rel} 里有 ${perDomain.length} 个导出**各归各域**（${listing}${perDomain.length > 4 ? ' …' : ''}）：` +
        '加 / 下线一个域都要改这个文件。\n' +
        '  常见处置：① 下沉到各自的域（跟着域走，判据见 PARADIGM §6.15）' +
        ' ② 若它确实是跨域中立的，用 `overrides.adviceAllow` 声明豁免（要写理由）\n' +
        '  （建议不阻断 —— 门禁这一轮照常通过）',
    })
  }
  return out
}

/**
 * 信号二：**组粒度**（R-120）。
 *
 * 组取的是**仓库自己的概念**（`record.groupName` + `record.group`，即结构声明里的组维度），
 * 所以范式无关：canonical 的 `{domain}` 与 FSD 的 `{slice}` 都吃。测试文件（layer ≥ 90）不计。
 */
function groupGranularityAdvice(records: FileRecord[]): Advice[] {
  const groups = new Map<string, { label: string; files: string[] }>()
  for (const record of records) {
    if (record.layer >= TEST_LAYER_MIN) continue
    if (!record.groupName || !record.group) continue
    const key = `${record.groupName}:${record.group}`
    const entry = groups.get(key) ?? { label: `${record.groupName} ${record.group}`, files: [] }
    entry.files.push(record.rel)
    groups.set(key, entry)
  }
  const out: Advice[] = []
  for (const { label, files } of groups.values()) {
    if (files.length < MIN_GROUP_FILES) {
      out.push({
        signal: 'group-granularity',
        subject: label,
        text:
          `${label} 只有 1 个源文件（${files[0]}）：这一层「组」其实是一个文件。\n` +
          '  常见处置：① 并进相邻组 ② 如果它确实横切、被多个组用，提升为共享层' +
          ' ③ 确认它只是 stub，那就先别单独成组\n' +
          '  （建议不阻断 —— 门禁这一轮照常通过）',
      })
      continue
    }
    if (files.length > MAX_GROUP_FILES) {
      out.push({
        signal: 'group-granularity',
        subject: label,
        text:
          `${label} 有 ${files.length} 个源文件：这个组可能装了两个业务（改一处仍要全组搜）。\n` +
          '  常见处置：① 按子域拆成两个组 ② 若它确实是一个域，用 `adviceAllow` 声明豁免\n' +
          '  （建议不阻断 —— 门禁这一轮照常通过）',
      })
    }
  }
  return out
}
