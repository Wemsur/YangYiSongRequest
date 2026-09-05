<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError } from '@/lib/api'
import { createUser, patchUser, readUsers } from '@/lib/adminApi'
import type { AdminRole, AdminUserRow } from '@/lib/adminApi'
import { useAdmin } from '@/stores/admin'

const admin = useAdmin()

const users = ref<AdminUserRow[]>([])
const notice = ref<string | null>(null)
const failure = ref<string | null>(null)

const newName = ref('')
const newPassword = ref('')
const newRole = ref<AdminRole>('REVIEWER')
const resetting = ref<string | null>(null)
const resetPassword = ref('')

const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '从没登录'

async function load(): Promise<void> {
  users.value = await readUsers()
}

onMounted(async () => {
  try {
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出账号列表'
  }
})

async function run(label: string, action: () => Promise<unknown>): Promise<void> {
  notice.value = null
  failure.value = null
  try {
    await action()
    notice.value = `${label}成功`
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : `${label}失败`
  }
}

const add = () =>
  run('创建账号', async () => {
    await createUser({
      username: newName.value.trim(),
      password: newPassword.value,
      role: newRole.value,
    })
    newName.value = ''
    newPassword.value = ''
  })

const toggle = (row: AdminUserRow) =>
  run(row.disabled ? '启用' : '停用', () => patchUser(row.id, { disabled: !row.disabled }))

const changeRole = (row: AdminUserRow, role: AdminRole) => run('改角色', () => patchUser(row.id, { role }))

const doReset = (row: AdminUserRow) =>
  run('重置密码', async () => {
    await patchUser(row.id, { password: resetPassword.value })
    resetting.value = null
    resetPassword.value = ''
  })
</script>

<template>
  <AdminNav />

  <p class="eyebrow">账号管理</p>
  <h1 class="mt-1.5 text-2xl">管理员与审核员</h1>
  <p class="mt-2 text-sm text-ink-soft">
    审核员能审核、排期、下载，改不了任何配置。新建的账号首次登录会被要求改密码。
  </p>

  <p v-if="notice" class="mt-3 text-sm">{{ notice }}</p>
  <p v-if="failure" class="mt-3 text-sm text-orange-deep">{{ failure }}</p>

  <section class="paper-card mt-4 flex flex-wrap items-end gap-3 p-4">
    <label class="block">
      <span class="eyebrow">账号名</span>
      <input
        v-model="newName"
        type="text"
        class="mt-1.5 w-32 rounded-control border border-rule bg-paper px-3 py-2"
      />
    </label>
    <label class="block">
      <span class="eyebrow">初始密码（至少 8 位）</span>
      <input
        v-model="newPassword"
        type="text"
        class="mt-1.5 w-40 rounded-control border border-rule bg-paper px-3 py-2"
      />
    </label>
    <label class="block">
      <span class="eyebrow">角色</span>
      <select
        v-model="newRole"
        class="mt-1.5 block rounded-control border border-rule bg-paper px-3 py-2"
      >
        <option value="REVIEWER">审核员</option>
        <option value="SUPER">超级管理员</option>
      </select>
    </label>
    <button type="button" class="btn-primary px-4 py-2 text-sm" @click="add">新建</button>
  </section>

  <ul class="paper-card mt-4 overflow-hidden">
    <li v-for="row in users" :key="row.id" class="border-t border-rule p-4 first:border-t-0">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p>
            {{ row.username }}
            <span v-if="row.id === admin.me?.username" class="text-ink-faint">（你）</span>
            <span v-if="row.disabled" class="text-orange-deep">· 已停用</span>
            <span v-if="row.mustChangePassword" class="text-ink-soft">· 待改初始密码</span>
          </p>
          <p class="mt-0.5 text-xs text-ink-faint">
            {{ row.role === 'SUPER' ? '超级管理员' : '审核员' }} · 上次登录 {{ stamp(row.lastLoginAt) }}
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            class="rounded-control border border-rule px-2.5 py-1.5 text-xs"
            @click="changeRole(row, row.role === 'SUPER' ? 'REVIEWER' : 'SUPER')"
          >
            改成{{ row.role === 'SUPER' ? '审核员' : '超级管理员' }}
          </button>
          <button
            type="button"
            class="rounded-control border border-rule px-2.5 py-1.5 text-xs"
            @click="resetting = resetting === row.id ? null : row.id"
          >
            重置密码
          </button>
          <button
            type="button"
            class="rounded-control border border-rule px-2.5 py-1.5 text-xs"
            @click="toggle(row)"
          >
            {{ row.disabled ? '启用' : '停用' }}
          </button>
        </div>
      </div>

      <div v-if="resetting === row.id" class="mt-3 flex flex-wrap items-center gap-2">
        <input
          v-model="resetPassword"
          type="text"
          placeholder="新密码，至少 8 位"
          class="min-w-0 grow rounded-control border border-rule bg-paper px-3 py-2 text-sm"
        />
        <button
          type="button"
          class="btn-primary px-3 py-2 text-sm disabled:opacity-40"
          :disabled="resetPassword.length < 8"
          @click="doReset(row)"
        >
          确认重置
        </button>
      </div>
    </li>
  </ul>
</template>
