import { ref } from 'vue'
import { defineStore } from 'pinia'
import { streamUrl } from '@/lib/api'
import type { SourceId } from '@/lib/api'

/**
 * 全站只有一个 audio 元素：同一时刻只允许一首在放（REQUIREMENTS.md 第 1 节）。
 * 地址是后端代理的，支持 Range，所以进度条能拖。
 */
export const usePlayer = defineStore('player', () => {
  /** 形如 "netease:123456"，null 表示没有在播的 */
  const currentKey = ref<string | null>(null)
  const loading = ref(false)
  const playing = ref(false)
  const error = ref<string | null>(null)

  let audio: HTMLAudioElement | null = null

  function element(): HTMLAudioElement {
    if (audio) return audio
    const el = new Audio()
    el.preload = 'none'
    el.addEventListener('playing', () => {
      playing.value = true
      loading.value = false
    })
    el.addEventListener('pause', () => {
      playing.value = false
    })
    el.addEventListener('ended', () => {
      playing.value = false
      currentKey.value = null
    })
    el.addEventListener('error', () => {
      loading.value = false
      playing.value = false
      error.value = '这首放不出来，多半是音源那边限制了'
    })
    audio = el
    return el
  }

  const keyOf = (source: SourceId, platformId: string) => `${source}:${platformId}`

  function isCurrent(source: SourceId, platformId: string): boolean {
    return currentKey.value === keyOf(source, platformId)
  }

  async function toggle(source: SourceId, platformId: string): Promise<void> {
    const el = element()
    if (isCurrent(source, platformId)) {
      if (el.paused) await el.play().catch(() => undefined)
      else el.pause()
      return
    }
    error.value = null
    loading.value = true
    currentKey.value = keyOf(source, platformId)
    el.src = streamUrl(source, platformId)
    // 失败由 error 事件统一处理，这里不重复报
    await el.play().catch(() => undefined)
  }

  function stop(): void {
    audio?.pause()
    currentKey.value = null
    playing.value = false
  }

  return { currentKey, loading, playing, error, isCurrent, toggle, stop }
})
