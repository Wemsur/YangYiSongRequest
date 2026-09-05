// 敏感词：命中不拦提交，只在后台标记出来交人工判断（见 REQUIREMENTS.md 第 2 节）。
// 词表变动不频繁，缓存 60 秒；后台增删词时调 invalidateBannedWords()。
import { prisma } from '../lib/db.js'

const TTL_MS = 60_000
let cache: { at: number; words: string[] } | null = null

export function invalidateBannedWords(): void {
  cache = null
}

async function words(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.words
  const rows = await prisma.bannedWord.findMany({ select: { word: true } })
  const list = rows.map((row) => row.word.trim().toLowerCase()).filter(Boolean)
  cache = { at: Date.now(), words: list }
  return list
}

/** 返回命中的词；大小写不敏感，简单包含匹配够用 */
export async function findBannedHits(...texts: Array<string | null | undefined>): Promise<string[]> {
  const list = await words()
  if (list.length === 0) return []
  const haystack = texts.filter(Boolean).join(' ').toLowerCase()
  return list.filter((word) => haystack.includes(word))
}
