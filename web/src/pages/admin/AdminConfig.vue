<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError, GRADE_OPTIONS } from '@/lib/api'
import {
  readGrades,
  readSiteConfig,
  readSlots,
  readWords,
  saveGrades,
  saveSiteConfig,
  saveSlots,
  saveWords,
} from '@/lib/adminApi'
import type { SlotRow } from '@/lib/adminApi'
import { useSite } from '@/stores/site'

const site = useSite()

const requestsOpen = ref(true)
const requireIdentity = ref(true)
const announcement = ref('')
const maxScheduleDays = ref(14)
const slots = ref<SlotRow[]>([])
const counts = ref<Record<string, number>>({ G1: 23, G2: 23, G3: 23 })
const wordsText = ref('')

const notice = ref<string | null>(null)
const failure = ref<string | null>(null)

async function loadAll(): Promise<void> {
  const [siteConfig, slotRows, gradeRows, words] = await Promise.all([
    readSiteConfig(),
    readSlots(),
    readGrades(),
    readWords(),
  ])
  requestsOpen.value = siteConfig.requestsOpen
  requireIdentity.value = siteConfig.requireIdentity
  announcement.value = siteConfig.announcement
  maxScheduleDays.value = siteConfig.maxScheduleDays
  slots.value = slotRows
  counts.value = Object.fromEntries(gradeRows.map((row) => [row.grade, row.classCount]))
  wordsText.value = words.words.join('\n')
}

onMounted(async () => {
  try {
    await loadAll()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出配置'
  }
})

async function run(label: string, action: () => Promise<unknown>): Promise<void> {
  notice.value = null
  failure.value = null
  try {
    await action()
    notice.value = `${label}已保存`
    // 前台缓存的时段与开关也跟着刷新
    await site.load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : `${label}保存失败`
  }
}

const saveSite = () =>
  run('站点开关', () =>
    saveSiteConfig({
      requestsOpen: requestsOpen.value,
      requireIdentity: requireIdentity.value,
      announcement: announcement.value,
      maxScheduleDays: Number(maxScheduleDays.value),
    }),
  )

const saveSlotList = () =>
  run('播出时段', async () => {
    slots.value = await saveSlots(slots.value)
  })

const saveGradeCounts = () =>
  run('年级班数', () =>
    saveGrades(Object.fromEntries(Object.entries(counts.value).map(([k, v]) => [k, Number(v)]))),
  )

const saveWordList = () =>
  run('敏感词', async () => {
    const result = await saveWords(wordsText.value.split(/[\n,，、]/))
    wordsText.value = result.words.join('\n')
  })

function addSlot(): void {
  slots.value.push({
    name: '',
    startTime: '12:00',
    endTime: '12:30',
    maxCount: 6,
    maxMs: null,
    enabled: true,
  })
}
</script>

<template>
  <AdminNav />

  <p v-if="notice" class="mb-3 text-sm">{{ notice }}</p>
  <p v-if="failure" class="mb-3 text-sm text-orange-deep">{{ failure }}</p>

  <section class="paper-card p-5">
    <p class="eyebrow">站点开关</p>
    <div class="mt-3 space-y-3">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="requestsOpen" type="checkbox" />
        点歌通道开放
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="requireIdentity" type="checkbox" />
        要求填写年级 / 班级 / 姓名（关掉就是完全匿名点歌，「每人每天 2 首」随之失效）
      </label>
      <label class="block">
        <span class="eyebrow">首页公告（留空则不显示）</span>
        <input
          v-model="announcement"
          type="text"
          maxlength="200"
          class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2"
        />
      </label>
      <label class="block">
        <span class="eyebrow">最远可排多少天</span>
        <input
          v-model.number="maxScheduleDays"
          type="number"
          min="1"
          max="60"
          class="mt-1.5 w-24 rounded-control border border-rule bg-paper px-3 py-2"
        />
      </label>
      <button type="button" class="btn-primary px-4 py-2 text-sm" @click="saveSite">保存</button>
    </div>
  </section>

  <section class="paper-card mt-5 p-5">
    <p class="eyebrow">播出时段</p>
    <p class="mt-2 text-sm text-ink-soft">
      顺序就是排期页的显示顺序。已经排了歌的时段不能删，得先在排期页把歌撤下。
    </p>
    <div class="mt-3 space-y-3">
      <div v-for="(slot, index) in slots" :key="slot.id ?? `new-${index}`" class="flex flex-wrap items-end gap-2">
        <label class="block">
          <span class="eyebrow">名称</span>
          <input
            v-model="slot.name"
            type="text"
            class="mt-1.5 w-28 rounded-control border border-rule bg-paper px-3 py-2"
          />
        </label>
        <label class="block">
          <span class="eyebrow">开始</span>
          <input
            v-model="slot.startTime"
            type="time"
            class="mt-1.5 rounded-control border border-rule bg-paper px-3 py-2"
          />
        </label>
        <label class="block">
          <span class="eyebrow">结束</span>
          <input
            v-model="slot.endTime"
            type="time"
            class="mt-1.5 rounded-control border border-rule bg-paper px-3 py-2"
          />
        </label>
        <label class="block">
          <span class="eyebrow">首数上限</span>
          <input
            v-model.number="slot.maxCount"
            type="number"
            min="1"
            class="mt-1.5 w-20 rounded-control border border-rule bg-paper px-3 py-2"
          />
        </label>
        <label class="flex items-center gap-1.5 pb-2.5 text-sm">
          <input v-model="slot.enabled" type="checkbox" />
          启用
        </label>
        <button
          type="button"
          class="mb-0.5 rounded-control border border-rule px-2.5 py-2 text-sm"
          @click="slots.splice(index, 1)"
        >
          删除
        </button>
      </div>
      <div class="flex gap-2">
        <button type="button" class="rounded-control border border-rule px-3 py-2 text-sm" @click="addSlot">
          加一个时段
        </button>
        <button type="button" class="btn-primary px-4 py-2 text-sm" @click="saveSlotList">保存</button>
      </div>
    </div>
  </section>

  <section class="paper-card mt-5 p-5">
    <p class="eyebrow">年级班数</p>
    <p class="mt-2 text-sm text-ink-soft">前台点歌时班级下拉的上限。</p>
    <div class="mt-3 flex flex-wrap items-end gap-3">
      <label v-for="grade in GRADE_OPTIONS" :key="grade.value" class="block">
        <span class="eyebrow">{{ grade.label }}</span>
        <input
          v-model.number="counts[grade.value]"
          type="number"
          min="1"
          max="99"
          class="mt-1.5 w-20 rounded-control border border-rule bg-paper px-3 py-2"
        />
      </label>
      <button type="button" class="btn-primary px-4 py-2 text-sm" @click="saveGradeCounts">
        保存
      </button>
    </div>
  </section>

  <section class="paper-card mt-5 p-5">
    <p class="eyebrow">敏感词</p>
    <p class="mt-2 text-sm text-ink-soft">
      一行一个，也可以用逗号分隔。命中不会拦住学生提交，只在审核列表里标出来提醒你。
    </p>
    <textarea
      v-model="wordsText"
      rows="5"
      class="mt-3 w-full rounded-control border border-rule bg-paper px-3 py-2 font-mono text-sm"
    />
    <button type="button" class="btn-primary mt-3 px-4 py-2 text-sm" @click="saveWordList">
      保存
    </button>
  </section>
</template>
