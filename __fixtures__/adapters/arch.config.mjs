import { canonical, hygiene, uiKit, antdKit, deps } from '../../es/index.js'

// P04 / P05 / P07 夹具：适配表与真实依赖对不上、图标混用、疑似自造轮子
// P07 与 P06 同口径（R-166）：能力必须先在 capabilities 里声明，否则不跑
export default {
  presets: [
    canonical(),
    hygiene(),
    uiKit(antdKit()),
    deps({ capabilities: { 'debounce-throttle': 'lodash-es' } }),
  ],
  overrides: {
    // 夹具的注释用来解释判定；H14 自 R-173 起默认开启，这里显式停用。
    disable: ['H14'],
    ignore: ['arch.config.mjs', 'package.json', 'tsconfig.json', 'expect.json'],
  },
}
