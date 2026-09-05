<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/lib/api'
import { useAdmin } from '@/stores/admin'

const admin = useAdmin()
const router = useRouter()

const username = ref('')
const password = ref('')
const failure = ref<string | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true
  failure.value = null
  try {
    await admin.login(username.value, password.value)
    await router.push(admin.me?.mustChangePassword ? '/admin/password' : '/admin/review')
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-sm">
    <p class="eyebrow">广播台后台</p>
    <h1 class="mt-1.5 text-2xl">管理员登录</h1>

    <form class="paper-card mt-5 space-y-3 p-5" @submit.prevent="submit">
      <label class="block">
        <span class="eyebrow">账号</span>
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2.5"
        />
      </label>
      <label class="block">
        <span class="eyebrow">密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2.5"
        />
      </label>
      <p v-if="failure" class="text-sm text-orange-deep">{{ failure }}</p>
      <button type="submit" class="btn-primary w-full py-2.5" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>
    </form>
  </section>
</template>
