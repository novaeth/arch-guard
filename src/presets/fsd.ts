import type { Preset, RoleDescriptor } from '../engine/types.js'

import { library } from './library.js'

export interface FsdOptions {
  /** 应用入口（相对 `src`，默认 `app/main.tsx`）—— 可达性分析的根；必须真的存在 */
  entry?: string[]
  /** 源码根，默认 `src` */
  src?: string
  /** 有切片的层：层名 → 层号（越小越底层）。默认 FSD 的 pages/widgets/features/entities */
  slicedLayers?: Record<string, number>
  /** 无切片层（`app`）的层号，默认为最高层 */
  appLayer?: number
  /** 无切片层（`shared`）的层号，默认为最低层 */
  sharedLayer?: number
  /** 切片内允许的片段（**封闭枚举**：没列到的片段会被 S01 报出来） */
  segments?: string[]
  /** `shared` 下允许的片段 */
  sharedSegments?: string[]
  /** `app` 下允许的片段 */
  appSegments?: string[]
  /**
   * 是否使用**分组切片**（`features/auth/login/...`）。
   *
   * 必须显式打开：两种形态的路径无法用一组 glob 同时表达 ——
   * `src/features/{group}/{slice}/{seg}/**` 会把不带分组的 `features/crew-filter/ui/X.tsx`
   * 也匹配上（`{seg}` 吃掉 `ui`），于是同一个文件命中两个角色 → S01「角色歧义」。
   */
  slicesGrouped?: boolean
}

/**
 * FSD 的约定片段（按**用途**命名，而不是按内容）。
 *
 * 这几个名字都过了 `segments-by-purpose` 的检查 —— 该规则禁用按**内容**命名的片段：
 * `components` `helpers` `utils` `constants` `types` `stores` `services` **`assets`** `hooks` `context`
 * **`providers`** `composables` … （词表见 steiger 的 `segments-by-purpose` 文档）
 *
 * 所以默认值里**故意不含 `assets` / `providers`** —— 它们很常见，但会被社区官方 linter 判为"按内容命名"。
 *
 * **这是上游自相矛盾，选之前要知道**：`segments-by-purpose` 把 `providers` 明确列进 `BAD_NAMES_REACT`
 * （`['hook','hooks','context','provider','providers']`），而且**对无切片层（app / shared）同样生效**
 * —— 源码见 <https://github.com/feature-sliced/steiger/blob/master/packages/steiger-plugin-fsd/src/segments-by-purpose/index.ts>。
 * 与此同时，常见写法（以及不少"照指南来"的项目）会把 query client / theme 之类放进 `app/providers/…`。
 * **本预设站 linter**：默认集不含它，所以照那种写法落地会顶到 S01。
 * 显式加就明确是"我知道会被社区 linter 警告，仍然这么写"：
 * `fsd({ sharedSegments: [..., 'assets'], appSegments: [..., 'providers'] })`。
 */
const DEFAULT_SEGMENTS = ['ui', 'model', 'api', 'lib', 'config']
// 官方 shared 典型段：api / ui / lib / config / routes / i18n
const DEFAULT_SHARED_SEGMENTS = ['ui', 'lib', 'api', 'config', 'i18n', 'routes']
// 官方 app 典型段：routes / store / styles / entrypoint（`router` 与 `i18n` 是本仓既有命名，一并保留）
const DEFAULT_APP_SEGMENTS = ['router', 'routes', 'store', 'styles', 'entrypoint', 'i18n']

/**
 * 入口文件的扩展名集合。
 *
 * 社区的文件系统模型认**任何** `index.*`（`isIndex` 只看文件名前缀），我们只认**代码**扩展名 ——
 * `index.css` / `index.json` 不是公开面，把它们当入口等于把"模块的接口"交给一份样式表。
 * 这是唯一一处**有意更严**（见 docs/ALTERNATIVES.md 的「已知边界」）。
 */
const INDEX_EXT = '{ts,tsx,js,jsx,mjs,cjs}'
/** 这些片段**根**不要求 index，改为要求一级子目录各有 index（每个组件 / 模块一个目录） */
const CHILD_INDEX_SEGMENTS = new Set(['ui', 'lib'])
/**
 * 常规片段名（社区 `conventionalSegmentNames`）—— 只用于 S25 的保留名表：
 * 片段**内部**再出现这些名字会让人分不清层级（`shared/lib/ui/…`）。
 */
const CONVENTIONAL_SEGMENTS = ['ui', 'api', 'lib', 'model', 'config']

/** 片段清单只解析一次：角色表与结构声明必须看到同一份（两处真相会静默走偏） */
function segmentLists(options: FsdOptions): {
  segments: string[]
  sharedSegments: string[]
  appSegments: string[]
} {
  return {
    segments: options.segments ?? DEFAULT_SEGMENTS,
    sharedSegments: options.sharedSegments ?? DEFAULT_SHARED_SEGMENTS,
    appSegments: options.appSegments ?? DEFAULT_APP_SEGMENTS,
  }
}

/**
 * Feature-Sliced Design 范式的角色表 [^fsd]。
 *
 * 三层模型全部落成**数据**：层 → 层号；切片 → `group: 'slice'`（组维度）；
 * 片段 → **封闭枚举**（没登记就 S01）；公开面 → 切片的 `index.ts`，用 `entry: true` 标记。
 *
 * 于是 FSD 的规矩由通用规则判定，引擎里没有一行 FSD 字面量：
 * 层序单向 = S21 · 同层切片不许互引 = S22 · 切片必须有公开面且不许绕过 = S23 ·
 * 层名/片段名的封闭枚举 = S01（`processes` 这层被删掉后也自动报出来）。
 *
 * **与官方规范 v2.1 的对照**（[layers](https://feature-sliced.design/docs/reference/layers) ·
 * [slices-segments](https://feature-sliced.design/docs/reference/slices-segments) ·
 * [public-api](https://feature-sliced.design/docs/reference/public-api)）：
 *
 *   ✅ 六层（`processes` 官方已弃用，默认不含；要就 `slicedLayers` 加回）
 *   ✅ 层序单向 · 切片维度只在 pages/widgets/features/entities · app/shared 无切片且段间自由互引
 *   ✅ 片段默认集 = 官方 `ui/api/model/lib/config`；app/shared 的典型段（routes/store/styles/entrypoint/i18n）也认
 *   ✅ 每个切片必须公开面（`index.ts`）· 同层切片不许互引 · 切片分组（组文件夹里不许共享代码）
 *   ✅ 环境特定公开面 `index.server.{ts,tsx}` / `index.client.{ts,tsx}`
 *   ⚠️ **片段是封闭枚举**（没登记 → S01）：官方说"可以自由加片段"，本仓要求显式声明（D3 白名单 > 黑名单）
 *   ❌ **`@x` 跨引用公开面未实现**：官方的 `entities/A/@x/B.ts` 写法会被判 S01。它是一个**有意的松绑**
 *      （同层跨切片），要做得给 S22 开例外并限制在 entities 层 —— 见 docs/ALTERNATIVES.md 的对照表。
 */
export function fsdRoleTable(options: FsdOptions = {}): RoleDescriptor[] {
  const src = options.src ?? 'src'
  const sliced = options.slicedLayers ?? { pages: 5, widgets: 4, features: 3, entities: 2 }
  const appLayer = options.appLayer ?? 6
  const sharedLayer = options.sharedLayer ?? 1
  const lists = segmentLists(options)
  const segments = lists.segments
  const sharedSegments = lists.sharedSegments
  const appSegments = lists.appSegments
  const grouped = options.slicesGrouped === true

  const roles: RoleDescriptor[] = [
    { id: 'test', pattern: '**/*.test.{ts,tsx,mts,cts,js,mjs,cjs}', layer: 99, exclusive: true },
    { id: 'test', pattern: '**/*.spec.{ts,tsx,mts,cts,js,mjs,cjs}', layer: 99, exclusive: true },
  ]

  // app：**无切片层** —— 直接就是片段（FSD 的 sliceless layer）
  roles.push(
    { id: 'fsd:app:index', pattern: `${src}/app/index.${INDEX_EXT}`, layer: appLayer },
    // 环境特定入口（官方 public-api 页：`index.server.ts` / `index.client.ts`）
    {
      id: 'fsd:app:index',
      pattern: `${src}/app/index.{server,client}.${INDEX_EXT}`,
      layer: appLayer,
    },
    { id: 'fsd:app:main', pattern: `${src}/app/main.${INDEX_EXT}`, layer: appLayer },
    ...appSegments.map((segment) => ({
      id: `fsd:app:${segment}`,
      pattern: `${src}/app/${segment}/**`,
      layer: appLayer,
    })),
  )

  // 有切片的层：切片根只放 `index.ts`（公开面），片段各自一个角色
  const slice = grouped ? '{group}/{slice}' : '{slice}'
  for (const [layer, layerNumber] of Object.entries(sliced)) {
    roles.push({
      id: `fsd:${layer}:index`,
      pattern: `${src}/${layer}/${slice}/index.${INDEX_EXT}`,
      layer: layerNumber,
      group: 'slice',
      entry: true,
    })
    // 环境特定公开面（官方 public-api 页）：同样是这个切片的公开面
    roles.push({
      id: `fsd:${layer}:index`,
      pattern: `${src}/${layer}/${slice}/index.{server,client}.${INDEX_EXT}`,
      layer: layerNumber,
      group: 'slice',
      entry: true,
    })
    // 官方 **`@x` 跨引用公开面**（R-105）：`<provider>/@x/<consumer>.ts` = "provider 允许 consumer 拿这些"。
    // 这是 FSD 给"同层切片互引"留的唯一出口（实体互引最常见）：S22 / S23 为它开例外，
    // 且**只放行被指名的那一侧**（`consumer` 捕获要与调用方的切片名相同）。
    roles.push({
      id: `fsd:${layer}:x`,
      pattern: `${src}/${layer}/${slice}/@x/{consumer}.{ts,tsx}`,
      layer: layerNumber,
      group: 'slice',
    })
    roles.push(
      // 片段两种形态都算：`model/` 目录，以及**单文件片段** `model.ts`
      // （社区模型按"去掉扩展名后的名字"认片段，`entities/user/model.ts` 在它眼里是合法切片；
      //   只认目录形态会把这个常见写法误报成「文件不在目录契约内」）
      ...segments.flatMap((segment) => [
        {
          id: `fsd:${layer}:${segment}`,
          pattern: `${src}/${layer}/${slice}/${segment}/**`,
          layer: layerNumber,
          group: 'slice',
          // `pages` 层的 `ui` 片段就是页面组件本身 → S16 对它用 `viewLines`
          // （注意：改 `slicedLayers` 把页面层改名后这里不再匹配，会退化成 fileLines —— 见 S16 的告警）
          ...(layer === 'pages' && segment === 'ui' ? { pageLike: true as const } : {}),
        },
        {
          id: `fsd:${layer}:${segment}:file`,
          pattern: `${src}/${layer}/${slice}/${segment}.{ts,tsx}`,
          layer: layerNumber,
          group: 'slice',
          ...(layer === 'pages' && segment === 'ui' ? { pageLike: true as const } : {}),
        },
      ]),
    )
  }

  // shared：无切片层。片段的**入口**单独成角色，且标 `exclusive`：
  // `src/shared/ui/**` 会把 `src/shared/ui/button/index.ts` 也吃掉，一个文件命中两个角色 = 歧义（S01）。
  // 入口仍是角色表里的数据（`entry: true`），规则不认文件名。
  roles.push(
    ...sharedSegments.flatMap((segment) => {
      const entryRoles = CHILD_INDEX_SEGMENTS.has(segment)
        ? [
            // 一级子目录各有入口（每个组件 / 模块一个目录）
            {
              id: `fsd:shared:${segment}:index`,
              pattern: `${src}/shared/${segment}/{child}/index.${INDEX_EXT}`,
              layer: sharedLayer,
              entry: true,
              exclusive: true,
            },
            // 片段**根**的入口：有它就整段跳过子目录检查（与社区模型同口径 ——
            // 它先看片段根有没有 index，有就不再逐个要求子目录）
            {
              id: `fsd:shared:${segment}:root-index`,
              pattern: `${src}/shared/${segment}/index.${INDEX_EXT}`,
              layer: sharedLayer,
              entry: true,
              exclusive: true,
            },
          ]
        : [
            {
              id: `fsd:shared:${segment}:index`,
              pattern: `${src}/shared/${segment}/index.${INDEX_EXT}`,
              layer: sharedLayer,
              entry: true,
              exclusive: true,
            },
          ]
      return [
        ...entryRoles,
        {
          id: `fsd:shared:${segment}`,
          pattern: `${src}/shared/${segment}/**`,
          layer: sharedLayer,
        },
      ]
    }),
  )

  return roles
}

/**
 * FSD 范式预设：角色表 + 三条结构声明 + 契约落点。
 *
 * ```js
 * presets: [fsd(), designSystem({ … }), copy(), i18n(i18nextKit()), deps({ … }), hygiene(), uiKit(noneKit())]
 * ```
 *
 * 落点：全局样式 / 令牌 / 第三方覆盖**三处都在官方 app 段的 `app/styles` 下**（shared 的段要按用途命名，
 * 而"样式"不是 shared 的段名）· storage key `shared/config/storage.ts` · i18n `shared/i18n/locales`。
 *
 * 基础沿用库范式（`layout.modules` / `layout.shared` 置空 → 三根那套 S03–S09/S15/S18 自然空转，
 * 不会去查不存在的目录假装检查过）。
 */
export function fsd(options: FsdOptions = {}): Preset {
  const src = options.src ?? 'src'
  const base = library({ src, entry: [] })
  const lists = segmentLists(options)
  // 层号只解析一次：角色表与结构声明必须看到同一份
  const slicedLayers = options.slicedLayers ?? { pages: 5, widgets: 4, features: 3, entities: 2 }
  const layers = {
    app: options.appLayer ?? 6,
    pages: slicedLayers.pages ?? 5,
    entities: slicedLayers.entities ?? 2,
  }
  // shared 的片段角色：**全部**登记的片段（不是只算常规 5 个）。
  // 社区模型的 `getSegments(layer)` 是"除 index 外的所有子项"，所以 `shared/i18n` 同样要公开面、
  // 同样进重名词汇表；规则里再按"真实存在"过滤一次。
  const sharedSegmentRoles = lists.sharedSegments.map((segment) => `fsd:shared:${segment}`)
  return {
    ...base,
    // 覆盖 library 的范式标识：FSD 也是一个范式，不能和库范式混用
    paradigm: 'fsd',
    roles: fsdRoleTable(options),
    /**
     * **FSD 的入口默认在 app 段**（`src/app/main.tsx`）。`library()` 的 `layout.app = src` 会让默认
     * 入口落成 `src/main.tsx`（FSD 里不存在），根集为空 → 可达性规则（S15）把全树判成孤儿。
     * 项目入口不叫 `main.tsx` 时用 `fsd({ entry: ['app/bootstrap.tsx'] })` 覆盖。
     */
    entries: (options.entry ?? ['app/main.tsx']).map((file) => `${src}/${file}`),
    // FSD 的契约落点都在官方段名之下（app 的 `styles` / shared 的 `config` `i18n`），
    // 于是 `[fsd(), designSystem()]` 开箱即符合 FSD 目录，不用手写一堆路径
    params: {
      // 三处都在官方 app 段的 `styles` 下：官方对 shared 段的要求是"**按用途命名**"，
      // 而 `shared/ui/styles` 会让 `ui`（UI kit）这个段同时装设计令牌 —— 而且它作为 `shared/ui`
      // 的子目录还得有一个只为占位的 `index.ts`（公开面）。规范里 shared 没有"样式"这个段名。
      styleDir: `${src}/app/styles`,
      tokenDir: `${src}/app/styles/tokens`,
      vendorDir: `${src}/app/styles/vendor`,
      paletteFile: `${src}/app/styles/tokens/palette.css`,
      themeFile: `${src}/app/styles/tokens/theme.css`,
      storageFile: `${src}/shared/config/storage.ts`,
      i18nDir: `${src}/shared/i18n/locales`,
    },
    // FSD 的结构规矩，全部由**通用规则**判（引擎里没有一行 FSD 字面量）：
    //   order            → S21 层序单向（app 6 > pages 5 > widgets 4 > features 3 > entities 2 > shared 1）
    //   isolate          → S22 同层切片不许互相引用
    //   publicApi        → S23①② 切片必须有 index.ts，且不许绕过它直引内部
    //   publicApiUnits   → S23③ shared 的**每个**片段都要有公开面（ui / lib 改为要求一级子目录各有 index）
    //   segmentedGroups  → S35 切片不能只有 index.ts 这个空壳
    //   reservedNames    → S25 片段内部不许再嵌套 ui / lib 这种片段名目录
    //   groupCountLimits → S26 同一层超过 20 个切片就该分组了（社区默认值）
    //   directoryItemLimits → S27 `shared/lib` 一级子项超过 15 就该分组了
    //   groupInDegree    → S28 死切片：零引用必报；只被 app 引用放过；pages 层整层跳过
    //   nameCollisions   → S29 切片名 / 组路径段撞上 shared 的片段名
    //   repetitiveNaming → S30 同一层每个组名都带同一个词
    //   pluralConsistency→ S31 `entities` 层单复数混用
    enable: [
      ...((base.enable as string[] | 'all') === 'all' ? [] : (base.enable as string[])),
      'S15',
    ],
    structure: {
      order: true,
      isolate: ['slice'],
      publicApi: ['slice'],
      publicApiUnits: sharedSegmentRoles.map((role) => ({
        role,
        ...(CHILD_INDEX_SEGMENTS.has(role.slice(role.lastIndexOf(':') + 1))
          ? { children: true }
          : {}),
      })),
      segmentedGroups: ['slice'],
      // `@x` 是 FSD 留给"跨引用公开面"的保留名，和常规片段名一样不许随便当目录名
      reservedNames: [...new Set([...CONVENTIONAL_SEGMENTS, '@x'])],
      groupCountLimits: [{ dimension: 'slice', max: 20 }],
      directoryItemLimits: [{ role: 'fsd:shared:lib', max: 15 }],
      groupInDegree: [
        {
          dimension: 'slice',
          min: 1,
          exceptLayers: [layers.pages],
          singleFromLayers: [layers.app],
        },
      ],
      nameCollisions: [{ dimension: 'slice', vocabularyRoles: sharedSegmentRoles }],
      repetitiveNaming: ['slice'],
      pluralConsistency: [{ dimension: 'slice', layers: [layers.entities] }],
    },
  }
}
