import { library } from '../../es/index.js'

// H14 夹具：**默认关闭**；声明 `params.noComments` 后，出现注释即报。
//   bad.ts / legacy.js / style.css 有注释 → 必报；good.ts 没有注释 → 不报
//   （TS / JS 同属一个源码家族，CSS 走另一条解析路径，同一口径）。
export default {
  presets: [library({ entry: [] })],
  overrides: {
    roles: [{ id: 'ts', pattern: 'src/**', layer: 1 }],
    enable: ['H14'],
    params: { noComments: true },
  },
}
