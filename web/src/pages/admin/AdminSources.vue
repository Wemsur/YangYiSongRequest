<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError, SOURCES } from '@/lib/api'
import type { SourceId } from '@/lib/api'
import {
  checkNeteaseQr,
  checkSources,
  clearSourceCookie,
  readCredentials,
  saveSourceCookie,
  startNeteaseQr,
} from '@/lib/adminApi'
import type { CredentialRow, SourceHealthRow } from '@/lib/adminApi'

const keyConfigured = ref(true)
const items = ref<CredentialRow[]>([])
const health = ref<SourceHealthRow[]>([])
const notice = ref<string | null>(null)
const failure = ref<string | null>(null)
const checking = ref(false)

const qrimg = ref<string | null>(null)
const qrStatus = ref('')
const pasting = ref<SourceId | null>(null)
const cookieText = ref('')

let poll: number | undefined

const label = (source: SourceId) => SOURCES.find((item) => item.id === source)?.label ?? source
const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'

async function load(): Promise<void> {
  const result = await readCredentials()
  keyConfigured.value = result.keyConfigured
  items.value = result.items
}

onMounted(async () => {
  try {
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出音源账号'
  }
})

onUnmounted(() => {
  if (poll) window.clearInterval(poll)
})

async function runCheck(): Promise<void> {
  checking.value = true
  failure.value = null
  try {
    health.value = await checkSources()
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '体检失败'
  } finally {
    checking.value = false
  }
}

/** 网易云扫码：起二维码后每 2 秒问一次状态，成功即落库 */
async function startQr(): Promise<void> {
  failure.value = null
  notice.value = null
  try {
    const started = await startNeteaseQr()
    qrimg.value = started.qrimg
    qrStatus.value = '等待扫码'
    if (poll) window.clearInterval(poll)
    poll = window.setInterval(async () => {
      try {
        const result = await checkNeteaseQr(started.key)
        qrStatus.value = result.message
        if (result.status === 'ok') {
          window.clearInterval(poll)
          qrimg.value = null
          notice.value = result.message
          await load()
        } else if (result.status === 'expired') {
          window.clearInterval(poll)
        }
      } catch {
        window.clearInterval(poll)
        qrStatus.value = '轮询中断，重新生成二维码试试'
      }
    }, 2000)
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '生成二维码失败'
  }
}

async function submitCookie(source: SourceId): Promise<void> {
  failure.value = null
  try {
    await saveSourceCookie(source, cookieText.value)
    cookieText.value = ''
    pasting.value = null
    notice.value = `${label(source)}的 Cookie 已保存`
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '保存失败'
  }
}

async function clear(source: SourceId): Promise<void> {
  failure.value = null
  try {
    await clearSourceCookie(source)
    notice.value = `${label(source)}的 Cookie 已清除`
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '清除失败'
  }
}
</script>

<template>
  <AdminNav />

  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="eyebrow">音源账号</p>
      <h1 class="mt-1.5 text-2xl">Cookie 与可用性</h1>
    </div>
    <button
      type="button"
      class="rounded-control border border-rule px-3 py-2 text-sm"
      :disabled="checking"
      @click="runCheck"
    >
      {{ checking ? '体检中…' : '给三家做一次体检' }}
    </button>
  </div>

  <p v-if="!keyConfigured" class="mt-4 rounded-card border border-orange px-4 py-3 text-sm">
    服务器还没配 <span class="font-mono">CREDENTIAL_KEY</span>，配上之前存不了 Cookie。
    生成一串随机值写进 <span class="font-mono">server/.env</span> 再重启，见 DEPLOY.md。
  </p>

  <p v-if="notice" class="mt-3 text-sm">{{ notice }}</p>
  <p v-if="failure" class="mt-3 text-sm text-orange-deep">{{ failure }}</p>

  <section v-if="health.length" class="paper-card mt-4 p-4">
    <p class="eyebrow">最近一次体检</p>
    <ul class="mt-2 space-y-1 text-sm">
      <li v-for="row in health" :key="row.source">
        <span :class="row.ok ? '' : 'text-orange-deep'">{{ row.label }}</span>
        · {{ row.detail }}
        <span v-if="row.hasCredential" class="text-ink-soft">· 已配 Cookie</span>
      </li>
    </ul>
  </section>

  <section class="paper-card mt-4 overflow-hidden">
    <ul>
      <li v-for="row in items" :key="row.source" class="border-t border-rule p-4 first:border-t-0">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg">{{ label(row.source) }}</h2>
            <p class="mt-1 text-sm text-ink-soft">
              {{ row.hasCookie ? `已配置 · ${row.note ?? ''}` : '未配置，只能拿到免费音质' }}
            </p>
            <p v-if="row.hasCookie" class="text-xs text-ink-faint">
              更新于 {{ stamp(row.updatedAt) }} · 上次体检
              {{ row.lastCheckAt ? `${stamp(row.lastCheckAt)}${row.lastCheckOk ? ' 正常' : ' 异常'}` : '—' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <button
              v-if="row.source === 'netease'"
              type="button"
              class="btn-primary px-3 py-2 text-sm"
              :disabled="!keyConfigured"
              @click="startQr"
            >
              扫码登录
            </button>
            <button
              type="button"
              class="rounded-control border border-rule px-3 py-2 text-sm"
              :disabled="!keyConfigured"
              @click="pasting = pasting === row.source ? null : row.source"
            >
              粘贴 Cookie
            </button>
            <button
              v-if="row.hasCookie"
              type="button"
              class="rounded-control border border-rule px-3 py-2 text-sm"
              @click="clear(row.source)"
            >
              清除
            </button>
          </div>
        </div>

        <div v-if="pasting === row.source" class="mt-3">
          <p class="text-xs text-ink-soft">
            在电脑上登录该平台网页版，F12 → Network 里随便找个请求，把 request headers 里的
            Cookie 整段复制过来。
          </p>
          <textarea
            v-model="cookieText"
            rows="3"
            class="mt-2 w-full rounded-control border border-rule bg-paper px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            class="btn-primary mt-2 px-3 py-2 text-sm disabled:opacity-40"
            :disabled="cookieText.trim().length < 10"
            @click="submitCookie(row.source)"
          >
            保存
          </button>
        </div>

        <div v-if="row.source === 'netease' && qrimg" class="mt-3">
          <img :src="qrimg" alt="网易云登录二维码" class="size-44 rounded-badge border border-rule bg-paper-hi" />
          <p class="mt-2 text-sm">{{ qrStatus }}</p>
          <p class="text-xs text-ink-soft">用网易云音乐 App 扫这个码，然后在手机上确认。</p>
        </div>
      </li>
    </ul>
  </section>
</template>
