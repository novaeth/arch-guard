// `import type` 只借类型、不调用 dayjs：不能拿它当"已在使用首选方案"的豁免
import type { Dayjs } from 'dayjs'

export const read = (value: Dayjs): string => value.toDateString()
