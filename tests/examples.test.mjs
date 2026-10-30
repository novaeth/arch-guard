import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { builtinSourceForms, coreRules, createRegistry, runGuard } from '../es/index.js'
import { APP_ONLY } from './paradigm-app-only.mjs'

/**
 * **示例是"活样板"，也是"规则还有效"的回归**。
 *
 * 夹具（`__fixtures__`）证明的是"规则写对了"：违规必报 × 合规不报，形态是**静态**的。
 * 它管不了另一件事：**规则在真实改动里会不会悄悄失效**（判据漂移、事实模型改了字段没人读、
 * 声明换了名却没人发现）。所以这一组测试拿 `examples/full` 当靶子：
 *
 * 1. **基线**：它现在是 98/98 在跑、0 finding、没有"声明 0 命中"自述 —— 样板得先是干净的；
 * 2. **预算**：`examples/minimal` 的"停用条数"不许变多（少配一个面 = 悄悄少一层覆盖）；
 * 3. **变异**：把示例逐个改坏（写死路径 / 内联颜色 / 跨域直引 / 声明写错…），**该抓的必须抓到**；
 *    反过来，已经判"不做"的那几类（N-08 裸随机 / N-09 a11y / N-12 TS 里的颜色）必须**不抓** ——
 *    边界也要有回归，否则哪天误报回来没人知道。
 *
 * 变异跑在**临时副本**里（`examples/mut-*`），跑完即删：既不污染仓库，也不需要 git。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXAMPLE = join(ROOT, 'examples', 'full')
const MINIMAL = join(ROOT, 'examples', 'minimal')
const FSD_EXAMPLE = join(ROOT, 'examples', 'full-fsd')

const copies = []
after(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true })
})

/** 复制一份示例（跳过缓存：每份都从零解析，结果与缓存无关） */
const clone = (example = 'full') => {
  const dir = mkdtempSync(join(ROOT, 'examples', 'mut-'))
  cpSync(join(ROOT, 'examples', example), dir, {
    recursive: true,
    filter: (src) => !src.includes('.arch-guard-cache'),
  })
  copies.push(dir)
  return dir
}

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8')
const write = (dir, rel, text) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const patch = (dir, rel, from, to) => {
  const text = read(dir, rel)
  assert.ok(text.includes(from), `${rel} 里找不到锚点：${from.slice(0, 40)}`)
  write(dir, rel, text.replace(from, to))
}
const config = (dir, from, to) => patch(dir, 'arch.config.mjs', from, to)
const append = (dir, rel, text) => write(dir, rel, `${read(dir, rel)}${text}`)

/**
 * 示例**故意不声明** `metrics.coverage`：M02–M06 要一份「比最近一次提交还新」的覆盖率产物（M06 fail-closed），
 * 而入库的产物必然比它的提交旧 —— 本仓自己的 `arch.config.mjs` 也是因此不声明 coverage。
 * 所以样板"配全"的标准是：**除了这 5 条，其余全在跑**。
 */
const COVERAGE_SKIPPED = ['M02', 'M03', 'M04', 'M05', 'M06']

const run = (dir) =>
  runGuard({
    cwd: dir,
    configPath: 'arch.config.mjs',
    sourceForms: builtinSourceForms,
    cache: false,
    quiet: true,
  })
const rulesOf = (result) => new Set(result.all.map((item) => item.rule))
/** 本次"没跑"的规则 id，按原因筛（R-142 起 `skipped` 里不止"能力未声明"一种） */
const skipCodesOf = (result, code) =>
  createRegistry(coreRules, result.config)
    .skipped.filter((item) => item.code === code)
    .map((item) => item.rule)
    .sort()
const skippedOf = (result) => skipCodesOf(result, 'capability-missing')

test('示例基线：examples/full 除覆盖率 5 条外全在跑、0 finding、没有"声明 0 命中"自述', async () => {
  const result = await run(EXAMPLE)
  assert.deepEqual(
    result.all.map((item) => `${item.rule} ${item.file}`),
    [],
    '样板本身必须是干净的（它是"配全长什么样"的答案）',
  )
  assert.equal(
    result.notices.some((notice) => notice.code === 'declaration-no-match'),
    false,
    '样板里不该有"声明配了却 0 命中"',
  )
  assert.deepEqual(
    skippedOf(result),
    COVERAGE_SKIPPED,
    '样板里只该剩覆盖率那 5 条（它们要一份比 HEAD 新的产物）—— 其余停用都是"还没配"',
  )
  assert.equal(
    createRegistry(coreRules, result.config).enabled.length,
    coreRules.length - COVERAGE_SKIPPED.length,
  )
})

test('示例预算：minimal 的停用条数不许增加，full 只许剩覆盖率那 5 条', async () => {
  const minimal = await run(MINIMAL)
  const skipped = skippedOf(minimal)
  assert.deepEqual(minimal.all, [], 'minimal 也该是干净的（它是"最短可用"的答案）')
  assert.ok(
    skipped.length <= 36,
    `minimal 的停用从 36 涨到了 ${skipped.length}：${skipped.join(' ')} —— 少配一个面就少一层覆盖`,
  )

  const full = await run(EXAMPLE)
  assert.deepEqual(skippedOf(full), COVERAGE_SKIPPED)
  assert.ok(
    createRegistry(coreRules, full.config).enabled.length >
      createRegistry(coreRules, minimal.config).enabled.length,
    'full 必须比 minimal 覆盖更多规则（否则"配全"没有意义）',
  )
})

/**
 * 变异表。`expect` = 必须被抓到的规则；`forbid` = 必须**不**被抓到的规则（已判不做的边界）；
 * `expectNotice` = 要求出现某条自述（声明写错要靠它）。
 */
const MUTATIONS = [
  {
    name: '路由路径写死在调用点',
    expect: ['D23'],
    apply: (dir) =>
      patch(dir, 'src/modules/crews/routes.tsx', 'path: PATHS.crews', "path: '/crews'"),
  },
  {
    name: '内联 style 写死颜色',
    expect: ['D15'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        '<section>',
        "<section style={{ color: '#ff5a1f' }}>",
      ),
  },
  {
    name: 'CSS 里超刻度数值',
    expect: ['D12'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/components/CrewsTable.module.css',
        'margin: 16px 0',
        'margin: 13px 0',
      ),
  },
  {
    name: '组件样式里的 !important',
    expect: ['D09'],
    apply: (dir) =>
      patch(
        dir,
        'src/shared/components/ui/AppButton.module.css',
        'border-radius: 8px;',
        'border-radius: 8px;\n  color: red !important;',
      ),
  },
  {
    name: '组件样式里的颜色字面量',
    expect: ['D01'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/components/CrewsTable.module.css',
        'border-collapse: collapse;',
        'border-collapse: collapse;\n  background: #ff5a1f;',
      ),
  },
  {
    name: 'JSX 里写死文案',
    expect: ['C01'],
    apply: (dir) =>
      patch(dir, 'src/modules/crews/views/CrewsPage.tsx', "{t('crews.title')}", '班组'),
  },
  {
    // A5 之后页面用的是 useTrackView（受体是"接收事件名的调用"），所以字面量变异打在它身上
    name: '事件名直接写字面量',
    expect: ['D24'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        'useTrackView(ANALYTICS_EVENTS.crewsView)',
        "useTrackView('crews_view')",
      ),
  },
  {
    name: '页面里直接调 localStorage',
    expect: ['S38'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        'useTrackView(ANALYTICS_EVENTS.crewsView)',
        "useTrackView(ANALYTICS_EVENTS.crewsView)\n  localStorage.getItem('app.token')",
      ),
  },
  {
    name: '组件里读 import.meta.env',
    expect: ['S44'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        'useTrackView(ANALYTICS_EVENTS.crewsView)',
        'useTrackView(ANALYTICS_EVENTS.crewsView)\n  void import.meta.env.VITE_API_BASE_URL',
      ),
  },
  {
    name: '源码里写死 localhost',
    expect: ['H08'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/lib/format.ts',
        'export function formatCrewName',
        "export const devHost = 'http://localhost:3000'\n\nexport function formatCrewName",
      ),
  },
  {
    name: '生成物丢掉 @generated',
    expect: ['H13'],
    apply: (dir) => patch(dir, 'src/shared/api/generated/crews.gen.ts', '// @generated', '//'),
  },
  {
    name: '跨域直引别人内部文件',
    expect: ['S05'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/orders/views/OrdersPage.tsx',
        "import { useOrders } from '../hooks/useOrders'",
        "import { useOrders } from '../hooks/useOrders'\nimport { CrewsTable } from '@/modules/crews/components/CrewsTable'",
      ),
  },
  {
    name: '新增没人引用的孤儿文件',
    expect: ['S15'],
    apply: (dir) => write(dir, 'src/shared/lib/orphan.ts', 'export const orphan = 1\n'),
  },
  {
    name: 'import 未声明的依赖',
    expect: ['P03'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/hooks/useCrews.ts',
        'import { useQuery }',
        "import axios from 'axios'\nimport { useQuery }",
      ),
  },
  {
    name: '声明了首选方案却手搓（本地实现在不用登记方案的文件里）',
    expect: ['P06'],
    apply: (dir) =>
      append(
        dir,
        'src/shared/api/client.ts',
        "\nexport const stamp = (date: Date): string => new Intl.DateTimeFormat('zh-CN').format(date)\n",
      ),
  },
  {
    name: '页面里直接取数',
    expect: ['S36'],
    apply: (dir) =>
      append(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        "\nexport const inlineFetch = (): void => {\n  useQuery({ queryKey: ['x'], queryFn: async () => [] })\n}\n",
      ),
  },
  {
    name: '页面被静态 import（不再 lazy）',
    expect: ['S37'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/routes.tsx',
        "import { lazy } from 'react'",
        "import CrewsPage from './views/CrewsPage'",
      ),
  },
  {
    name: '状态单元跑到 shared/lib 里',
    expect: ['S41'],
    apply: (dir) =>
      append(
        dir,
        'src/shared/lib/storage.ts',
        '\nexport function useDraftStore(): string {\n  return STORAGE_KEYS.theme\n}\n',
      ),
  },
  {
    name: '相对路径爬太深',
    expect: ['S43'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/components/CrewsTable.tsx',
        "import { AppTag } from '@/shared/components/ui/AppTag'",
        "import { AppTag } from '../../../../shared/components/ui/AppTag'",
      ),
  },
  {
    name: 'barrel（export *）',
    expect: ['S11'],
    apply: (dir) => append(dir, 'src/shared/lib/analytics/index.ts', "export * from './events'\n"),
  },
  {
    name: '页面不再 default 导出',
    expect: ['S13'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        'export default function CrewsPage',
        'export function CrewsPage',
      ),
  },
  {
    name: '某语言少一个键（两份目录不同构）',
    expect: ['C03'],
    apply: (dir) => patch(dir, 'src/shared/i18n/locales/en/common.ts', "  retry: 'Retry',\n", ''),
  },
  {
    name: '代码里用了资源里没有的键',
    expect: ['C02'],
    apply: (dir) =>
      patch(dir, 'src/app/layouts/AppLayout.tsx', "t('common.retry')", "t('common.retryX')"),
  },
  {
    name: '资源里多一个没人用的死键',
    expect: ['C06'],
    apply: (dir) =>
      patch(
        dir,
        'src/shared/i18n/locales/zh-CN/common.ts',
        'export default {',
        "export default {\n  unusedKey: '没人用',",
      ),
  },
  {
    name: '策略数字写到调用点（不在声明的家）',
    expect: ['D20'],
    apply: (dir) =>
      append(
        dir,
        'src/modules/crews/hooks/useCrews.ts',
        '\nexport const inlinePolicy = { staleTime: 999_999 }\n',
      ),
  },
  {
    name: '缓存键在调用点手拼',
    expect: ['D22'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/hooks/useCrews.ts',
        'queryKey: crewKeys.list,',
        "queryKey: ['crews'],",
      ),
  },
  {
    name: '依赖白名单外的依赖',
    expect: ['P01'],
    apply: (dir) =>
      patch(
        dir,
        'package.json',
        '"dependencies": {',
        '"dependencies": {\n    "lodash": "^4.17.21",',
      ),
  },
  {
    // 声明写错（多打一个字母）不会被任何规则报 —— 但必须被"0 命中自述"点名
    name: '声明写错：落点名没人命中',
    expectNotice: 'declaration-no-match',
    apply: (dir) => patch(dir, 'arch.config.mjs', "'CREW_PAGE_SIZE'", "'CREW_PAGE_SIZE_X'"),
  },
  {
    // R-90 现场：numberHomes 只写"家在哪"，名字由 reactQueryKit 的 numberNames 给 —— 数字跑到家外要抓
    name: 'R-90：策略数字（名字来自 kit）跑到了家外',
    expect: ['D20'],
    apply: (dir) =>
      append(
        dir,
        'src/modules/crews/hooks/useCrews.ts',
        '\nexport const adHocPolicy = { staleTime: 999_999 }\n',
      ),
  },
  {
    // R-91 现场：callSites 只写"家在哪"，API 名来自 kit 的 singletons —— 别处再 new 一个要抓
    name: 'R-91：单例（名字来自 kit）在别处又 new 了一个',
    expect: ['S38'],
    apply: (dir) =>
      append(
        dir,
        'src/modules/crews/lib/format.ts',
        "\nimport { QueryClient } from '@tanstack/react-query'\n\nexport const secondClient = new QueryClient()\n",
      ),
  },
  {
    name: '组数量超上限（把预算调小）',
    expect: ['S26'],
    apply: (dir) => config(dir, 'max: 20', 'max: 1'),
  },
  {
    name: '每个组名都带同一个词（xxx-module）',
    expect: ['S30'],
    apply: (dir) => {
      for (const name of ['crews', 'orders', 'customers', 'billing']) {
        renameSync(join(dir, 'src/modules', name), join(dir, 'src/modules', `${name}-module`))
        patch(
          dir,
          'src/app/router/index.tsx',
          `@/modules/${name}/routes`,
          `@/modules/${name}-module/routes`,
        )
      }
    },
  },
  {
    name: '同层单复数混用（orders + order）',
    expect: ['S31'],
    apply: (dir) => {
      mkdirSync(join(dir, 'src/modules/order'), { recursive: true })
      write(dir, 'src/modules/order/routes.tsx', 'export const orderSingularRoutes = []\n')
    },
  },
  {
    name: '文件入度超上限（把预算调小）',
    expect: ['S34'],
    apply: (dir) => config(dir, 'maxIn: 30', 'maxIn: 1'),
  },
  {
    name: '组耦合超上限（预算调小 + 域间真的互引）',
    expect: ['S39'],
    apply: (dir) => {
      // 示例声明了 `publicApi`（跨域只许经公开面，R-98）而不是 `isolate` —— 所以域间互引本身是合法的，
      // 耦合才真的算得出来；把上限调小即可触发。若声明 `isolate`，耦合永远是 0（互引直接被 S22 拦掉）。
      config(dir, 'maxFanIn: 6, maxFanOut: 6', 'maxFanIn: 1, maxFanOut: 1')
      for (const [file, name] of [
        ['src/modules/orders/routes.tsx', 'ordersCoupling'],
        ['src/modules/customers/routes.tsx', 'customersCoupling'],
      ]) {
        patch(
          dir,
          file,
          "import { PATHS } from '@/shared/config/paths'",
          "import { PATHS } from '@/shared/config/paths'\nimport { crewRoutes } from '@/modules/crews/routes'",
        )
        append(dir, file, `\nexport const ${name} = crewRoutes\n`)
      }
    },
  },
  {
    name: '（边界 N-12）TS 里的颜色字面量不判',
    forbid: ['D01', 'D03', 'D15'],
    apply: (dir) =>
      write(dir, 'src/shared/lib/brand.ts', "export const palette = { brand: '#ff5a1f' }\n"),
  },
  {
    name: '（边界 N-09）JSX 可访问性形态不判',
    forbid: [],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        '<section>',
        '<section>\n      <div onClick={() => undefined}>x</div>',
      ),
  },
  {
    name: '（边界 N-08）裸 Math.random 不判',
    forbid: [],
    apply: (dir) =>
      append(dir, 'src/modules/crews/lib/format.ts', '\nexport const jitter = Math.random()\n'),
  },
  {
    name: '（边界）别名全局变量认不出来',
    forbid: ['S38'],
    apply: (dir) =>
      patch(
        dir,
        'src/modules/crews/views/CrewsPage.tsx',
        'useTrackView(ANALYTICS_EVENTS.crewsView)',
        'useTrackView(ANALYTICS_EVENTS.crewsView)\n  const ls = localStorage\n  ls.getItem("app.token")',
      ),
  },
]

test('变异：示例被改坏时必须抓到（这就是"规则还有效"的回归）', async () => {
  const failures = []
  for (const mutation of MUTATIONS) {
    const dir = clone()
    mutation.apply(dir)
    const result = await run(dir)
    const rules = rulesOf(result)

    for (const rule of mutation.expect ?? []) {
      if (!rules.has(rule)) {
        failures.push(
          `${mutation.name}：该抓 ${rule} 没抓到（实际 ${[...rules].sort().join(',') || '无 finding'}）`,
        )
      }
    }
    for (const rule of mutation.forbid ?? []) {
      if (rules.has(rule))
        failures.push(`${mutation.name}：${rule} 不该抓却抓了（已判"不做"的边界）`)
    }
    if (mutation.expectNotice) {
      const hit = result.notices.some((notice) => notice.code === mutation.expectNotice)
      if (!hit) failures.push(`${mutation.name}：没出现 ${mutation.expectNotice} 自述`)
    }
    // 边界项：`forbid: []` 且没有 expect ⇒ 期望"什么都不报"（纯语法形态不该引红线）
    if (mutation.expect === undefined && mutation.forbid?.length === 0 && result.all.length > 0) {
      failures.push(`${mutation.name}：期望一条都不报，实际 ${[...rules].sort().join(',')}`)
    }
  }
  assert.ok(MUTATIONS.length >= 30, `变异太少（${MUTATIONS.length}）—— 覆盖会名不副实`)
  assert.deepEqual(failures, [])
})

/**
 * **FSD 版样板（R-87 的现场）**：`fsd()` 复用 `library()` 的启用清单，那份清单曾经少了 9 条
 * 与范式无关的规则 —— 它们在 FSD 下**既不跑、也不在停用清单里**。
 * 现在注册集与 canonical 只差"应用专属"那 8 条（见 tests/paradigm-coverage）。
 */
test('示例基线（FSD）：除明列停用外全在跑、0 finding、没有"声明 0 命中"自述', async () => {
  const result = await run(FSD_EXAMPLE)
  assert.deepEqual(
    result.all.map((item) => `${item.rule} ${item.file}`),
    [],
    'FSD 样板也必须是干净的',
  )
  assert.equal(
    result.notices.some((notice) => notice.code === 'declaration-no-match'),
    false,
  )
  assert.deepEqual(skippedOf(result), ['M02', 'M03', 'M04', 'M05', 'M06', 'S13', 'S37'])
  assert.deepEqual(
    skipCodesOf(result, 'not-enabled'),
    [...APP_ONLY].sort(),
    'FSD 的 9 条应用专属规则必须**明列未启用**（R-142）—— 以前它们跑不跑都没人说',
  )
})

const FSD_MUTATIONS = [
  {
    name: 'FSD：跨切片绕过公开面直引内部文件',
    expect: ['S23'],
    apply: (dir) =>
      patch(
        dir,
        'src/pages/orders/ui/OrdersPage.tsx',
        "import { crewOf, OrderCard, useOrders } from '@/entities/order'",
        "import { crewOf, OrderCard, useOrders } from '@/entities/order'\nimport { CrewsPage } from '@/pages/crews/ui/CrewsPage'",
      ),
  },
  {
    name: 'FSD：低层反向依赖高层（entities → features）',
    expect: ['S21'],
    apply: (dir) =>
      patch(
        dir,
        'src/entities/crew/ui/CrewCard.tsx',
        "import { AppTag } from '@/shared/ui/app-tag'",
        "import { CrewFilter } from '@/features/crew-filter'\nimport { AppTag } from '@/shared/ui/app-tag'",
      ),
  },
  {
    name: 'FSD：声明写错（落点名没人命中）',
    expectNotice: 'declaration-no-match',
    apply: (dir) =>
      config(dir, "names: ['CREW_PAGE_SIZE', 'ORDER_PAGE_SIZE']", "names: ['PAGE_SIZE_X']"),
  },
]

test('变异（FSD）：改坏 FSD 示例时该抓的必须抓到', async () => {
  const failures = []
  for (const mutation of FSD_MUTATIONS) {
    const dir = clone('full-fsd')
    mutation.apply(dir)
    const result = await run(dir)
    const rules = rulesOf(result)
    for (const rule of mutation.expect ?? []) {
      if (!rules.has(rule)) {
        failures.push(
          `${mutation.name}：该抓 ${rule} 没抓到（实际 ${[...rules].sort().join(',') || '无 finding'}）`,
        )
      }
    }
    if (mutation.expectNotice) {
      const hit = result.notices.some((notice) => notice.code === mutation.expectNotice)
      if (!hit) failures.push(`${mutation.name}：没出现 ${mutation.expectNotice} 自述`)
    }
  }
  assert.equal(FSD_MUTATIONS.length, 3)
  assert.deepEqual(failures, [])
})
