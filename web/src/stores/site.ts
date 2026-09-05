import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchSite } from '@/lib/api'
import type { SiteSnapshot } from '@/lib/api'
import { FALLBACK_SLOTS } from '@/lib/slots'

/**
 * 站点配置：播出时段、年级班数、点歌开关、是否要求填身份。
 * 后台改了配置刷新页面就能生效，前台不做长缓存。
 */
export const useSite = defineStore('site', () => {
  const data = ref<SiteSnapshot | null>(null)
  const loading = ref(false)
  const failed = ref(false)

  async function load(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      data.value = await fetchSite()
      failed.value = false
    } catch {
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  /** 配置还没到或接口挂了时，先用默认时段把播出单渲染出来 */
  const slots = computed(() => data.value?.slots ?? FALLBACK_SLOTS)
  const requireIdentity = computed(() => data.value?.requireIdentity ?? true)
  const requestsOpen = computed(() => data.value?.requestsOpen ?? true)
  const announcement = computed(() => data.value?.announcement?.trim() ?? '')
  const classCounts = computed(() => data.value?.classCounts ?? { G1: 23, G2: 23, G3: 23 })

  return { data, loading, failed, load, slots, requireIdentity, requestsOpen, announcement, classCounts }
})
