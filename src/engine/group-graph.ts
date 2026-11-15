import { TEST_LAYER_MIN } from './defaults.js'
import type { Graph } from './graph.js'
import type { FileRecord } from './types.js'

/**
 * **组图**：把文件级边折叠成组级边，供建议层与 S47 共用。
 *
 * 抽出来的原因与 `structure-util` 一样：组索引 / 组边 / 组环原来只在 `advice-groups.ts` 里有一份；
 * R-170 把"组级依赖环"升成红线（S47）后，规则与建议都要用同一套折叠口径 ——
 * 各写一遍迟早会出现"建议说没环、规则说有环"。
 */

/** 组 = 结构声明里的组维度（`groupName` + `group`）+ 组内源文件（测试不计入） */
export interface GroupNode {
  label: string
  /** 组的基准目录（组内文件的最长公共目录）：用来找"这个组的测试" */
  base: string
  files: FileRecord[]
}

/** 组索引：key = `${groupName}:${group}` */
export function groupIndexOf(records: FileRecord[]): Map<string, GroupNode> {
  const groups = new Map<string, GroupNode>()
  for (const record of records) {
    if (record.layer >= TEST_LAYER_MIN) continue // 测试 / story 不算"组的文件"
    if (!record.groupName || !record.group) continue
    const key = `${record.groupName}:${record.group}`
    const entry = groups.get(key) ?? {
      label: `${record.groupName} ${record.group}`,
      base: '',
      files: [],
    }
    entry.files.push(record)
    groups.set(key, entry)
  }
  for (const group of groups.values()) group.base = commonDirectory(group.files.map((f) => f.rel))
  return groups
}

/** 文件 rel → 所属组（组外文件不在表里） */
export function groupOfRelOf(groups: Map<string, GroupNode>): Map<string, GroupNode> {
  const out = new Map<string, GroupNode>()
  for (const group of groups.values()) {
    for (const record of group.files) out.set(record.rel, group)
  }
  return out
}

/** 最长公共目录：`src/modules/crews/{views,lib}/…` → `src/modules/crews` */
function commonDirectory(paths: string[]): string {
  const split = paths.map((path) => path.split('/').slice(0, -1))
  const first = split[0] ?? []
  let length = first.length
  for (const parts of split) {
    length = Math.min(length, parts.length)
    for (let index = 0; index < length; index += 1) {
      if (parts[index] !== first[index]) {
        length = index
        break
      }
    }
  }
  return first.slice(0, length).join('/')
}

/** 组边：跨组依赖（测试 / 组外文件不计） */
export function groupEdgesOf(
  edges: Graph['edges'],
  groupOfRel: Map<string, GroupNode>,
): Map<GroupNode, Set<GroupNode>> {
  const out = new Map<GroupNode, Set<GroupNode>>()
  for (const [from, targets] of edges) {
    const source = groupOfRel.get(from)
    if (!source) continue
    for (const target of targets) {
      const to = groupOfRel.get(target)
      if (!to || to === source) continue
      const set = out.get(source) ?? new Set<GroupNode>()
      set.add(to)
      out.set(source, set)
    }
  }
  return out
}

export interface GroupCycle {
  /** 环上的组（按发现顺序；最后会回到第一个） */
  cycle: GroupNode[]
  /** 稳定的环标识（标签排序后拼接）：同一环只报一次 */
  key: string
}

/**
 * 组边图里的环。从每个组出发做 DFS，回到起点即成环；同一环（成员相同）只报一次。
 *
 * 边界：只算跨组边 · 测试 / 组外文件不计 · 单文件环归 S08（不在组图里）。
 */
export function groupCyclesOf(
  groups: Map<string, GroupNode>,
  groupOfRel: Map<string, GroupNode>,
  edges: Graph['edges'],
): GroupCycle[] {
  const groupEdges = groupEdgesOf(edges, groupOfRel)
  const reported = new Set<string>()
  const out: GroupCycle[] = []
  for (const start of groups.values()) {
    const stack: GroupNode[] = []
    const visit = (node: GroupNode, seen: Set<GroupNode>): GroupNode[] | null => {
      stack.push(node)
      for (const next of groupEdges.get(node) ?? []) {
        if (next === start && stack.length > 1) return [...stack]
        if (seen.has(next)) continue
        seen.add(next)
        const found = visit(next, seen)
        if (found) return found
      }
      stack.pop()
      return null
    }
    stack.length = 0
    const cycle = visit(start, new Set([start]))
    if (!cycle) continue
    const key = cycle
      .map((item) => item.label)
      .sort()
      .join('|')
    if (reported.has(key)) continue
    reported.add(key)
    out.push({ cycle, key })
  }
  return out
}
