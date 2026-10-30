import { designSystem, library } from '../../es/index.js'

/**
 * 场景：令牌**由外部运行时提供**（D04），且**消费者在本包之外**（D05）。
 *
 * 合规：
 * - `var(--ext-*)` 是外部命名空间（`externalTokens` 声明）→ D04 视为闭合，不报；
 * - `--app-only-outside` 只被 `shared/src/**`（契约域之外、`externalConsumers` 声明）引用 → D05 不算死令牌。
 *
 * 违规（仍然必报）：
 * - `var(--dangling-color)` 既不在本地定义、也不在外部命名空间 → D04 报；
 * - `--app-dead` 本地定义、哪都没人用 → D05 报。
 */
export default {
  presets: [
    library({ src: 'app/src', entry: [] }),
    designSystem({
      tokenDir: 'app/src/styles/tokens',
      paletteFile: 'app/src/styles/tokens/palette.css',
      externalTokens: [{ prefix: '--ext-', provider: '主题运行时' }],
      externalConsumers: ['shared/src/**'],
    }),
  ],
  overrides: {
    // 夹具里只判 D 域两条：给样式文件一个角色即可（角色语义由真实范式提供，这里不参与判定）
    addRoles: [{ id: 'fixture:styles', pattern: 'app/src/styles/**', layer: 1, exclusive: true }],
    enable: ['D04', 'D05'],
    ignore: ['arch.config.mjs', 'expect.json', 'package.json'],
  },
}
