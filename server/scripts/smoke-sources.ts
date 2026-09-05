// 联网实测三家音源，走的是我们自己的适配层，不是裸接口。
// 不放进 vitest：单测不该依赖外网和第三方可用性。
// 跑法：npm run smoke:sources --workspace server [关键词]
import 'dotenv/config'
import { allSources, checkAll } from '../src/sources/index.js'
import type { AudioTarget } from '../src/sources/index.js'

const keyword = process.argv[2] ?? '起风了'
const ms = (value: number) => `${Math.round(value / 1000)}s`
const short = (value: string | undefined, len = 52) =>
  value ? (value.length > len ? `${value.slice(0, len)}…` : value) : '(空)'
const isTarget = (value: unknown): value is AudioTarget =>
  !!value && typeof value === 'object' && 'url' in value

console.log('=== 音源体检 ===')
for (const health of await checkAll()) {
  console.log(
    `${health.label.padEnd(12)} ${health.ok ? '正常' : '异常'}  ${health.detail}` +
      `${health.hasCredential ? '  [已配 Cookie]' : ''}`,
  )
}

for (const source of allSources()) {
  console.log(`\n=== ${source.label}：搜索「${keyword}」 ===`)
  try {
    const page = await source.search(keyword, 1, 3)
    console.log(`共 ${page.total} 条，取前 ${page.songs.length} 条：`)
    for (const song of page.songs) {
      console.log(
        `  ${short(song.title, 18).padEnd(20)} ${short(song.artist, 14).padEnd(16)} ` +
          `${ms(song.durationMs).padEnd(6)} ${song.vip ? '会员' : '免费'}  ${song.platformId}`,
      )
    }

    const first = page.songs[0]
    if (!first) continue

    const [detail, stream, download, lyric] = await Promise.allSettled([
      source.detail(first.platformId),
      source.streamTarget(first.platformId),
      source.downloadTarget(first.platformId),
      source.lyric(first.platformId),
    ])

    const describe = (result: PromiseSettledResult<unknown>): string => {
      if (result.status === 'rejected') {
        const reason: unknown = result.reason
        return `抛错 ${reason instanceof Error ? reason.message : String(reason)}`
      }
      const value = result.value
      if (value === null || value === undefined) return '(拿不到)'
      if (isTarget(value)) {
        return `${value.bitrateKbps ?? '?'}kbps ${value.preview ? '试听片段' : '完整'} ${short(value.url, 46)}`
      }
      if (typeof value === 'object' && 'title' in value) {
        return String((value as { title: unknown }).title)
      }
      return short(String(value).replace(/\s+/g, ' '), 46)
    }

    console.log(`  详情    ${describe(detail)}`)
    console.log(`  试听    ${describe(stream)}`)
    console.log(`  下载    ${describe(download)}`)
    console.log(`  歌词    ${describe(lyric)}`)
  } catch (error) {
    console.log(`  失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
