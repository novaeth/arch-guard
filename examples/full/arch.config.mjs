/**
 * **完整形态的宿主配置**（范式 + 4 个域 + 12 个生效适配器 + 结构声明）。
 *
 * 每个声明指向的文件都真的存在 —— 所以 `skipped` 里不该有东西：
 * 报告末尾那句"因能力未声明而停用 N 条规则"应该消失，声明写错也会被 `declaration-no-match` 点名。
 * 与 `examples/minimal` 的区别：minimal 只证明"能跑"，这份演示"配全之后长什么样"。
 */
import {
  analytics,
  antdKit,
  callSites,
  callSiteSources,
  canonical,
  copy,
  cssModulesKit,
  dataLayer,
  deps,
  designSystem,
  endpoints,
  errorPolicy,
  permissions,
  envReads,
  hygiene,
  metrics,
  i18n,
  i18nextKit,
  reactQueryKit,
  reactRouterKit,
  router,
  styles,
  uiKit,
} from '../../es/index.js'

export default {
  specVersion: '2',
  sourceForm: 'react',

  presets: [
    // ① 范式：三根拓扑 + 27 个角色 + 落点参数（styleDir / tokenDir / paletteFile / i18nDir… 都由它给）
    canonical({ lazyViews: true }),

    // ② 四个域
    designSystem({
      staticPrefix: '--sh-static-',
      storageFile: 'src/shared/lib/storage.ts',
      valueWhitelists: [
        { rule: 'D12', allow: ['4px', '8px', '16px'] },
        { rule: 'D13', allow: ['1', '10'] },
        { rule: 'D14', allow: ['150ms'] },
      ],
      numberHomes: [
        // 名字不用写：staleTime / retry / gcTime… 是 react-query 的事实（reactQueryKit 的 numberNames）。
        // 家可以有多处，且支持 glob：全局兜底在 shared，各域自己的时效跟着域走（R-97 / A3）
        {
          name: '请求策略',
          in: ['src/shared/api/queryClient.ts', 'src/modules/*/model/query.ts'],
        },
        // 项目自己的常量仍然要列
        // 分页大小跟域走（R-117）：阈值数字的家就是各域自己的查询契约
        {
          name: '分页阈值',
          names: ['CREW_PAGE_SIZE', 'ORDER_PAGE_SIZE', 'CUSTOMER_PAGE_SIZE', 'INVOICE_PAGE_SIZE'],
          in: ['src/modules/*/model/query.ts'],
        },
      ],
      contrastPairs: [
        { fg: '--text-primary', bg: '--surface', usage: '正文', min: 4.5 },
        // 真正容易翻车的那一对：品牌底上的文字（白字橙底只有 3.1:1，是审查里量出来的事故）
        { fg: '--on-brand', bg: '--brand', usage: '品牌底上的文字', min: 4.5 },
      ],
    }),
    // 文案位名单由 `uiKit(antdKit())` 给（antd 的事实），项目自己的封装才需要在这里写：
    // `copy({ messageApis: ['appToast.success'] })` —— 写了就以项目为准，`[]` = 关掉那一半。
    copy(),
    deps({
      allow: [
        '@tanstack/react-query',
        'antd',
        'dayjs',
        'i18next',
        'react',
        'react-dom',
        'react-i18next',
        'react-router-dom',
      ],
      capabilities: { datetime: 'dayjs' },
      unusedDeps: true,
    }),
    hygiene(),
    metrics({
      // **故意不声明 `coverage`**：M02–M06 要一份「比最近一次提交还新」的覆盖率产物（M06 fail-closed），
      // 而入库的产物必然比它的提交旧 —— 本仓自己的 arch.config.mjs 也是因此不声明 coverage。
      // 真实项目里它由 `pnpm coverage` 生成，配法见 docs/USAGE.md §2.2。
      tests: {
        // 只点名测试真的覆盖到的：`analytics/index.ts` 是 React hook（useTrackView），
        // 示例不装依赖，`node --test` 引它会直接挂 —— 所以这里收窄到纯值文件
        requireTestsFor: [
          'src/shared/lib/storage.ts',
          'src/shared/lib/analytics/events.ts',
          // A14：域内的纯函数也要有行为测试（mapper 是最好测的那种）
          'src/modules/*/lib/mapper.ts',
        ],
        testGlobs: ['src/**/*.test.ts'],
        // 测试**分层**的落点（R-112）：e2e 只许经公开面；契约层必须真的引用生成物
        homes: [
          { name: 'e2e', glob: 'e2e/**/*.spec.ts', imports: 'public' },
          { name: 'contract', glob: 'tests/contract/**', mustImport: ['src/shared/api/generated/**'] },
        ],
        checkChain: { script: 'check', require: ['test', 'coverage'] },
      },
      depsBudget: { runtime: 10 },
    }),

    // ③ 八个方案面
    uiKit(antdKit()),
    i18n(i18nextKit({ languages: ['zh-CN', 'en'] })),
    router(reactRouterKit({ pathSource: 'src/shared/config/paths.ts' })),
    dataLayer(
      reactQueryKit({
        // 键跟着域走（R-97）：一行 glob 覆盖所有域，不再集中在一个 shared 文件里
        queryKeyFrom: ['src/modules/*/model/query.ts'],
        // fetchApis 不用写：reactQueryKit 自带全套钩子（R-92 后不再因"这次没用到"被点名）
        fetchIn: ['src/modules/*/hooks/**', 'src/shared/api/**'],
      }),
    ),
    styles(cssModulesKit()),
    // 端点唯一出处（R-99）：`fetch` 的实参里不许出现路径字面量
    // `apis` 用来源表（平台事实），不手写：平台表里加一项，这里自动跟上。
    // **库**的调用不进平台表（那是分工）—— 用 axios 的项目写 `http(axiosKit())` +
    // `from: callSiteSources.http.apis`，由库自己的适配器提供清单（R-138）
    endpoints({ from: callSiteSources.platform.network, source: 'src/shared/api/endpoints.ts' }),
    // 权限点唯一出处（R-110）：`can('字面量')` 即报
    permissions({ apis: ['can'], source: 'src/shared/auth/permissions.ts' }),
    // 失败处理策略的落点（R-111）：函数型 / 枚举型策略只许出现在这里
    // 策略**名字**由 `reactQueryKit()` 的 `policyProps` 给 —— 库的事实不用抄
    errorPolicy({
      policyIn: ['src/shared/api/policy.ts', 'src/modules/*/model/query.ts'],
    }),
    analytics({
      // 受体是「接收事件名的调用」：页面用的 useTrackView + 内部真正上报的 sendEvent
      apis: ['useTrackView', 'sendEvent'],
      eventSource: 'src/shared/lib/analytics/events.ts',
    }),
    // 读取根（import.meta.env / process.env）是平台表给的，项目只说"只许在哪读"
    envReads({ in: ['src/shared/config/**'] }),
    // 组名 + 家在哪就够了：localStorage 是平台的事实、gtag 是 analytics 面已声明的、QueryClient 是 kit 的
    callSites([      {
        // 租户上下文的唯一解析处（R-110）：`args` 把 searchParams.get 这类泛 API 收窄
        name: '租户上下文',
        // 只列真的在用的：声明了却 0 命中会被自述点名（`cookies.get` 一写就红）
        apis: ['searchParams.get'],
        // 只列真的在用的（自述会点名没命中的项 —— R-114）
        args: ['tenantId'],
        in: ['src/shared/tenant/**'],
      },

      { name: '本地存储', from: callSiteSources.platform.storage, in: ['src/shared/lib/storage.ts'] },
      { name: '埋点上报', from: callSiteSources.analytics.gtag, in: ['src/shared/lib/analytics/**'] },
      // 裸网络调用只许在传输层：各域的取数经它（R-119）
      { name: '裸网络调用', from: callSiteSources.platform.network, in: ['src/shared/api/client.ts'] },
      { name: '全局单例', from: callSiteSources.dataLayer.singletons, in: ['src/shared/api/queryClient.ts'] },
    ]),
  ],

  overrides: {
    // 这份样板用注释讲每条声明对应的 R 编号 —— 显式不采用「零注释」。
    // H14 默认开启（R-173）：想采用的项目删掉这一行即可，finding 会指出从哪条注释开始删。
    disable: ['H14'],
    // 测试层也要进契约扫描域：否则 `e2e/**` / `tests/**` 不在文件集里，M10 会把落点当成空的
    include: ['src/**', 'e2e/**', 'tests/**'],
    ignore: ['dist/**', 'coverage/**'],

    // ④ 结构声明（只写这个项目真有、且真的能命中的形态）
    structure: {
      order: true,
      // 域间协作**留一条合法通道**（R-98）：不声明 `isolate`（那会禁掉一切同层互引），
      // 用 `publicApi` —— 跨域只许经对方的公开面（`routes.tsx` 或业务 `index.ts`），直捣内部照报。
      publicApi: ['domain'],
      segmentedGroups: ['domain'],
      // 保留名管的是**片段内嵌套**的目录（S25）：`views/common/`、`shared/lib/utils/` 这类"杂物间"。
      // 注意 `shared/components/common` 本身是角色表**声明的槽位**（组合件），不在这一条的约束范围。
      reservedNames: ['ui', 'utils', 'common'],
      groupCountLimits: [{ dimension: 'domain', max: 20 }],
      directoryItemLimits: [{ role: 'module:components', max: 15 }],
      nameCollisions: [{ dimension: 'domain', vocabularyRoles: ['module:components'] }],
      repetitiveNaming: ['domain'],
      pluralConsistency: [{ dimension: 'domain', neutralWords: ['billing'] }],
      degreeLimits: [{ role: 'shared:lib', maxIn: 30 }],
      couplingLimits: [{ dimension: 'domain', maxFanIn: 6, maxFanOut: 6 }],
      importLocality: ['domain'],
      clientState: [{ naming: 'use*Store', in: ['src/shared/stores/**'] }],
      authRedirects: { loginPaths: ['/login'], in: ['src/app/router/guards/**'] },
      maxRelativeUp: { max: 2 },
      generated: ['src/shared/api/generated/**'],
    },

    // ⑤ 项目自己的目录 / dev-only 形态（`addRoles` 是**追加**，不是替换）
    // 应用入口：M10 判"e2e 只许经公开面"时要认得它（`app:bootstrap` 只是 slot，没标 entry）
    entries: ['src/app/main.tsx', 'src/app/router/index.tsx'],
    addRoles: [
      { id: 'test', pattern: '**/*.stories.{ts,tsx}', layer: 99, exclusive: true },
      // 测试**分层**的落点（R-112）：e2e 与契约各自一层，layer 99 = 测试层
      { id: 'e2e', pattern: 'e2e/**', layer: 99, slot: 'e2e' },
      { id: 'contract', pattern: 'tests/contract/**', layer: 99, slot: 'contract' },
      // 项目自己的 shared 槽位（R-110 的两个落点）：范式给的是七个固定槽，
      // 项目要加槽位就在这里加一条 —— 与"骨架自带多少"无关，声明了才算数
      { id: 'shared:auth', pattern: 'src/shared/auth/**', layer: 1, slot: 'auth' },
      { id: 'shared:tenant', pattern: 'src/shared/tenant/**', layer: 1, slot: 'tenant' },
    ],

    exceptions: [],
  },
}
