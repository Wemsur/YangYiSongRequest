import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchServerInfo } from '@/lib/api'

/**
 * 播出时段要按服务器时间判断，不能信浏览器本地时钟（学生手机时间可能是错的）。
 * 这里同步一次服务器时间，之后本地走秒表，用偏移量修正。
 */
export const useServerClock = defineStore('serverClock', () => {
  const version = ref<string | null>(null)
  const online = ref<boolean | null>(null)
  const offsetMs = ref(0)
  const tick = ref(new Date())

  let timer: number | undefined

  async function sync(): Promise<void> {
    try {
      const info = await fetchServerInfo()
      version.value = info.version
      offsetMs.value = new Date(info.serverTime).getTime() - Date.now()
      online.value = true
    } catch {
      online.value = false
    }
  }

  function start(): void {
    void sync()
    timer ??= window.setInterval(() => {
      tick.value = new Date()
    }, 30_000)
  }

  const serverNow = computed(() => new Date(tick.value.getTime() + offsetMs.value))

  return { version, online, serverNow, sync, start }
})
