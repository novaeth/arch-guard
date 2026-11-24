import { canonical, hygiene } from '../../es/index.js'

export default {
  presets: [canonical(), hygiene()],
  overrides: {
    // 夹具的注释用来解释判定；H14 自 R-173 起默认开启，这里显式停用。
    disable: ['H14'],
    ignore: ['arch.config.mjs', 'expect.json'],
  },
}
