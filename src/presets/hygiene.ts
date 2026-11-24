import type { Preset } from '../engine/types.js'

/**
 * 反退化预设：类型逃生舱、调试残留、未完成标记、吞异常、假异步、硬编码地址……
 * 这些与项目无关，属于范式的「退路不留」公理。
 */
export function hygiene(): Preset {
  return {
    // H01–H05 已委派给 eslint（见 docs/ECOSYSTEM-AUDIT.md）；本体实现 H06 / H12 / H13
    // H14「禁止注释」默认开启（R-173）：没有能力门，引入 hygiene() 就判；
    // 要保留注释的项目显式 `overrides.disable: ['H14']` 或按文件写 exceptions
    enable: ['H07', 'H09', 'H08', 'H06', 'H12', 'H13', 'H14'],
    // 这里原先还写了一遍 `thresholds: { functionLines: 150 }` —— 与引擎默认值逐字相同，
    // 是「同一个事实的第二处存放」（默认值在 engine/defaults.ts）。删掉，行为不变。
  }
}
