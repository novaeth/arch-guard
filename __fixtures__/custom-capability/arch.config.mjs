import { canonical, deps } from '../../es/index.js'

/**
 * R-154：自定义能力。
 *
 * 内置表里没有 `http-client`。项目用对象形态登记它（首选 axios + 强指纹 `fetch(`），
 * 于是裸 `fetch` 会被 P06 点名；而同一个文件只要 import 了 axios，就按「已在使用登记方案」豁免
 * （与内置能力同一套按文件判定的语义）。
 */
export default {
  presets: [
    canonical(),
    deps({
      capabilities: {
        'http-client': {
          preferred: 'axios',
          syntax: ['\\bfetch\\s*\\('],
          hint: '请求统一走 src/shared/api/client.ts 的 axios 封装',
        },
      },
    }),
  ],
  overrides: { enable: ['P06'], ignore: ['arch.config.mjs', 'expect.json'] },
}
