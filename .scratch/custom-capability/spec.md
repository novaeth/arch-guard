# 自定义 capability：宿主登记本体没有的能力

Status: done

## 场景（对应 REQUIREMENTS.md 的 R-154）

- **企业内部统一请求层**：`src/shared/api/client.ts` 里用 axios 封装了请求，但业务代码里还有人裸写
  `fetch('/api/crews')`。项目在 `deps({ capabilities: { 'http-client': 'axios' } })` 里声明了这个能力，
  P06 却先在内置指纹表里找 `http-client` —— 找不到就直接跳过；裸 `fetch` 一条不报，报告显示通过。
- **想给自定义能力补指纹也没有入口**：照内置能力的样子写 `fingerprints: [{ capability: 'http-client', ... }]`
  会被 `deps()` 以「不存在的能力」拒掉（它只认 `data/wheel-fingerprints.ts` 里的九个能力）。
- **自研事件总线**：项目用 mitt，但有人手写 `addEventListener` + 导出 `emit` / `on`。这是典型的
  「弱指纹 + 命名指纹」形态，但内置表里没有 `event-bus`，P07 永远不会看它。
- **企业规范只认内部库**：`@org/request` 的 API 名与形态只有项目自己知道，内置表给不了指纹。

## 目标

- `deps({ capabilities })` 的值接受**对象形态**：`preferred`（首选方案）+ 证据
  （`syntax` / `softSyntax` + `apiNames`）+ `hint`，与内置能力同形落进生效指纹表。
- 自定义能力与内置能力走**同一张生效表**：P06 / P07、`policyConflicts`、`--render-docs`、`--verify-deps`
  只认这一份，不另开一条消费路径。
- 配置阶段 fail-closed：与内置能力重名、pattern 编译不了、没有证据、`apiNames` 与 `softSyntax` 不成对、
  缺 `hint` —— 都在 `deps()` 抛错，不留「看起来能配」的口子。
- `fingerprints` 覆盖可以指向自定义能力（与内置能力同一套校验与合并语义）。

## 非目标

- 不做运行时插件 / 第三方包注册能力 —— 仍是配置期数据（ADR-0002 的同一口径）。
- 不改 `WheelFingerprint` 的数据形状：自定义能力落成同形的条目，规则侧零分支。
- 不支持一个能力挂多个首选方案（仍是「一个能力 → 一个首选」）。
- 不把宿主的能力写进本体 `src/data/wheel-fingerprints.ts`（宿主的东西不进本体）。

## 验收标准

- 夹具 `custom-capability`：自定义 `http-client`（强指纹 `fetch(`）→ 违规文件报 P06；
  同文件 import axios 或合规写法不报；`exact: true`。
- 单测：
  - 对象形态被 `depsPolicyFrom` 解析成「能力 → 首选」+ 同形指纹条目；
  - `effectiveFingerprints` 合并内置 + 自定义，`fingerprints` 覆盖对自定义能力同样生效；
  - P06 对自定义能力的 import 豁免按**文件**判；P07 用自定义的弱指纹 + API 名命中；
  - 校验：内置重名 / 无证据 / 坏正则 / 缺 hint / `apiNames` 单独出现都报错；
  - `policyConflicts` 把自定义平台能力当平台能力（不要求进 allow）。
- `--render-docs` 的能力表能列出自定义能力；`pnpm check` 全绿。

## 边界与取舍

- **为什么放在 `capabilities` 的值里，而不是新开 `customCapabilities` 数组**：能力表已经有「能力 → 首选」
  这条事实；再开一张表会让同一个能力在两个地方各写一半（首选在一处、指纹在另一处），忘写一处就静默失效。
  对象形态让「启用 + 定义」一次说完，字符串仍是原有简写。
- **对象形态不允许覆盖内置能力**：内置能力的证据已经登记，改证据用 `fingerprints`（一个事实一个出处）；
  重名时直接报错，并给出该写哪一句。
- **`platform: true` 的自定义能力没有 import 可查**：与内置平台能力同一语义 —— 命中即报，不要求
  `allow` 里有它（它不是依赖）。
- **`depsPolicyFrom` 对老的非字符串值仍保持忽略**（历史行为）；但对象形态是新契约，写错了直接抛错。
- **P07 仍按「已知能力」跑**：自定义能力一旦写进 `capabilities` 就已经是声明的能力，因此不存在
  「没声明却被 P07 提示」的新问题。

## Comments

- 2026-10-23 初稿。范围收窄为「对象形态 + 同一张生效表」，不做插件系统。
- 2026-10-23 落地：`engine/deps.ts` 新增 `CustomCapability` / `parseCapabilities`（解析与校验单一出处），
  `depsPolicyFrom` 把对象拆成「能力 → 首选」+ 同形指纹条目；`effectiveFingerprints` 合并内置 + 自定义，
  `policyConflicts` 识别自定义平台能力。夹具 `custom-capability`、`tests/custom-capabilities.test.mjs`（7 例）
  与 `tests/docs.test.mjs` 的渲染断言一起覆盖；`pnpm check` 全绿（夹具 99/99）。
  已知边界：`depsPolicyFrom` 对老的非字符串 / 非对象值仍忽略；对象形态写错会抛错。
