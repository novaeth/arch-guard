/**
 * **FSD 版的"完整配置"样板**（与 `examples/full` 对称：那边是 `canonical()` 三根拓扑）。
 *
 * 差别全在**落点**上，规则一条不用改：
 * - 层级与切片：`fsd()` 自带六层角色表 + `structure`（层序 / 切片隔离 / 公开面 / 片段封闭枚举 /
 *   组维度 slice 的阈值…），这里只补它没声明的几条（导入局部性 / 出入度 / 耦合 / 状态与守卫落点…）；
 * - 落点参数：`styleDir=src/app/styles`、`tokenDir=src/app/styles/tokens`、
 *   `i18nDir=src/shared/i18n/locales`、`storageFile=src/shared/config/storage.ts` —— 都由 `fsd()` 声明；
 * - 唯一出处：路径进 `src/shared/routes/paths.ts`、缓存键进 `src/entities/<实体>/model/query.ts`、
 *   事件名进 `src/shared/lib/analytics/events.ts`。
 */
import {
  analytics,
  antdKit,
  callSites,
  callSiteSources,
  copy,
  cssModulesKit,
  dataLayer,
  deps,
  designSystem,
  endpoints,
  errorPolicy,
  permissions,
  envReads,
  fsd,
  hygiene,
  i18n,
  i18nextKit,
  metrics,
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
    fsd(),

    designSystem({
      staticPrefix: '--sh-static-',
      valueWhitelists: [
        { rule: 'D12', allow: ['4px', '8px', '16px'] },
        { rule: 'D13', allow: ['1', '10'] },
        { rule: 'D14', allow: ['150ms'] },
      ],
      numberHomes: [
        // 名字不用写：staleTime / retry / gcTime… 是 react-query 的事实（reactQueryKit 的 numberNames）。
        // 家可以有多处且支持 glob：全局兜底在 shared，各实体自己的时效跟着实体走（R-97 / A3）
        {
          name: '请求策略',
          in: ['src/shared/api/queryClient.ts', 'src/entities/*/model/query.ts'],
        },
        // 项目自己的常量仍然要列
        {
          // 分页大小跟实体走（R-117）
          name: '分页阈值',
          names: ['CREW_PAGE_SIZE', 'ORDER_PAGE_SIZE'],
          in: ['src/entities/*/model/query.ts'],
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
        'react-router',
        'react-router-dom',
        '@ant-design/icons',
      ],
      capabilities: { datetime: 'dayjs' },
      unusedDeps: true,
    }),
    hygiene(),
    metrics({
      // 同 `examples/full`：故意不声明 coverage —— M06 要一份比最近一次提交还新的产物，入库的必然过期。
      tests: {
        // 只点名"必须有测试"的那两块：`shell` store 依赖 react（本示例不装依赖，node --test 跑不起来），
        // 真实项目里当然该给它配测试 —— 这里把要求收窄到能跑得动的地方。
        requireTestsFor: [
          'src/shared/lib/storage.ts',
          'src/shared/lib/analytics/events.ts',
          // A14：实体里的纯函数也要有行为测试
          'src/entities/*/model/mapper.ts',
          // R-122 的建议产物：feature 里的纯逻辑也要有行为测试
          'src/features/*/model/**',
        ],
        testGlobs: ['src/**/*.test.ts'],
        checkChain: { script: 'check', require: ['test', 'coverage'] },
      },
      depsBudget: { runtime: 10 },
    }),

    uiKit(antdKit()),
    i18n(i18nextKit({ languages: ['zh-CN', 'en'] })),
    router(reactRouterKit({ pathSource: 'src/shared/routes/paths.ts' })),
    dataLayer(
      reactQueryKit({
        // 键跟着实体走（R-97）：一行 glob 覆盖所有实体
        queryKeyFrom: ['src/entities/*/model/query.ts'],
        // fetchApis 不用写：reactQueryKit 自带全套钩子（R-92 后不再因"这次没用到"被点名）
        // 取数归实体（A1）：页面不再自己打后端
        fetchIn: ['src/entities/*/api/**', 'src/shared/api/**'],
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
    // 失败处理策略的落点（R-111）：名字由 `reactQueryKit()` 的 `policyProps` 给
    errorPolicy({ policyIn: ['src/shared/api/policy.ts', 'src/entities/*/model/query.ts'] }),
    analytics({
      // 受体是「接收事件名的调用」：页面用的 useTrackView + 内部真正上报的 sendEvent
      apis: ['useTrackView', 'sendEvent'],
      eventSource: 'src/shared/lib/analytics/events.ts',
    }),
    // 读取根（import.meta.env / process.env）是平台表给的，项目只说"只许在哪读"
    envReads({ in: ['src/shared/config/**'] }),
    // 组名 + 家在哪就够了；`from` 用常量（编辑器补全 / 拼错立刻可见 / 可重构）
    callSites([
      { name: '本地存储', from: callSiteSources.platform.storage, in: ['src/shared/lib/storage.ts'] },
      { name: '埋点上报', from: callSiteSources.analytics.gtag, in: ['src/shared/lib/analytics/**'] },
      // 裸网络调用只许在传输层：各域的取数经它（R-119）
      { name: '裸网络调用', from: callSiteSources.platform.network, in: ['src/shared/api/client.ts'] },
      { name: '全局单例', from: callSiteSources.dataLayer.singletons, in: ['src/shared/api/queryClient.ts'] },
    ]),
  ],

  overrides: {
    // R-121 演练：这条建议确实不适用 —— 该文件依赖 dayjs，示例没装依赖，测不了
    adviceAllow: [
      {
        signal: 'untested-logic-group',
        glob: 'slice crews',
        reason: 'pages/crews/lib/format.ts 依赖 dayjs；示例不装依赖，行为测试留给真实项目',
      },
    ],
    // 这份样板用注释讲每条声明对应的 R 编号 —— 显式不采用「零注释」（H14 默认开启，R-173）。
    disable: ['H14'],
    include: ['src/**'],
    // `fsd()` 已经把切片维度那套声明给全了；这里只补它没声明的
    structure: {
      importLocality: ['slice'],
      degreeLimits: [{ role: 'fsd:shared:lib', maxIn: 30 }],
      couplingLimits: [{ dimension: 'slice', maxFanIn: 6, maxFanOut: 6 }],
      clientState: [{ naming: 'use*Store', in: ['src/shared/lib/shell/**'] }],
      authRedirects: { loginPaths: ['/login'], in: ['src/app/router/guards/**'] },
      maxRelativeUp: { max: 2 },
      generated: ['src/shared/api/generated/**'],
    },

    // 项目自己的 shared 槽位（R-110 的落点）：`fsd()` 的片段是封闭枚举，加槽位就在这里加一条。
    // 注意 `addRoles` 在 **overrides 层**（与 `structure` 平级）—— 放进 `structure` 会静默不生效。
    addRoles: [{ id: 'shared:auth', pattern: 'src/shared/auth/**', layer: 1, slot: 'auth' }],
  },
}
