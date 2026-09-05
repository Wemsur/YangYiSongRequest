// 给人看的格式化：时长与下载文件名。
// 中文文件名必须走 RFC 5987 的 filename*，否则浏览器存下来是乱码。

export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function contentDisposition(filename: string): string {
  // ASCII 回退名给老浏览器，filename* 才是真正生效的那个
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
