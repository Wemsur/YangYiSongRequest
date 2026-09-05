<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAdmin } from '@/stores/admin'

const admin = useAdmin()
const route = useRoute()
const router = useRouter()

const links = [
  { to: '/admin/review', label: '审核' },
  { to: '/admin/schedule', label: '排期' },
]

async function signOut(): Promise<void> {
  await admin.logout()
  await router.push('/admin')
}
</script>

<template>
  <div class="mb-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <nav class="flex gap-1.5">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-badge border px-3 py-1.5 text-sm"
          :class="
            route.path === link.to ? 'border-orange bg-orange/15' : 'border-rule text-ink-soft'
          "
        >
          {{ link.label }}
        </RouterLink>
        <RouterLink
          v-if="admin.isSuper"
          to="/admin/password"
          class="rounded-badge border px-3 py-1.5 text-sm"
          :class="
            route.path === '/admin/password'
              ? 'border-orange bg-orange/15'
              : 'border-rule text-ink-soft'
          "
        >
          改密码
        </RouterLink>
      </nav>
      <p class="flex items-center gap-3 text-sm text-ink-soft">
        <span>{{ admin.me?.username }} · {{ admin.isSuper ? '超级管理员' : '审核员' }}</span>
        <button type="button" class="rounded-badge border border-rule px-2.5 py-1.5" @click="signOut">
          退出
        </button>
      </p>
    </div>
    <div class="mt-3 tick-rule" />
  </div>
</template>
