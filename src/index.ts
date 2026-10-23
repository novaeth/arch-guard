/**
 * arch-guard 公共 API。
 *
 * 包名是 `@arch-guard/core`（命令名才是 `arch-guard`）：
 * 宿主项目（写 arch.config.mjs）：
 *   import { canonical, designSystem, hygiene, uiKit, antdKit } from '@arch-guard/core/presets'
 * 程序化用法（CI / 工具集成）：
 *   import { runGuard } from '@arch-guard/core'
 */

export type * from './engine/types.js'
/**
 * 消费方要的东西必须从**包入口**拿得到（`exports` 映射不暴露 `./engine/*`）：
 * 「断言报告版本」「按 code 判自述」是机读契约的一部分，拿不到就等于没有。
 */
export {
  NOTICE,
  NOTICE_CODES,
  SKIP,
  SKIP_CODES,
  isNoticeCode,
  isSkipCode,
  type Diagnostic,
  type NoticeCode,
  type SkipCode,
  type SkippedRule,
} from './engine/codes.js'
export { REPORT_API_VERSION } from './engine/report.js'
export { loadConfig, aliasesFromTsconfig } from './engine/config.js'
export { scanProject } from './engine/scan.js'
export { extractFacts, factInputOf, TS_EXTENSIONS } from './engine/facts.js'
export { buildGraph, resolveSpecifier } from './engine/graph.js'
export {
  explainPaths,
  explainRules,
  looksLikeRuleId,
  renderExplanations,
  renderRuleCatalog,
} from './engine/explain.js'
export {
  defineAdapter,
  defineFacet,
  facetOfCapabilityRoot,
  facetNames,
  facetSpec,
  AdapterError,
  type FacetSpec,
} from './engine/adapters.js'
export { createRegistry, hasCapability } from './engine/registry.js'
export {
  depsPolicyFrom,
  policyConflicts,
  readPackageJson,
  readProjectDeps,
  type CapabilityDeclaration,
  type CustomCapability,
  type DepsPolicy,
  type FingerprintOverride,
  type ProjectDeps,
} from './engine/deps.js'
export { createRule, RuleDefinitionError } from './engine/rule.js'
export {
  defineSourceForm,
  mergeRules,
  SourceFormError,
  type SourceFormBinding,
} from './engine/source-form.js'
export { auditAdapterDeps, describePolicy } from './engine/deps-audit.js'
export { CONFIG_SPEC_VERSION } from './engine/config.js'
export { runGuard, type RunOptions, type RunResult } from './engine/run.js'
export { checkPortability } from './engine/portability.js'
export { runSelfTest } from './engine/self-test.js'
export { anchorOf, colorsEnabled, globToRegExp, mergePresets, sha1 } from './engine/util.js'
export {
  summarize,
  toJsonReport,
  renderGithubAnnotations,
  renderHeader,
  renderReport,
  renderSummary,
  severityOf,
} from './engine/report.js'

export { canonical, roleTable } from './presets/canonical.js'
export { library, libraryRoleTable } from './presets/library.js'
export { fsd, fsdRoleTable } from './presets/fsd.js'
export { designSystem, deps } from './presets/design-system.js'
export { copy } from './presets/copy.js'
export { metrics } from './presets/metrics.js'
export { hygiene } from './presets/hygiene.js'
export {
  i18n,
  i18nextKit,
  noneI18nKit,
  uiKit,
  antdKit,
  noneKit,
  stack,
  axiosKit,
  AXIOS_APIS,
  noneHttpKit,
  http,
  router,
  reactRouterKit,
  noneRouterKit,
  dataLayer,
  reactQueryKit,
  noneDataLayerKit,
  styles,
  cssModulesKit,
  noneStylesKit,
  analytics,
  callSites,
  endpoints,
  errorPolicy,
  permissions,
  envReads,
} from './presets/index.js'

export { coreRules } from './packs/core/index.js'
export { builtinSourceForms, implementedSourceForms } from './packs/registry.js'
export { kitFingerprints, fingerprintsOf } from './data/kit-fingerprints.js'
export { CALL_SITE_SOURCE_IDS, callSiteSources } from './data/call-site-sources.js'
export { ENV_READ_ROOTS } from './data/env-roots.js'
// 方案面的**默认形态**词汇（自定义 kit 时可以引用它们，别在自己那边再抄一份 routes.tsx）
export { DEFAULT_MODULE_PATTERNS, DEFAULT_ROUTE_FILES } from './data/face-forms.js'
export {
  wheelFingerprints,
  capabilityOf,
  type WheelFingerprint,
} from './data/wheel-fingerprints.js'
