import { canonical, hygiene } from '../../es/index.js'

// S19（导出宽度 / 单文件组件数）夹具：两条都被违反，且两个文件都接进可达图（避免顺带触发 S15）。
export default {
  presets: [canonical(), hygiene()],
  // 夹具的注释用来解释判定；H14 自 R-173 起默认开启，这里显式停用。
  overrides: { disable: ['H14'] },
}
