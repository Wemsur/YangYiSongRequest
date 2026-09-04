// 音源联调：真的去打三家接口，看搜索 / 详情 / 试听 / 下载 / 歌词还通不通。
// 这些都是第三方非公开接口，随时可能变，所以不进 npm test（那套只测归一化逻辑）。
// 手动跑：npm run smoke:sources --workspace server
import { allSources } from '../src/sources/index.js'
import type { AudioTarget } from '../src/sources/index.js'

const KEYWORD = process.argv[2] ?? '周杰伦'

const show = (target: AudioTarget | null) =>
  target
    ? `${target.bitrateKbps ?? '?'}k ${target.format ?? '?'}${target.preview ? ' (试听片段)' : ''}`
    : '拿不到'

let failed = 0

for (const source of allSources()) {
  console.log(`\n=== ${source.label} ===`)
  const health = await source.health()
  console.log(`体检：${health.ok ? '通' : '不通'}｜${health.detail}｜凭据：${health.hasCredential ? '已配' : '无'}`)
  if (!health.ok) {
    failed += 1
    continue
  }

  try {
    const page = await source.search(KEYWORD, 1, 3)
    console.log(`搜索：命中 ${page.total} 条，取回 ${page.songs.length} 条`)
    for (const song of page.songs) {
      console.log(`  ${song.title} / ${song.artist}  ${Math.round(song.durationMs / 1000)}s  ${song.vip ? '付费' : '免费'}`)
    }

    const first = page.songs[0]
    if (!first) {
      failed += 1
      continue
    }

    const [detail, stream, download, lyric] = await Promise.all([
      source.detail(first.platformId),
      source.streamTarget(first.platformId),
      source.downloadTarget(first.platformId),
      source.lyric(first.platformId).catch(() => null),
    ])
    console.log(`详情：${detail ? `${detail.title} / ${detail.artist} ${Math.round(detail.durationMs / 1000)}s` : '拿不到'}`)
    console.log(`试听：${show(stream)}`)
    console.log(`下载：${show(download)}`)
    console.log(`歌词：${lyric ? `${lyric.split('\n').length} 行` : '拿不到'}`)
    console.log(`封面：${detail?.coverUrl ? '有' : '无'}`)
  } catch (error) {
    failed += 1
    console.log(`失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(`\n${failed === 0 ? '三家音源都通' : `${failed} 家音源有问题`}`)
process.exit(failed === 0 ? 0 : 1)
