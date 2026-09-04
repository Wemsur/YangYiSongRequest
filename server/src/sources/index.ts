// 音源注册表。前台每个 tab 各请求一次，所以这里不做聚合搜索；
// 需要的是「按 id 取实现」和「一次性体检」两件事。
import { createKugouSource } from './kugou.js'
import { createNeteaseSource } from './netease.js'
import { createQQSource } from './qq.js'
import { SOURCE_IDS } from './types.js'
import type { CookieProvider, MusicSource, SourceHealth, SourceId } from './types.js'

/** 还没有凭据来源时用它；S7 换成读 SourceCredential 的实现 */
export const noCookies: CookieProvider = async () => null

export function createSources(
  getCookie: CookieProvider = noCookies,
): Record<SourceId, MusicSource> {
  return {
    netease: createNeteaseSource(getCookie),
    qq: createQQSource(getCookie),
    kugou: createKugouSource(getCookie),
  }
}

let registry = createSources()

/** S7 配好凭据后重建注册表，让三家实现都拿到读 Cookie 的能力 */
export function useCookieProvider(getCookie: CookieProvider): void {
  registry = createSources(getCookie)
}

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value)
}

export function getSource(id: string): MusicSource | null {
  return isSourceId(id) ? registry[id] : null
}

export function allSources(): MusicSource[] {
  return SOURCE_IDS.map((id) => registry[id])
}

/** 后台「音源状态」用：三家并行体检，互不影响 */
export async function checkAll(): Promise<Array<{ source: SourceId; label: string } & SourceHealth>> {
  return Promise.all(
    allSources().map(async (source) => ({
      source: source.id,
      label: source.label,
      ...(await source.health()),
    })),
  )
}

export * from './types.js'
