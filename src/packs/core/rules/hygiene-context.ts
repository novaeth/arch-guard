import { createRule } from '../../../engine/rule.js'
import { packageNameOf } from '../../../engine/graph.js'
import type { DetachedApi, Finding, Rule } from '../../../engine/types.js'
import { finding } from './finding.js'
import { isTestPath } from '../../../engine/test-paths.js'

/**
 * 反退化域（H）续：上下文纪律、假异步、硬编码地址、假数据、手搓时间格式化。
 * 全部基于单文件事实（calls / strings），判定等级 L2。
 */

/** import 语句里的包名（@scope/x、x/sub 归一化到包） */
/* ---------------- H06 脱离上下文的全局 API ---------------- */

/**
 * H06：适配器登记的成员被**静态**调用即报（`message.success` / `notification.error` / `Modal.confirm`）。
 * 只在文件确实从该库 import 了的时候判 —— 用 `App.useApp()` 取到的实例是上下文内用法，形态上无法靠 callee 区分，
 * 但「没 import 过静态成员」是确定性事实。提示直接给适配器里的 suggest。
 */
export const noDetachedApis: Rule = createRule({
  id: 'H06',
  domain: 'hygiene',
  level: 'L2',
  severity: 'error',
  title: '脱离上下文的全局 API',
  requires: ['uiKit.detachedApis'],
  hint: '改用上下文内用法（组件库适配器的 detachedApis.suggest 给了替代写法），静态方法不继承主题与 locale 上下文',
  run: (ctx) => {
    const adapter = Object.values(ctx.config.adapters).find((item) => item.facet === 'ui-kit') as
      { detachedApis?: DetachedApi[] } | undefined
    const groups = adapter?.detachedApis ?? []
    if (groups.length === 0) return []

    const out: Finding[] = []
    for (const record of ctx.records) {
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      const imported = new Set(facts.imports.map((item) => packageNameOf(item.spec)))

      for (const group of groups) {
        if (!group.from.some((pkg) => imported.has(pkg))) continue
        for (const call of facts.calls) {
          const member = group.members.find(
            (name) => call.callee === name || call.callee.startsWith(`${name}.`),
          )
          if (!member) continue
          out.push(
            finding('H06', record.rel, call, `脱离上下文的全局调用：${call.callee}`, group.suggest),
          )
        }
      }
    }
    return out
  },
})

/* ---------------- H08 硬编码本地地址 ---------------- */

/**
 * 判据：**指向本机 / 内网 IP** 的地址字面量出现在非测试文件里。
 *
 * 为什么只判这一类（原委派给 eslint `no-restricted-syntax`）：那条要项目自己写 esquery 选择器；
 * 而"本地地址进生产"是这一段里**误伤最小**的一类 —— 外部文档链接（`https://docs.…`）不算，
 * 测试文件里的 `http://localhost` 是正常用法（mock 服务）。
 */
const LOCAL_HOST = /\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/i
const PRIVATE_IP =
  /\b(?:10\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3})\.\d{1,3}\b/

export const localHostLiterals: Rule = {
  id: 'H08',
  domain: 'hygiene',
  level: 'L2',
  severity: 'error',
  title: '禁硬编码本地地址',
  hint: '本地 / 内网地址走环境变量或配置；写进源码就会跟着构建进生产',
  run: (ctx) => {
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (record.role === 'test' || isTestPath(record.rel)) continue
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      for (const text of facts.strings) {
        if (!LOCAL_HOST.test(text.value) && !PRIVATE_IP.test(text.value)) continue
        out.push(
          finding(
            'H08',
            record.rel,
            text,
            `硬编码本地地址：${text.value}`,
            '改成环境变量 / 配置项（本地默认值放在 .env 或构建配置里）',
          ),
        )
      }
    }
    return out
  },
}

/* ---------------- H07 假异步 · H09 假数据 ---------------- */

/**
 * H07 **假异步**（warn）：文件里同时出现 `new Promise` 与 `setTimeout` —— 用睡眠冒充异步。
 *
 * 刻意**不判裸 `setTimeout`**：防抖 / 轮询 / 节流是正当用法（`timers.ts` 就是例子），
 * 单看它必然误伤。两条证据同时成立才提示，且只提示（warn）——"疑似"就该是可解释的提示。
 */
export const fakeAsync: Rule = {
  id: 'H07',
  domain: 'hygiene',
  level: 'L2',
  severity: 'warn',
  title: '疑似假异步',
  hint: '用睡眠冒充异步（`await new Promise(r => setTimeout(r, ms))`）：真实等待应该来自数据层，不是定时器',
  run: (ctx) => {
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (record.role === 'test' || isTestPath(record.rel)) continue
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      const promise = facts.calls.find((call) => call.callee === 'Promise')
      const timer = facts.calls.find((call) => call.callee === 'setTimeout')
      if (!promise || !timer) continue
      out.push(
        finding(
          'H07',
          record.rel,
          promise,
          '疑似假异步：这个文件里 `new Promise` 与 `setTimeout` 同时出现（用睡眠冒充异步？）',
          '把等待换成真实的异步来源；确实需要延迟（防抖 / 重试）就只留定时器，别包成 Promise 假装请求',
        ),
      )
    }
    return out
  },
}

/**
 * H09 **假数据**（warn）：`mock` / `fake` / `dummy` / `fixtures` 命名的文件或导出出现在**非测试**代码里。
 *
 * 只按**命名**判，不按内容判：数据长什么样我们看不出来，但"叫 mock 的东西不该出现在生产路径"是确定的。
 */
const FAKE_NAME = /(?:^|[^a-z])(mock|fake|dummy|fixtures?)(?:[^a-z]|$)/i

export const fakeData: Rule = {
  id: 'H09',
  domain: 'hygiene',
  level: 'L2',
  severity: 'warn',
  title: '假数据不该进生产路径',
  hint: '假数据只该出现在测试里（`*.test.ts` / `__tests__`）：命名带 mock / fake / dummy 的文件留在生产路径，迟早被当真实数据用',
  run: (ctx) => {
    const out: Finding[] = []
    for (const record of ctx.records) {
      if (record.role === 'test' || isTestPath(record.rel)) continue
      const facts = ctx.facts.get(record.rel)
      if (!facts) continue
      const stem = (record.rel.split('/').pop() ?? '').replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/, '')
      const byFile = FAKE_NAME.test(stem)
      const exported = facts.exports.find(
        (item) => item.name !== 'default' && item.name !== '*' && FAKE_NAME.test(item.name),
      )
      if (!byFile && !exported) continue
      out.push(
        finding(
          'H09',
          record.rel,
          exported?.line ?? 1,
          byFile
            ? `假数据文件出现在生产路径：${stem}（命名带 mock / fake / dummy）`
            : `假数据导出出现在生产路径：${exported?.name}`,
          '挪进测试目录 / 测试文件；确实要给下游做示例，就把命名与落点写进契约',
        ),
      )
    }
    return out
  },
}

export const contextHygieneRules: Rule[] = [
  fakeAsync,
  fakeData,
  localHostLiterals,
  // 其余退化模式已委派：假异步/随机、硬编码地址、假数据 → eslint no-restricted-syntax；
  // 手搓时间格式化 → P06（能力指纹，项目声明了日期库才算手搓，比语法级封杀更准）。
  noDetachedApis,
]
