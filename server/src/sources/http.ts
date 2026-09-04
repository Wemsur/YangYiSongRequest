// 三家音源都是逆向的非公开接口，返回体不规范：有 jsonp 包裹、有尾随分号。
// 统一在这里做超时、请求头、松散 JSON 解析，业务实现里不再重复这些。
import { SourceError } from './types.js'
import type { SourceId } from './types.js'

const DEFAULT_TIMEOUT_MS = 8000

export const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface SourceFetchOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  cookie?: string | null
  method?: 'GET' | 'POST'
  /** POST 时的请求体，已经序列化好 */
  body?: string
}

export async function fetchText(
  source: SourceId,
  url: string,
  options: SourceFetchOptions = {},
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      body: options.body,
      headers: {
        'user-agent': UA_DESKTOP,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new SourceError(source, `HTTP ${response.status}`)
    return await response.text()
  } catch (error) {
    if (error instanceof SourceError) throw error
    const message = error instanceof Error ? error.message : '请求失败'
    throw new SourceError(source, message, error)
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson<T>(
  source: SourceId,
  url: string,
  options: SourceFetchOptions = {},
): Promise<T> {
  return parseLoose<T>(source, await fetchText(source, url, options))
}

/** 剥掉 jsonp 包裹与尾随分号；纯 JSON 原样通过 */
export function parseLoose<T>(source: SourceId, text: string): T {
  const trimmed = text
    .trim()
    .replace(/^[^({[]*\(/, '')
    .replace(/\)?;?$/, '')
  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new SourceError(source, '返回内容不是合法 JSON')
  }
}
