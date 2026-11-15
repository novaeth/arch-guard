import { library } from '../../es/index.js'

// S35 / S25 / S47 夹具：
//   S35 只有公开面入口的组（空壳切片）
//   S25 片段**内部**再出现保留名目录（`ui/lib/` 这种会让人分不清层级）
//   S47 组级依赖环：a 组 → b 组、b 组 → a 组，但**文件级没有环**（A1→B1、B2→A2）
//       —— 这正是 S08 看不见、只能靠组图判的形态
// 说明：上游 S24 是「契约扫描域非空」，所以"组必须有片段"在本仓库落 S35。
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
    ],
    structure: { segmentedGroups: ['slice'], reservedNames: ['ui', 'lib'] },
  },
}
