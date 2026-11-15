/**
 * **声明必须有消费者**（R-171）：例外 / 建议豁免的 0 命中是配置腐烂，不是"提示"。
 *
 * 本工具面向 AI —— 非阻断的"可能可以删掉"不会有人处理；留着只会变成隐形的门禁关闭。
 * 实现放在单独模块里，让 `run.ts` / `advice.ts` 共用同一份报文口径（也避免 `runGuard` 超行数上限）。
 */

interface Declaration {
  /** 报文里点名的主体（`rule × glob` / `signal × glob`） */
  label: string
  reason: string
}

function assertConsumed(what: 'exceptions' | 'adviceAllow', stale: Declaration[]): void {
  if (stale.length === 0) return
  throw new Error(
    `${what} 有 ${stale.length} 条 0 命中（声明必须有消费者）：\n` +
      stale.map((entry) => `  · ${entry.label}（理由：${entry.reason}）`).join('\n') +
      '\n删掉它，或把 glob 修到真的命中 —— 留着只会变成隐形的门禁关闭。',
  )
}

/** `exceptions`：每条声明必须至少摘掉一条发现项；返回带命中数的报告条目 */
export function exceptionsWithHits<T extends { rule: string; glob: string; reason: string }>(
  exceptions: readonly T[],
  hits: readonly number[],
): (T & { hits: number })[] {
  assertConsumed(
    'exceptions',
    exceptions
      .map((entry, index) => ({ entry, hits: hits[index] ?? 0 }))
      .filter((item) => item.hits === 0)
      .map(({ entry }) => ({ label: `${entry.rule} × ${entry.glob}`, reason: entry.reason })),
  )
  return exceptions.map((entry, index) => ({ ...entry, hits: hits[index] ?? 0 }))
}

/** `adviceAllow`：每条豁免必须至少摘掉一条建议 */
export function assertAdviceAllowConsumed(
  allow: readonly { signal: string; glob: string; reason: string }[],
): void {
  assertConsumed(
    'adviceAllow',
    allow.map((entry) => ({ label: `${entry.signal} × ${entry.glob}`, reason: entry.reason })),
  )
}
