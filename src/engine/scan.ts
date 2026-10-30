import { join } from 'node:path'

import {
  foreignExtensions,
  frameworkSources,
  resolveFramework,
  supportedExtensions,
} from '../data/framework-sources.js'
import { buildOutputDirs } from '../data/build-output-dirs.js'
import { cssSyntaxes } from '../data/css-syntaxes.js'
import { TS_EXTENSIONS } from './facts.js'
import type { Config, FileKind, FileRecord, RoleDescriptor } from './types.js'
import { globToRegExp, relOf, walk } from './util.js'

/** 样式扩展名的**唯一出处**是数据表（`engine/css.ts` 也从它选解析语法，见 docs/DESIGN.md §6.1.2） */
export const CSS_EXTENSIONS = cssSyntaxes.map((item) => item.extension)

const SLOT = '__AG_SLOT__'

export interface CompiledRole extends RoleDescriptor {
  regex: RegExp
  names: string[]
}

/** `{name}` 占位成单段捕获（用于域目录），其余交给 globToRegExp */
function compile(pattern: string): { regex: RegExp; names: string[] } {
  const names: string[] = []
  const normalized = pattern.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, name: string) => {
    names.push(name)
    return SLOT
  })
  const { source } = globToRegExp(normalized)
  return { regex: new RegExp(source.split(SLOT).join('([^/]+)')), names }
}

/** 兜底：与项目无关的通用产物目录（名单在数据表里，见 `src/data/build-output-dirs.ts`） */
const DEFAULT_SKIP = new Set(buildOutputDirs)

export interface ScanResult {
  files: string[]
  records: FileRecord[]
  missing: string[]
  ambiguous: { rel: string; roles: string[] }[]
  ignored: string[]
  /** 契约扫描域之外的 ts/css：不参与角色判定，但**仍要解析**（角色记为 `(outside)`） */
  outside: FileRecord[]
  /** 契约域外且被 git 忽略、因此连解析都跳过的文件（报告会自述条数） */
  vcsIgnored: string[]
  /** 当前框架包量不了的源码文件（如 react pack 遇到 `.vue`）—— S20 靠它把假绿变成报错 */
  foreign: string[]
}

function kindOf(rel: string): FileKind {
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(rel)) return 'ts'
  if (CSS_EXTENSIONS.some((ext) => rel.endsWith(ext))) return 'css'
  if (rel.endsWith('.json')) return 'json'
  return 'other'
}

/** 角色匹配用的编译结果（glob → 正则），构建一次、反复用 */
export interface RoleIndex {
  roles: CompiledRole[]
  ignore: RegExp[]
  include: RegExp[]
  /**
   * git 判定「不在仓库里」的路径（`.gitignore` 等）—— **只作用于契约域外的文件**。
   * 不传 = 不启用这一层（没有 git / 调用方不需要时行为与从前一致）。
   */
  vcsIgnored?: { files: Set<string>; dirs: string[] }
}

/**
 * 角色匹配的**唯一实现**：全量扫描与 `--explain` 共用。
 * 为什么要抽出来：一旦"解释"和"判定"各写一套匹配逻辑，两者迟早会给出不同答案 ——
 * 而 agent 会照着解释去写代码，错的那一份就成了新的假绿来源。
 */
export function buildRoleIndex(config: Config, vcsIgnored?: RoleIndex['vcsIgnored']): RoleIndex {
  return {
    roles: config.roles.map((descriptor) => ({ ...descriptor, ...compile(descriptor.pattern) })),
    ignore: config.ignore.map(globToRegExp),
    include: config.include.map(globToRegExp),
    ...(vcsIgnored ? { vcsIgnored } : {}),
  }
}

/** 是否落在 git 忽略集里（`--directory` 会把整个被忽略的目录收成一条 `dir/` 记录，按前缀匹配） */
function isVcsIgnored(index: RoleIndex, rel: string): boolean {
  if (!index.vcsIgnored) return false
  if (index.vcsIgnored.files.has(rel)) return true
  return index.vcsIgnored.dirs.some((dir) => rel.startsWith(dir))
}

export type RoleResolution =
  | { status: 'ignored' }
  /** json / html 等资源：只进文件集（供图解析），不参与角色判定 */
  | { status: 'resource'; kind: FileKind }
  /** 契约扫描域之外：不判目录契约，但仍进依赖图 */
  | { status: 'outside'; kind: FileKind }
  /** 契约域外 **且** 被 git 忽略：连解析都不做（生成代码 / 临时脚本）—— 见 `gitIgnoredPaths` */
  | { status: 'vcs-ignored'; kind: FileKind }
  /** 无处安放：没有任何角色命中 */
  | { status: 'missing'; kind: FileKind }
  /** 歧义：命中多个角色（结构不完备） */
  | { status: 'ambiguous'; kind: FileKind; roles: string[] }
  | {
      status: 'matched'
      kind: FileKind
      descriptor: CompiledRole
      captured: Record<string, string>
    }

export function resolveRole(index: RoleIndex, rel: string): RoleResolution {
  if (index.ignore.some((regex) => regex.test(rel))) return { status: 'ignored' }
  // 只有代码与样式参与角色判定；json / html 等资源只进文件集（供图解析用）
  const kind = kindOf(rel)
  if (kind !== 'ts' && kind !== 'css') return { status: 'resource', kind }
  /**
   * 契约扫描域：域外的 ts/css **不参与角色判定，也不报「不在目录契约内」** ——
   * vite.config.ts / e2e / scripts / 生成代码本来就不该被要求"落位"。
   *
   * 但它们**仍进 `outside` 并被解析**：import 边与「测试是独立可达根」都靠 facts，
   * 少了它们，只被域外测试引用的 src 文件会被误判成孤儿（S15）。
   * 领域外的一大片生成代码怎么省掉解析，见 .scratch/include-scope/spec.md 的非目标。
   */
  const inContract =
    index.include.length === 0 || index.include.some((matcher) => matcher.test(rel))
  if (!inContract) {
    /**
     * git 忽略层：**只作用于契约域外**。契约域内（`include` 命中）的文件即使被 `.gitignore` 也照判 ——
     * 宁可吵（生成物被报出来就去 `ignore` 里显式声明），也不静默不判（那是最难发现的假绿）。
     */
    if (isVcsIgnored(index, rel)) return { status: 'vcs-ignored', kind }
    return { status: 'outside', kind }
  }
  const hits: { descriptor: CompiledRole; captured: Record<string, string> }[] = []
  for (const descriptor of index.roles) {
    const match = rel.match(descriptor.regex)
    if (!match) continue
    const captured: Record<string, string> = {}
    descriptor.names.forEach((name, position) => {
      captured[name] = match[position + 1] ?? ''
    })
    if (descriptor.exclusive === true) {
      hits.length = 0
      hits.push({ descriptor, captured })
      break
    }
    hits.push({ descriptor, captured })
  }
  if (hits.length === 0) return { status: 'missing', kind }
  if (hits.length > 1)
    return { status: 'ambiguous', kind, roles: hits.map((hit) => hit.descriptor.id) }
  const hit = hits[0] as { descriptor: CompiledRole; captured: Record<string, string> }
  return { status: 'matched', kind, descriptor: hit.descriptor, captured: hit.captured }
}

/** 命中角色的文件 → `FileRecord`（组身份在这里派生，扫描与解释共用） */
export function recordOf(
  root: string,
  rel: string,
  matched: { kind: FileKind; descriptor: CompiledRole; captured: Record<string, string> },
): FileRecord {
  const groupName = matched.descriptor.group ?? null
  return {
    rel,
    abs: join(root, rel),
    role: matched.descriptor.id,
    layer: matched.descriptor.layer,
    domain: matched.captured.domain ?? null,
    slot: matched.descriptor.slot ?? null,
    captures: { ...matched.captured },
    group: groupName ? (matched.captured[groupName] ?? null) : null,
    groupName: groupName && matched.captured[groupName] ? groupName : null,
    kind: matched.kind,
    ...(matched.descriptor.pageLike === true ? { pageLike: true } : {}),
    ...(matched.descriptor.entry === true || matched.descriptor.slot === 'entry'
      ? { entry: true }
      : {}),
  }
}

/**
 * 扫出「文件 + 角色」。
 * 每个文件必须**恰好命中一个角色**（0 个 = 无处安放；≥1 个 = 歧义）—— 结构自检的基础。
 */
export function scanProject(
  config: Config,
  options: { vcsIgnored?: RoleIndex['vcsIgnored'] } = {},
): ScanResult {
  const { root } = config
  /**
   * 遍历时把**所有**框架的源码扩展名都收进来，再按当前 `sourceForm` 分流：
   * 支持的正常走角色判定；别的框架的（如 react pack 遇到 `.vue`）进 `foreign`。
   *
   * 为什么要收而不是直接无视：扩展名不在白名单里的文件会被 walk 静默丢掉，
   * 于是「本工具量不了这个项目」表现为「0 个文件 → ✔ 通过」—— 假绿比报错危险（S20）。
   */
  const framework = resolveFramework(config.sourceForm)
  const supported = supportedExtensions(framework)
  const foreign_ext = foreignExtensions(framework)
  const allFrameworkExtensions = [...new Set(frameworkSources.flatMap((item) => item.extensions))]
  const walked = walk(root, {
    skip: DEFAULT_SKIP,
    extensions: [...TS_EXTENSIONS, ...CSS_EXTENSIONS, '.json', '.html', ...allFrameworkExtensions],
  }).map((full) => relOf(root, full))

  const index = buildRoleIndex(config, options.vcsIgnored)

  const foreign: string[] = []
  const files = walked.filter((rel) => {
    const ext = rel.slice(rel.lastIndexOf('.'))
    if (supported.has(ext) || !foreign_ext.has(ext)) return true
    // `ignore` 是**项目边界**：既然明确说了"不进文件集"，就不该再因为"量不了"被 S20 报出来
    // —— S20 自己的提示就是"要么把这段源码移出扫描范围（ignore）"，而 ignore 此前不在这一步生效。
    // 放回 files 让正常流程把它记进 `ignored`（这样"ignore 命中 N 个文件"也数得对）。
    if (resolveRole(index, rel).status === 'ignored') return true
    foreign.push(rel)
    return false
  })

  const records: FileRecord[] = []
  const missing: string[] = []
  const ambiguous: { rel: string; roles: string[] }[] = []
  const ignored: string[] = []
  const outside: FileRecord[] = []
  const vcsIgnored: string[] = []

  for (const rel of files) {
    const resolution = resolveRole(index, rel)
    switch (resolution.status) {
      case 'ignored':
        ignored.push(rel)
        break
      case 'resource':
        break
      case 'vcs-ignored':
        vcsIgnored.push(rel)
        break
      case 'outside':
        outside.push({
          rel,
          abs: join(root, rel),
          role: '(outside)',
          layer: 0,
          domain: null,
          slot: null,
          captures: {},
          group: null,
          groupName: null,
          kind: resolution.kind,
        })
        break
      case 'missing':
        missing.push(rel)
        break
      case 'ambiguous':
        ambiguous.push({ rel, roles: resolution.roles })
        break
      case 'matched':
        records.push(recordOf(root, rel, resolution))
        break
    }
  }

  return { files, records, missing, ambiguous, ignored, outside, vcsIgnored, foreign }
}
