import { canonical, deps } from '../../es/index.js'

// 手工轮子指纹夹具：**五个平台能力**（此前一个夹具都没有 → 它们的豁免条件写反了也没人发现）
// + argv 索引取值 + 宽松 JSON 深比较 + 自研递归克隆（P07）
export default {
  presets: [
    canonical(),
    deps({
      capabilities: {
        'cli-args': 'commander',
        datetime: 'dayjs',
        'deep-clone': 'structuredClone',
        'unique-id': 'crypto.randomUUID',
        'number-format': 'Intl.NumberFormat',
        'deep-equal': 'node:util.isDeepStrictEqual',
        'query-string': 'URLSearchParams',
        'word-forms': 'pluralize',
        validation: 'zod',
      },
    }),
  ],
  overrides: { enable: ['P06', 'P07'] },
}
