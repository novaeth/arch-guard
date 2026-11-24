import { canonical, hygiene, uiKit, antdKit } from '../../es/index.js'

// H06–H10 夹具：脱离上下文的全局 API、假异步与随机、硬编码地址、假数据、手搓时间格式化
export default {
  presets: [canonical(), hygiene(), uiKit(antdKit())],
  overrides: {
    // 夹具的注释用来解释判定；H14 自 R-173 起默认开启，这里显式停用。
    disable: ['H14'],
    ignore: ['arch.config.mjs', 'package.json', 'tsconfig.json', 'expect.json'],
  },
}
