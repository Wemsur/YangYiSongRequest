<script setup lang="ts">
// 播出单卡片堆叠：今天在最前，左边是昨天，右边是往后的日期。
// 手机左右滑，桌面两侧有翻页按钮，也能拖；键盘左右方向键同样能翻。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PlaylistCard from '@/components/PlaylistCard.vue'
import type { PlaylistSlot } from '@/lib/api'

export interface DeckDay {
  date: string
  relative: string
  slots: PlaylistSlot[]
}

const props = defineProps<{
  days: DeckDay[]
  /** 初始停在第几张，一般是今天那张 */
  startIndex: number
  activeSlotId?: string | null
  nowLabel?: string
  /** 当前正在播出的时段属于哪一天，只有那天的卡片才点亮 ON AIR */
  liveDate?: string
}>()

/** 超过这个位移才算翻页，防止点按钮时误触 */
const SWIPE_PX = 48
/** 移动超过这么多像素就当成拖拽，之后要吞掉那一下 click */
const DRAG_SLOP = 8

const index = ref(props.startIndex)
const dragX = ref(0)
const dragging = ref(false)
const height = ref(0)
const cards = ref<HTMLElement[]>([])

const last = computed(() => Math.max(0, props.days.length - 1))
const clamp = (value: number) => Math.min(Math.max(value, 0), last.value)
const canPrev = computed(() => index.value > 0)
const canNext = computed(() => index.value < last.value)

function go(delta: number): void {
  index.value = clamp(index.value + delta)
}

function jump(target: number): void {
  index.value = clamp(target)
}

// 歌单是异步来的，天数一变就重新停到今天那张
watch(
  () => [props.days.length, props.startIndex] as const,
  () => {
    index.value = clamp(props.startIndex)
    void measure()
  },
)

function cardStyle(position: number): Record<string, string | number> {
  const delta = position - index.value
  const distance = Math.abs(delta)
  const far = distance > 2
  return {
    transform:
      `translate3d(calc(${delta * 6}% + ${dragX.value}px), ${distance * 8}px, 0)` +
      ` scale(${1 - distance * 0.05})`,
    opacity: far ? 0 : 1 - distance * 0.4,
    zIndex: 20 - distance,
    visibility: far ? 'hidden' : 'visible',
    // 拖动过程中要跟手，不能有过渡
    transitionDuration: dragging.value ? '0ms' : '',
  }
}

// 卡片高度各不相同，容器高度跟着当前那张走，翻页时一起过渡
let observer: ResizeObserver | undefined

async function measure(): Promise<void> {
  await nextTick()
  const el = cards.value[index.value]
  if (!el) return
  height.value = el.offsetHeight
  observer?.disconnect()
  observer?.observe(el)
}

watch(index, () => void measure())

onMounted(() => {
  observer = new ResizeObserver(() => {
    const el = cards.value[index.value]
    if (el) height.value = el.offsetHeight
  })
  void measure()
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})

let startX = 0
let activePointer: number | null = null
let moved = false
const swallowClick = ref(false)

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  activePointer = event.pointerId
  startX = event.clientX
  moved = false
  dragging.value = true
}

function onPointerMove(event: PointerEvent): void {
  if (activePointer !== event.pointerId || !dragging.value) return
  const delta = event.clientX - startX
  if (Math.abs(delta) > DRAG_SLOP) moved = true
  // 已经到头就加阻尼，能拖动但拖不远，告诉用户没有更多了
  const atEdge = (delta < 0 && !canNext.value) || (delta > 0 && !canPrev.value)
  dragX.value = atEdge ? delta * 0.25 : delta
}

function onPointerUp(event: PointerEvent): void {
  if (activePointer !== event.pointerId) return
  const delta = dragX.value
  dragging.value = false
  dragX.value = 0
  activePointer = null
  if (delta <= -SWIPE_PX) go(1)
  else if (delta >= SWIPE_PX) go(-1)
  if (moved) {
    // 拖完手指抬起时浏览器还会补一个 click，别让它落到试听按钮上
    swallowClick.value = true
    window.setTimeout(() => {
      swallowClick.value = false
    }, 0)
  }
}

function onClickCapture(event: MouseEvent): void {
  if (!swallowClick.value) return
  event.stopPropagation()
  event.preventDefault()
}
</script>

<template>
  <div>
    <!-- 日期条既是导航也是当前位置的指示，光靠堆叠看不出在哪一天 -->
    <div class="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
      <button
        v-for="(day, position) in days"
        :key="day.date"
        type="button"
        class="shrink-0 rounded-badge border px-3 py-1.5 text-sm"
        :class="position === index ? 'border-orange bg-orange/15' : 'border-rule text-ink-soft'"
        :aria-current="position === index ? 'true' : undefined"
        @click="jump(position)"
      >
        {{ day.relative }}
      </button>
    </div>

    <!-- 负边距让两侧露出的卡片边缘能伸进页面留白，overflow-x-clip 兜住不产生横向滚动 -->
    <div class="relative -mx-4 overflow-x-clip px-4 sm:-mx-6 sm:px-6">
      <div
        class="deck relative"
        :style="{ height: height ? `${height}px` : undefined }"
        role="group"
        aria-label="播出单，左右可切换日期"
        tabindex="0"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click.capture="onClickCapture"
        @keydown.left.prevent="go(-1)"
        @keydown.right.prevent="go(1)"
      >
        <div
          v-for="(day, position) in days"
          :key="day.date"
          ref="cards"
          class="deck-card absolute inset-x-0 top-0 sm:inset-x-5"
          :class="position === index ? '' : 'deck-card--behind'"
          :style="{
            ...cardStyle(position),
            ...(position === index || !height ? {} : { maxHeight: `${height}px` }),
          }"
          :inert="position !== index"
          :aria-hidden="position !== index ? 'true' : undefined"
        >
          <PlaylistCard
            :date="day.date"
            :slots="day.slots"
            :relative="day.relative === '今天' ? '今天的播出单' : day.relative"
            :active-slot-id="day.date === liveDate ? activeSlotId : null"
            :emphasis="day.relative === '今天'"
          >
            <template v-if="day.date === liveDate && nowLabel" #aside>
              <p class="mt-0.5 font-mono text-sm tabular-nums text-ink-soft">{{ nowLabel }}</p>
            </template>
          </PlaylistCard>
        </div>
      </div>

      <button
        type="button"
        class="deck-arrow left-0"
        :disabled="!canPrev"
        aria-label="看前一天"
        @click="go(-1)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button
        type="button"
        class="deck-arrow right-0"
        :disabled="!canNext"
        aria-label="看后一天"
        @click="go(1)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.deck {
  /* 竖向滑动交给页面，横向自己处理 */
  touch-action: pan-y;
  transition: height 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  outline-offset: 6px;
}

.deck-card {
  transition:
    transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 320ms ease;
  will-change: transform;
}

/* 非当前卡片已经 inert，这里再断掉指针，免得拖动时选到里面的文字 */
.deck-card[inert] {
  user-select: none;
}

/* 后面那几张裁到和当前卡片一样高：卡片是绝对定位的，不裁的话更长的那张会
   溢出容器压到下面的内容上。它们本来就被挡住，只露出上边缘，裁掉看不出来。
   当前那张不裁，这样硬边阴影不会被切掉，它的高度也就是容器高度的来源。 */
.deck-card--behind {
  overflow: hidden;
  border-radius: var(--radius-card);
}

.deck-arrow {
  position: absolute;
  top: 50%;
  display: none;
  translate: 0 -50%;
  z-index: 30;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--c-rule);
  border-radius: var(--radius-control);
  background-color: var(--c-paper-hi);
  box-shadow: 2px 2px 0 0 color-mix(in srgb, var(--c-ink) 12%, transparent);
  color: var(--c-ink);
}

.deck-arrow svg {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.deck-arrow:disabled {
  opacity: 0.3;
}

/* 手机靠滑动，不占地方；桌面才给按钮 */
@media (min-width: 640px) {
  .deck-arrow {
    display: flex;
  }
}
</style>
