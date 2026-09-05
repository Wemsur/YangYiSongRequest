<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAdmin } from '@/stores/admin'

const admin = useAdmin()
const route = useRoute()
const router = useRouter()

const links = computed(() => [
  { to: '/admin/review', label: '审核', super: false },
  { to: '/admin/schedule', label: '排期', super: false },
  { to: '/admin/config', label: '配置', super: true },
  { to: '/admin/calendar', label: '行政历', super: true },
  { to: '/admin/sources', label: '音源', super: true },
  { to: '/admin/users', label: '账号', super: true },
  { to: '/admin/password', label: '改密码', super: false },
])

const visible = computed(() => links.value.filter((link) => !link.super || admin.isSuper))

async function signOut(): Promise<void> {
  await admin.logout()
  await router.push('/admin')
}
</script>

<template>
  <div class="mb-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <nav class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="link in visible"
          :key="link.to"
          :to="link.to"
          class="rounded-badge border px-3 py-1.5 text-sm"
          :class="
            route.path === link.to ? 'border-orange bg-orange/15' : 'border-rule text-ink-soft'
          "
        >
          {{ link.label }}
        </RouterLink>
      </nav>
      <p class="flex items-center gap-3 text-sm text-ink-soft">
        <span>{{ admin.me?.username }} · {{ admin.isSuper ? '超级管理员' : '审核员' }}</span>
        <button
          type="button"
          class="rounded-badge border border-rule px-2.5 py-1.5"
          @click="signOut"
        >
          退出
        </button>
      </p>
    </div>
    <div class="mt-3 tick-rule" />
  </div>
</template>
