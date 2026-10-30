import { TEST_LAYER_MIN } from './defaults.js'
import { isTestPath } from './test-paths.js'
import type { Finding, Rule } from './types.js'

/**
 * **规则判谁**（`appliesTo`）：把"这条发现项该不该算"的判据收在一处。
 *
 * 抽成独立模块的原因与 `filters.ts` / `notices.ts` 一样：`run.ts` 有函数长度上限，
 * 而这条判据本身内聚 —— 只回答"某条规则的某条发现项，对象是不是测试脚手架"。
 */

/** 记录里拿得到的最小形状（`role` / `layer`）；域外文件没有记录 */
export interface ScopeRecord {
  role: string
  layer: number
}

/**
 * **测试脚手架**：权威来源是配置里声明的 `test` 角色（层号是方言兜底），
 * 路径判据（`.test.` / `.spec.` / `__tests__/`）是"拿不到 records"时的兜底 ——
 * 与 `engine/test-paths.ts` 的注释同一口径。
 */
export function isTestScaffold(rel: string, record: ScopeRecord | undefined): boolean {
  if (record?.role === 'test') return true
  if (record !== undefined && record.layer >= TEST_LAYER_MIN) return true
  return isTestPath(rel)
}

/**
 * 这条发现项该不该进报告：`appliesTo: 'product'` 的规则不吃测试脚手架；
 * 其余规则（缺省 `'all'`）一行不改。全局违规（`global`）不按文件归属，照报。
 */
export function shouldJudge(
  rule: Pick<Rule, 'appliesTo'>,
  finding: Finding,
  records: ReadonlyMap<string, ScopeRecord>,
): boolean {
  if (rule.appliesTo !== 'product' || finding.global === true) return true
  return !isTestScaffold(finding.file, records.get(finding.file))
}
