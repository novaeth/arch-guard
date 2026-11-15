import { library } from '../../es/index.js'

// S26 / S27 夹具：两条规模阈值都由**宿主动声明**（S26 不给默认值；S27 有默认预算）。
//   S26 同一层同一桶里 3 个切片 > 上限 2
//   S27 `src/parts` 有 2 个一级子目录 > 显式上限 1
//   S27 `pages:ui` 是**参数化角色**（`src/pages/{slice}/ui/**`）：a 切片 2 个文件 > 显式上限 1，
//       b / c 各 1 个 → 不报（防「配了却按字面 {slice} 空转」）
//   S27 默认预算 2：`src/bulk` 有 3 个文件 → 必报；`src/ok` 2 个产品文件 + 2 个测试
//       → 测试脚手架不计，不报（R-169）
export default {
  presets: [library({ entry: [] })],
  overrides: {
    roles: [
      { id: 'test', pattern: '**/*.test.{ts,tsx}', layer: 99, exclusive: true },
      {
        id: 'pages:index',
        pattern: 'src/pages/{slice}/index.ts',
        layer: 5,
        group: 'slice',
        entry: true,
      },
      { id: 'pages:ui', pattern: 'src/pages/{slice}/ui/**', layer: 5, group: 'slice' },
      { id: 'parts', pattern: 'src/parts/**', layer: 1 },
      { id: 'bulk', pattern: 'src/bulk/**', layer: 1 },
      { id: 'ok', pattern: 'src/ok/**', layer: 1 },
    ],
    structure: {
      groupCountLimits: [{ dimension: 'slice', max: 2 }],
      maxItemsPerDir: 2,
      directoryItemLimits: [
        { role: 'parts', max: 1 },
        { role: 'pages:ui', max: 1 },
      ],
    },
  },
}
