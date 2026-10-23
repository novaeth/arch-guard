import axios from 'axios'

// 同一个文件已经 import 了登记的首选方案 → 按「已在使用」豁免（P06 是按文件判的）。
// 这里的裸 `fetch` 只是为了让豁免分支真的被走到。
export async function loadCrews() {
  const response = await fetch('/api/crews')
  return response.json()
}

export const getCrew = (id: string) => axios.get(`/api/crews/${id}`)
