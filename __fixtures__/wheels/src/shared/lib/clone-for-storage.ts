// localStorage 只能存 JSON：JSON 深拷贝是刻意写法 → 不报（R-167）
export const saveDraft = (value: unknown): void =>
  localStorage.setItem('draft', JSON.parse(JSON.stringify(value)))
