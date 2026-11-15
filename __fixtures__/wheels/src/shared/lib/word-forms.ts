// 手抄不规则复数表 + 后缀判定 + 自研 singularize → P07（弱指纹 ∧ 命名指纹）
const irregular: Record<string, string> = {
  child: 'children',
  person: 'people',
  mouse: 'mice',
}

export function singularize(word: string): string {
  if (word.endsWith('s')) return word.slice(0, -1)
  return irregular[word] ?? word
}
