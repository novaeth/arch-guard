// 合规：手机号打码里的 `/\\d{3}/` 不是千分位分组 —— 泛正则不该当成手搓数字格式化
export const maskPhone = (phone: string): string =>
  phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
