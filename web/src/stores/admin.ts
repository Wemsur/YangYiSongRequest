import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { adminLogin, adminLogout, adminMe } from '@/lib/adminApi'
import type { AdminMe } from '@/lib/adminApi'

/** 登录态在 httpOnly cookie 里，前端只缓存「我是谁」，不存 token */
export const useAdmin = defineStore('admin', () => {
  const me = ref<AdminMe | null>(null)
  const checked = ref(false)

  async function refresh(): Promise<void> {
    try {
      me.value = await adminMe()
    } catch {
      me.value = null
    } finally {
      checked.value = true
    }
  }

  async function login(username: string, password: string): Promise<void> {
    me.value = await adminLogin(username, password)
    checked.value = true
  }

  async function logout(): Promise<void> {
    await adminLogout().catch(() => undefined)
    me.value = null
  }

  const isSuper = computed(() => me.value?.role === 'SUPER')

  return { me, checked, isSuper, refresh, login, logout }
})
