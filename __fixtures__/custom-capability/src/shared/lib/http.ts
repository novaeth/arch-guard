export async function loadCrews() {
  const response = await fetch('/api/crews')
  return response.json()
}
