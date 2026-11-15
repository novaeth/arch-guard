import { TEST_LAYER_MIN } from '../../../engine/defaults.js'
import type { Finding, Rule } from '../../../engine/types.js'

import { NEUTRAL_WORDS, classifyWord, toPlural, toSingular } from '../../../data/plural-forms.js'
import { bucketsOf, dirOfPattern, extraDirsOf, finding } from './structure-util.js'

/**
 * 声明驱动的**组与目录**规则：组完整性（S35）· 保留名目录（S25）· 规模阈值（S26/S27）。
 *
 * 阈值与词表都来自 `structure.*` 声明，规则里没有方法论字面量：
 * 换一份角色表 + 声明，同一组规则就能量别的目录规范。
 * （编号说明：本仓库上游的 S24 是「契约扫描域非空」，所以"组必须有片段"落 **S35**。）
 */

/* ---------------- S35 组必须有片段（不能只有公开面入口） ---------------- */

/**
 * 判据：某个组里**除入口角色外一个文件都没有** → 只有一个空壳入口。
 *
 * 与 S23① 的分工（两条不许互相重复报）：
 *   - 只有 `index.ts` 的切片 → **S35** 报（公开面在，但里面没东西）；
 *   - 只有 `ui/` 没有 `index.ts` 的切片 → **S23①** 报（有内容，但没公开面）。
 *
 * 组维度由 `structure.segmentedGroups` 声明 —— 引擎不认识"切片"这个词。
 */
export const segmentedGroups: Rule = {
  id: 'S35',
  domain: 'structure',
  level: 'L3',
  severity: 'error',
  title: '组必须有片段',
  hint: '只有公开面入口的组等于空壳：把代码拆进片段目录，或把它并回用到它的地方',
  run: (ctx) => {
    const dimensions = new Set(ctx.config.structure.segmentedGroups ?? [])
    if (dimensions.size === 0) return []
    const entryRoles = new Set(
      ctx.config.roles.filter((role) => role.entry === true).map((role) => role.id),
    )
    const groups = new Map<
      string,
      { layer: number; group: string; anchor: string; body: boolean }
    >()
    for (const record of ctx.records) {
      if (record.layer >= TEST_LAYER_MIN) continue
      if (!record.groupName || !dimensions.has(record.groupName) || !record.group) continue
      const key = `${record.layer}:${record.groupName}:${record.group}`
      const seen = groups.get(key) ?? {
        layer: record.layer,
        group: record.group,
        anchor: record.rel,
        body: false,
      }
      if (record.rel < seen.anchor) seen.anchor = record.rel
      if (!entryRoles.has(record.role)) seen.body = true
      groups.set(key, seen)
    }
    const out: Finding[] = []
    for (const group of groups.values()) {
      if (group.body) continue
      out.push(
        finding(
          'S35',
          group.anchor,
          1,
          `组「${group.group}」（第 ${group.layer} 层）只有公开面入口，没有任何片段：拆不开的组说明它还不该独立存在`,
        ),
      )
    }
    return out
  },
}

/* ---------------- S25 片段内不许出现保留名目录 ---------------- */

/**
 * 判据：文件路径里**超出角色 pattern 自己那一段**的目录，基名命中 `structure.reservedNames` → 报。
 *
 * 例（声明 `['ui','api','lib','model','config','@x']`）：
 *   - `shared/ui/button/index.ts` → `button` 不是保留名 → 放过；
 *   - `shared/lib/ui/util.ts` → 多余的 `ui` → 报（读的人会把它当成片段）；
 *   - `shared/ui/button/ui/x.ts` → 更深处那个 `ui` → 报。
 *
 * 判据全靠**角色 pattern 的目录部分**：`src/pages/{slice}/ui/**` 消耗三层目录，
 * 所以 `src/pages/crews/ui` 本身不是"多余目录"，`src/pages/crews/ui/lib` 里的 `lib` 才是。
 */
export const reservedFolderNames: Rule = {
  id: 'S25',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '片段内不许出现保留名目录',
  hint: '保留名（ui / api / lib …）专指片段那一层：嵌套同名目录会让读者分不清自己在哪一层',
  run: (ctx) => {
    const reserved = new Set(ctx.config.structure.reservedNames ?? [])
    if (reserved.size === 0) return []
    const patternOf = new Map(ctx.config.roles.map((role) => [role.id, role.pattern]))
    const violations = new Map<string, string[]>()
    for (const record of ctx.records) {
      if (record.layer >= TEST_LAYER_MIN) continue
      const pattern = patternOf.get(record.role)
      if (pattern === undefined) continue
      const extra = extraDirsOf(record.rel, pattern)
      if (extra === null) continue
      for (const dir of extra) {
        const base = dir.slice(dir.lastIndexOf('/') + 1)
        if (!reserved.has(base)) continue
        const list = violations.get(dir) ?? []
        list.push(record.rel)
        violations.set(dir, list)
      }
    }
    const out: Finding[] = []
    for (const [dir, files] of [...violations].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const anchor = [...files].sort()[0] as string
      const base = dir.slice(dir.lastIndexOf('/') + 1)
      out.push(
        finding(
          'S25',
          anchor,
          1,
          `${dir} 是片段内的保留名目录（「${base}」专指片段那一层）：改名，或把它上移到片段根`,
        ),
      )
    }
    return out
  },
}

/* ---------------- S26 组数量上限 ---------------- */

/**
 * 判据：按「层 + 父组桶」分组后，桶内**不同的组**超过 `max` → 报（锚在桶内字典序最小的文件上）。
 *
 * "父组桶"由 `captures` 里**除本维度外**的捕获决定：分组切片
 * （`src/features/{group}/{slice}/ui/**`）的桶就是 `{group}`；未分组的切片同属一个桶。
 * 阈值由宿主声明（社区默认 20）—— 规则里没有数字，大应用调高即可。
 */
export const groupCountLimits: Rule = {
  id: 'S26',
  domain: 'structure',
  level: 'L3',
  severity: 'error',
  title: '组数量上限',
  hint: '同一层里堆太多同类组说明该分组（或该把代码移回用到它的地方）；阈值在 structure.groupCountLimits 里调',
  run: (ctx) => {
    const limits = ctx.config.structure.groupCountLimits ?? []
    if (limits.length === 0) return []
    const out: Finding[] = []
    for (const limit of limits) {
      for (const bucket of bucketsOf(ctx, limit.dimension).values()) {
        if (bucket.names.size <= limit.max) continue
        const where = bucket.bucket === '' ? '' : `（组 ${bucket.bucket}）`
        out.push(
          finding(
            'S26',
            bucket.anchor,
            1,
            `第 ${bucket.layer} 层${where}有 ${bucket.names.size} 个「${limit.dimension}」组，超过上限 ${limit.max}：考虑分组，或把代码移回用到它的层`,
          ),
        )
      }
    }
    return out
  },
}

/* ---------------- S28 组的外部引用下限（死切片） ---------------- */

/**
 * 判据（只数**跨层**的引用，同层引用不计）：
 *   - 引用组数为 0 → 报"没被用到"；
 *   - 少于 `min` → 报（默认 `min: 1` 时就是"只有一个引用者，通常该合并进去"）；
 *   - 例外：唯一引用者来自 `singleFromLayers` 里的层时放过（页面只被装配层引用是正常形态）。
 *
 * `exceptLayers` 整层跳过：页面天然只被路由层引用，查它只会得到一片噪音。
 * 计数单位是**引用组**（层 + 组值），与社区 linter 的 (layer, slice) 口径一致。
 */
export const groupInDegree: Rule = {
  id: 'S28',
  domain: 'structure',
  level: 'L3',
  severity: 'error',
  title: '组的外部引用下限',
  hint: '没人引用的组是死代码；只有一个引用者时通常该把它合并进那一处',
  run: (ctx) => {
    const specs = ctx.config.structure.groupInDegree ?? []
    if (specs.length === 0) return []
    const byRel = new Map(ctx.records.map((record) => [record.rel, record]))
    const entryRoles = new Set(
      ctx.config.roles.filter((role) => role.entry === true).map((role) => role.id),
    )
    const out: Finding[] = []

    for (const spec of specs) {
      const except = new Set(spec.exceptLayers ?? [])
      const singleFrom = new Set(spec.singleFromLayers ?? [])
      const groups = new Map<
        string,
        { layer: number; group: string; anchor: string; bodyAnchor: string | null }
      >()
      for (const record of ctx.records) {
        if (record.layer >= TEST_LAYER_MIN) continue
        if (record.groupName !== spec.dimension || !record.group) continue
        if (except.has(record.layer)) continue
        const key = `${record.layer}:${record.group}`
        const seen = groups.get(key) ?? {
          layer: record.layer,
          group: record.group,
          anchor: record.rel,
          bodyAnchor: null,
        }
        if (record.rel < seen.anchor) seen.anchor = record.rel
        if (
          !entryRoles.has(record.role) &&
          (seen.bodyAnchor === null || record.rel < seen.bodyAnchor)
        ) {
          seen.bodyAnchor = record.rel
        }
        groups.set(key, seen)
      }

      // 遍历**图里的所有边**（而不是 records 里的文件）：契约域外的文件（`vite.config.ts`、
      // 未登记路径）照样能引用到组，把它们漏掉会把"其实有人用"报成死代码。
      const referrers = new Map<string, Set<string>>()
      for (const [from, targets] of ctx.graph.edges) {
        const source = byRel.get(from)
        if (source && source.layer >= TEST_LAYER_MIN) continue
        for (const target of targets) {
          const to = byRel.get(target)
          if (!to || to.layer >= TEST_LAYER_MIN) continue
          if (to.groupName !== spec.dimension || !to.group) continue
          if (except.has(to.layer)) continue
          if (source && source.layer === to.layer) continue
          const key = `${to.layer}:${to.group}`
          if (!referrers.has(key)) referrers.set(key, new Set())
          referrers.get(key)?.add(`${source?.layer ?? 'outside'}:${source?.group ?? ''}`)
        }
      }

      for (const [key, group] of groups) {
        const refs = referrers.get(key) ?? new Set<string>()
        if (refs.size >= spec.min) continue
        if (refs.size === 1 && singleFrom.size > 0) {
          const only = [...refs][0] as string
          const layer = Number(only.slice(0, only.indexOf(':')))
          if (singleFrom.has(layer)) continue
        }
        const anchor = group.bodyAnchor ?? group.anchor
        out.push(
          finding(
            'S28',
            anchor,
            1,
            refs.size === 0
              ? `组「${group.group}」（第 ${group.layer} 层）没有任何外部引用：没被用到的东西就是死代码`
              : `组「${group.group}」（第 ${group.layer} 层）只有 ${refs.size} 个外部引用组，少于下限 ${spec.min}：考虑合并进引用方`,
          ),
        )
      }
    }
    return out
  },
}

/* ---------------- S29 组名与其它单元重名 ---------------- */

/**
 * 判据：组名（分组切片的每一段）落在 `structure.nameCollisions` 声明的**保留词汇**里 → 报。
 *
 * 词汇表由角色推导并**只收真实存在的目录**："项目里有个片段叫 config，同时有个切片也叫 config"
 * 才是歧义；声明一整张静态词表会把项目里根本不存在的单元也算进来（那是误报）。
 */
export const nameCollisions: Rule = {
  id: 'S29',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '组名与其它单元重名',
  hint: '组名撞上单元名，读的人分不清这是哪一层；改名，或把它并进那个单元',
  run: (ctx) => {
    const specs = ctx.config.structure.nameCollisions ?? []
    if (specs.length === 0) return []
    const out: Finding[] = []
    for (const spec of specs) {
      const vocabulary = new Set<string>()
      for (const roleId of spec.vocabularyRoles) {
        const pattern = ctx.config.roles.find((role) => role.id === roleId)?.pattern
        if (pattern === undefined) continue
        const dir = dirOfPattern(pattern)
        if (dir === null) continue
        if (!ctx.records.some((record) => record.rel.startsWith(`${dir}/`))) continue
        vocabulary.add(dir.slice(dir.lastIndexOf('/') + 1))
      }
      if (vocabulary.size === 0) continue
      for (const bucket of bucketsOf(ctx, spec.dimension).values()) {
        // 叶子组名与**组路径段**都要查：分组切片的组名（`{group}`）同样会与单元名撞车
        // （社区 linter 也是逐段比对整条切片路径，不是只看叶子）
        const leaf = [...bucket.names].sort().find((name) => vocabulary.has(name))
        const ancestor =
          leaf === undefined
            ? [...bucket.ancestors].sort().find((name) => vocabulary.has(name))
            : undefined
        if (leaf === undefined && ancestor === undefined) continue
        out.push(
          finding(
            'S29',
            bucket.anchor,
            1,
            leaf !== undefined
              ? `第 ${bucket.layer} 层的组名「${leaf}」与另一个已存在的单元同名：读的人分不清这是组还是单元`
              : `第 ${bucket.layer} 层的组路径段「${ancestor}」与另一个已存在的单元同名：读的人分不清哪一层是组、哪一层是单元`,
          ),
        )
      }
    }
    return out
  },
}

/* ---------------- S30 组名里的重复词 ---------------- */

/** 与社区 linter 相同的分词：`CrewsWidget` / `crews-widget` / `crews_widget` 都切成两个词 */
const WORD_PATTERN = /(?:[A-Z]+|[a-z]+)[a-z]*/g

/**
 * 判据：同一桶里**每个**组名都含某个词，且桶内组数 > 2 → 报。
 * 这一层已经表达了用途（`pages/` 下的都是页面），组名里再重复一遍只是噪音。
 */
export const repetitiveNaming: Rule = {
  id: 'S30',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '组名里的重复词',
  hint: '同一层每个组名都带同一个词：那一层已经说明用途了，组名里去掉它',
  run: (ctx) => {
    const dimensions = ctx.config.structure.repetitiveNaming ?? []
    if (dimensions.length === 0) return []
    const out: Finding[] = []
    for (const dimension of dimensions) {
      for (const bucket of bucketsOf(ctx, dimension).values()) {
        const names = [...bucket.names]
        if (names.length <= 2) continue
        const counts = new Map<string, number>()
        for (const name of names) {
          const words = new Set((name.match(WORD_PATTERN) ?? []).map((word) => word.toLowerCase()))
          for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
        }
        for (const [word, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
          if (count < names.length) continue
          out.push(
            finding(
              'S30',
              bucket.anchor,
              1,
              `第 ${bucket.layer} 层的 ${names.length} 个组名里都出现「${word}」：用途已经由层表达，组名里不必重复`,
            ),
          )
        }
      }
    }
    return out
  },
}

/* ---------------- S31 组名单复数一致性 ---------------- */

/**
 * 判据：同一桶里既有单数名又有复数名 → 报，并指出该统一成哪种（多数派；数量相等时偏向复数）。
 *
 * 词形判定来自 `src/data/plural-forms.ts` 的**数据表**，不是"名字好不好"这类语义判断 ——
 * 判据是"同一层内是否一致"，机械可判定，所以可以进 error 红线（见 ADR-0001）。
 */
export const pluralConsistency: Rule = {
  id: 'S31',
  domain: 'structure',
  level: 'L1',
  severity: 'error',
  title: '组名单复数一致性',
  hint: '同一层里单复数混用：读的人会以为 `user` 与 `users` 是两种东西',
  run: (ctx) => {
    const specs = ctx.config.structure.pluralConsistency ?? []
    if (specs.length === 0) return []
    const out: Finding[] = []
    for (const spec of specs) {
      const layers = spec.layers && spec.layers.length > 0 ? new Set(spec.layers) : null
      const neutral =
        spec.neutralWords && spec.neutralWords.length > 0 ? spec.neutralWords : NEUTRAL_WORDS
      for (const bucket of bucketsOf(ctx, spec.dimension, layers).values()) {
        const names = [...bucket.names].sort()
        const plurals = names.filter((name) => classifyWord(name, neutral) === 'plural')
        const singulars = names.filter((name) => classifyWord(name, neutral) === 'singular')
        if (plurals.length === 0 || singulars.length === 0) continue
        const preferPlural = plurals.length >= singulars.length
        const wrong = preferPlural ? singulars : plurals
        const suggested = wrong.map((name) => (preferPlural ? toPlural(name) : toSingular(name)))
        out.push(
          finding(
            'S31',
            bucket.anchor,
            1,
            `第 ${bucket.layer} 层的组名单复数混用：${singulars.join(' / ')} 是单数、${plurals.join(' / ')} 是复数` +
              `；统一成${preferPlural ? '复数' : '单数'}（把 ${wrong.join(' / ')} 改成 ${suggested.join(' / ')}）`,
          ),
        )
      }
    }
    return out
  },
}

/**
 * 按「层 + 父桶」归拢某一维度的组：桶内是**叶子组名**的集合（分组切片取 `{slice}` 那一段）。
 * S26 / S29 / S30 / S31 共用它 —— 分桶口径只有一处真相。
 */

export const structureGroupRules: Rule[] = [
  segmentedGroups,
  reservedFolderNames,
  groupCountLimits,
  groupInDegree,
  nameCollisions,
  repetitiveNaming,
  pluralConsistency,
]
