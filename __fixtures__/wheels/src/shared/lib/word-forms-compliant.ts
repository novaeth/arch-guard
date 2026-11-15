// 合规：用 pluralize 做词形，手写规则一条都没有 → 不报
import pluralize from 'pluralize'

export const plural = (word: string): string => pluralize.plural(word)
