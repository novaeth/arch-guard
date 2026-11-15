// 合规：项目统一的日期格式化出口 —— 已经 import dayjs，是封装不是自造轮子 → 不报 P06 / P07
import dayjs from 'dayjs'

export const formatDate = (value: Date): string => dayjs(new Date(value)).format('YYYY-MM-DD')
