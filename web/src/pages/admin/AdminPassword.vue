<script setup lang="ts">
import { ref } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError } from '@/lib/api'
import { changePassword } from '@/lib/adminApi'
import { useAdmin } from '@/stores/admin'

const admin = useAdmin()

const current = ref('')
const next = ref('')
const again = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)
const done = ref(false)

async function submit(): Promise<void> {
  failure.value = null
  if (next.value !== again.value) {
    failure.value = '两次新密码不一样'
    return
  }
  busy.value = true
  try {
    await changePassword(current.value, next.value)
    done.value = true
    current.value = ''
    next.value = ''
    again.value = ''
    await admin.refresh()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '改不了，再试一次'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AdminNav />

  <section class="max-w-sm">
    <p class="eyebrow">账号安全</p>
    <h1 class="mt-1.5 text-2xl">修改密码</h1>
    <p v-if="admin.me?.mustChangePassword" class="mt-2 text-sm text-orange-deep">
      这是初始密码，先改掉再用。
    </p>

    <form class="paper-card mt-4 space-y-3 p-5" @submit.prevent="submit">
      <label class="block">
        <span class="eyebrow">当前密码</span>
        <input
          v-model="current"
          type="password"
          autocomplete="current-password"
          class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2.5"
        />
      </label>
      <label class="block">
        <span class="eyebrow">新密码（至少 8 位）</span>
        <input
          v-model="next"
          type="password"
          autocomplete="new-password"
          class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2.5"
        />
      </label>
      <label class="block">
        <span class="eyebrow">再输一次</span>
        <input
          v-model="again"
          type="password"
          autocomplete="new-password"
          class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2.5"
        />
      </label>
      <p v-if="failure" class="text-sm text-orange-deep">{{ failure }}</p>
      <p v-if="done" class="text-sm">改好了。</p>
      <button type="submit" class="btn-primary w-full py-2.5" :disabled="busy">
        {{ busy ? '提交中…' : '保存' }}
      </button>
    </form>
  </section>
</template>
