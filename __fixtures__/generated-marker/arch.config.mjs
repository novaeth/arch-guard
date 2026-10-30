import { canonical } from '../../es/index.js'

/**
 * 场景：生成的文件没有 `@generated` 标记 —— 别人以为能改，重生成时那份手写逻辑被覆盖。
 * 声明生成物路径后：没标记的报；带标记的、以及手写文件都不报。
 * 另：生成物里的 `export *` 是生成器的形状，S11（禁 barrel）不判。
 */
export default {
  presets: [canonical()],
  overrides: {
    enable: ['H13', 'S11'],
    structure: { generated: ['src/shared/api/generated/**'] },
    ignore: ['arch.config.mjs', 'expect.json'],
  },
}
