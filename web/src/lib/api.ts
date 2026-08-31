export interface ServerInfo {
  version: string
  serverTime: string
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const res = await fetch('/api/version', { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`服务返回 ${res.status}`)
  return (await res.json()) as ServerInfo
}
