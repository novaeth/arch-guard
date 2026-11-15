import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

import ts from 'typescript'

import type { Diagnostic } from './codes.js'
import type { Facts, FileRecord } from './types.js'

/**
 * facts 持久缓存（见 .scratch/facts-cache/spec.md）。
 *
 * 为什么值得：`extractFacts` 是唯一昂贵的一步（实测 3043 文件 / 21.5 万行里占 79%），
 * 而它与「规则集、报告范围」都无关 —— 只由**文件内容 + rel + role** 决定。所以它可以安全地跨进程复用。
 *
 * 失效策略是**精确到文件**的：
 * - 单文件键 = rel + role + 内容哈希：内容或角色变了就重算。
 * - 整份缓存键 = `FACTS_CACHE_SPEC` + typescript 版本：fact 模型的形状或解析器换了就整体作废。
 * 图与全局谓词**不在缓存里**，每轮照旧从 facts 重建（「scope 只过滤报告」的语义不能破）。
 */

/** 事实模型 / 提取逻辑的版本。**改 `facts.ts` 的产出形状时必须 +1**，否则旧缓存会被复用。 */
export const FACTS_CACHE_SPEC = '12'

export const CACHE_DIR = '.arch-guard-cache'
const CACHE_FILE = 'facts.json.gz'

/**
 * 缓存放哪：跟 Vite 同一策略 —— 优先塞进 `node_modules`（那里天然被 git 忽略、
 * `rm -rf node_modules` 顺手带走，宿主不用额外配 .gitignore）；
 * 没有 `node_modules` 时（PnP、monorepo 子包、无依赖项目）退回项目根。
 */
export function cacheDirOf(root: string): string {
  const nodeModules = join(root, 'node_modules')
  return existsSync(nodeModules) ? join(nodeModules, CACHE_DIR) : join(root, CACHE_DIR)
}

interface CacheEntry {
  hash: string
  facts: Facts
}

interface CachePayload {
  spec: string
  typescript: string
  files: Record<string, CacheEntry>
}

export interface FactsCache {
  /** 命中返回缓存的 facts，未命中返回 null（计数由缓存自己记） */
  get(record: FileRecord, text: string): Facts | null
  /** 本轮自己解析出来的结果，登记进缓存 */
  set(record: FileRecord, text: string, facts: Facts): void
  /** 落盘（只写本轮见过的文件，顺带清掉已删除文件的旧条目） */
  save(): void
  stats(): { hits: number; misses: number; path: string | null }
}

/** 单文件内容键：rel / role / 内容 三者任一变化都不该复用 */
function hashOf(rel: string, role: string, text: string): string {
  return createHash('sha1')
    .update(rel)
    .update('\0')
    .update(role)
    .update('\0')
    .update(text)
    .digest('hex')
}

/** 关掉缓存的桩（`--no-cache`）：行为与「缓存永远不命中」等价，`misses` 照实计数 */
export function disabledFactsCache(): FactsCache {
  let misses = 0
  return {
    get: () => {
      misses += 1
      return null
    },
    set: () => {},
    save: () => {},
    stats: () => ({ hits: 0, misses, path: null }),
  }
}

export function openFactsCache(root: string, notice: (diagnostic: Diagnostic) => void): FactsCache {
  const path = join(cacheDirOf(root), CACHE_FILE)
  let loaded: CachePayload | null = null

  try {
    const raw = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as CachePayload
    if (raw.spec !== FACTS_CACHE_SPEC) {
      notice({
        code: 'facts-cache-reset',
        text: `facts 缓存作废：规范版本 ${raw.spec} ≠ ${FACTS_CACHE_SPEC}（事实模型变过，重算）`,
      })
    } else if (raw.typescript !== ts.version) {
      notice({
        code: 'facts-cache-reset',
        text: `facts 缓存作废：TypeScript ${raw.typescript} ≠ ${ts.version}（解析器变过，重算）`,
      })
    } else if (raw.files === null || typeof raw.files !== 'object') {
      notice({ code: 'facts-cache-reset', text: 'facts 缓存损坏：files 不是对象，重算' })
    } else {
      loaded = raw
    }
  } catch (error) {
    // 缓存不可用从来不是错误：首次运行、文件被删、写坏了都走这里 —— 但要说清楚
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT')
      notice({
        code: 'facts-cache-unavailable',
        text: `facts 缓存不可用（${(error as Error).message}），全量重算`,
      })
  }

  const entries = loaded?.files ?? {}
  const next: Record<string, CacheEntry> = {}
  let hits = 0
  let misses = 0
  let dirty = false

  return {
    get(record, text) {
      const entry = entries[record.rel]
      const hit = entry !== undefined && entry.hash === hashOf(record.rel, record.role, text)
      if (!hit) {
        misses += 1
        return null
      }
      hits += 1
      next[record.rel] = entry
      return entry.facts
    },
    set(record, text, facts) {
      next[record.rel] = { hash: hashOf(record.rel, record.role, text), facts }
      dirty = true
    },
    save() {
      // 一个都没重算、文件数也没变（没有增删）→ 磁盘上的那份还是对的，别白写一遍
      const pruned = Object.keys(next).length !== Object.keys(entries).length
      if (!dirty && !pruned && loaded !== null) return
      try {
        const dir = dirname(path)
        mkdirSync(dir, { recursive: true })
        /**
         * 缓存目录**自带** `.gitignore`（内容就一个 `*`）：宿主什么都不用配；更要紧的是
         * `git ls-files --others` 不会再把它当未跟踪文件 —— 否则缓存会混进 `--scope=changed`
         * 的变更集，缓存自己把自己变成了"改动"。
         */
        writeFileSync(join(dir, '.gitignore'), '*\n', 'utf8')
        const payload: CachePayload = {
          spec: FACTS_CACHE_SPEC,
          typescript: ts.version,
          files: next,
        }
        writeFileSync(path, gzipSync(JSON.stringify(payload)), 'utf8')
      } catch (error) {
        // 写不进去（只读盘、权限）不该让门禁失败 —— 缓存是加速手段，不是正确性依赖
        notice({
          code: 'facts-cache-write-failed',
          text: `facts 缓存写入失败（${(error as Error).message}），本次不影响判定`,
        })
      }
    },
    // path 一律给出：它是缓存文件的位置（`save()` 会写到那儿），不是「本次有没有命中」
    stats: () => ({ hits, misses, path }),
  }
}
