// HTTP 头（Last-Modified）与格式常量不是手搓日期库 → 不报（R-167）
export const DATE_FORMAT = 'YYYY-MM-DD'

export const headerDate = (value: Date): string => value.toUTCString()
