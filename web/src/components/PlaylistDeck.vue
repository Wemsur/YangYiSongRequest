<script setup lang="ts">
// 播出单卡片堆叠：今天在最前，左边是昨天，右边是往后的日期。
// 拖动是连续的：位置按「小数索引」插值算出来，当前卡片跟手划走并往后退，
// 旁边那张同时往中间走、往前来，抬手只是把小数补齐到整数，不是突然跳一格。
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

/** 拖过这个比例（相对一整格的行程）就翻页，没到就弹回去 */
const COMMIT_RATIO = 0.28
/** 移动超过这么多像素才算拖拽，之后要吞掉那一下 click */
const DRAG_SLOP = 8
/** 每格的视觉参数：横向偏移、缩放、下沉 */
const STEP_X_PERCENT = 9
const STEP_SCALE = 0.07
const STEP_Y_PX = 12
/** 一格以内不做淡出：卡片是不透明的纸，靠遮挡和缩放表达前后，交接时才不会出现两层文字互相透 */
const FADE_FROM = 1
const FADE_TO = 2.2

const index = ref(props.startIndex)
const dragX = ref(0)
const dragging = ref(false)
const deckWidth = ref(0)
/** 每张卡片的自然高度，容器高度要跟着当前那张走，拖动时在两张之间插值 */
const heights = ref<number[]>([])
const cards = ref<HTMLElement[]>([])
const deck = ref<HTMLElement | null>(null)

const last = computed(() => Math.max(0, props.days.length - 1))
const clamp = (value: number) => Math.min(Math.max(value, 0), last.value)
const canPrev = computed(() => index.value > 0)
const canNext = computed(() => index.value < last.value)

/** 拖满一整格需要的距离。跟卡片宽度挂钩，窄屏上手感才不会太重 */
const travel = computed(() => Math.max(140, deckWidth.value * 0.42))

/** 带小数的当前位置：整数部分是停靠点，小数部分是这次拖动的进度 */
const position = computed(() => index.value - dragX.value / travel.value)

function go(delta: number): void {
  index.value = clamp(index.value + delta)
}

function jump(target: number): void {
  index.value = clamp(target)
}

/**
 * 拖动时额外叠一段 1:1 跟手的位移，让手指刚动起来时整叠卡片就跟着走。
 * 权重按进度衰减到 0，所以拖满一整格时正好落在下一张的停靠位置上，抬手不会跳。
 */
const extraPx = computed(() => {
  if (!dragging.value || dragX.value === 0) return 0
  const ratio = Math.min(1, Math.abs(dragX.value) / travel.value)
  return dragX.value * (1 - ratio)
})

/** 每张卡片相对「当前位置」的偏移量，可以是小数，拖动时连续变化 */
function offsetOf(slot: number): number {
  return slot - position.value
}

function cardStyle(slot: number): Record<string, string | number> {
  const delta = offsetOf(slot)
  const distance = Math.abs(delta)
  const far = distance > FADE_TO
  const x = `calc(${(delta * STEP_X_PERCENT).toFixed(3)}% + ${extraPx.value.toFixed(1)}px)`
  const fade =
    distance <= FADE_FROM
      ? 1
      : Math.max(0, 1 - (distance - FADE_FROM) / (FADE_TO - FADE_FROM))
  return {
    transform:
      `translate3d(${x}, ${(distance * STEP_Y_PX).toFixed(2)}px, 0)` +
      ` scale(${(1 - distance * STEP_SCALE).toFixed(4)})`,
    opacity: far ? 0 : fade.toFixed(3),
    // 越过半格 z 就换位，于是「跟上来的那张」正好在中途盖到前面
    zIndex: Math.round(30 - distance * 4),
    visibility: far ? 'hidden' : 'visible',
    // 拖动过程中要跟手，不能有过渡
    transitionDuration: dragging.value ? '0ms' : '',
  }
}

/**
 * 只有「停下来的那张」不裁高度——它的自然高度就是容器高度的来源。
 * 拖动过程中容器高度在两张之间插值，谁都可能比它高，所以一律裁住，
 * 否则更长的那张会溢出容器压到下面的搜索区上。
 */
function clipped(slot: number): boolean {
  return dragging.value || slot !== index.value
}

const containerHeight = computed(() => {
  const base = heights.value[index.value] ?? 0
  if (!base) return 0
  if (!dragging.value || dragX.value === 0) return base
  const target = heights.value[clamp(index.value + (dragX.value < 0 ? 1 : -1))] ?? base
  const ratio = Math.min(1, Math.abs(dragX.value) / travel.value)
  return Math.round(base + (target - base) * ratio)
})

let observer: ResizeObserver | undefined

function readHeights(): void {
  heights.value = cards.value.map((el) => el?.offsetHeight ?? 0)
  deckWidth.value = deck.value?.clientWidth ?? 0
}

async function measure(): Promise<void> {
  await nextTick()
  readHeights()
  observer?.disconnect()
  for (const el of cards.value) if (el) observer?.observe(el)
  if (deck.value) observer?.observe(deck.value)
}

// 歌单是异步来的，天数一变就重新停到今天那张
watch(
  () => [props.days.length, props.startIndex] as const,
  () => {
    index.value = clamp(props.startIndex)
    void measure()
  },
)

onMounted(() => {
  observer = new ResizeObserver(readHeights)
  void measure()
})

onBeforeUnmount(() => observer?.disconnect())

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
  // 已经到头就加阻尼：能拖动但拖不远，告诉用户后面没有了
  const atEdge = (delta < 0 && !canNext.value) || (delta > 0 && !canPrev.value)
  dragX.value = atEdge ? delta * 0.22 : delta
}

function onPointerUp(event: PointerEvent): void {
  if (activePointer !== event.pointerId) return
  const ratio = dragX.value / travel.value
  dragging.value = false
  activePointer = null
  // 先落 index 再清 dragX：两个一起变，剩下的那点距离由 CSS 过渡补完，不会跳
  if (ratio <= -COMMIT_RATIO) go(1)
  else if (ratio >= COMMIT_RATIO) go(-1)
  dragX.value = 0
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
        v-for="(day, slot) in days"
        :key="day.date"
        type="button"
        class="shrink-0 rounded-badge border px-3 py-1.5 text-sm"
        :class="slot === index ? 'border-orange bg-orange/15' : 'border-rule text-ink-soft'"
        :aria-current="slot === index ? 'true' : undefined"
        @click="jump(slot)"
      >
        {{ day.relative }}
      </button>
    </div>

    <!-- 负边距让两侧露出的卡片边缘能伸进页面留白，overflow-x-clip 兜住不产生横向滚动 -->
    <div class="relative -mx-4 overflow-x-clip px-4 sm:-mx-6 sm:px-6">
      <div
        ref="deck"
        class="deck relative"
        :style="{ height: containerHeight ? `${containerHeight}px` : undefined }"
        :class="dragging ? 'deck--dragging' : ''"
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
          v-for="(day, slot) in days"
          :key="day.date"
          class="deck-card absolute inset-x-0 top-0 sm:inset-x-5"
          :class="clipped(slot) ? 'deck-card--behind' : ''"
          :style="{
            ...cardStyle(slot),
            ...(clipped(slot) && containerHeight ? { maxHeight: `${containerHeight}px` } : {}),
          }"
          :inert="slot !== index"
          :aria-hidden="slot !== index ? 'true' : undefined"
        >
          <!-- 高度量的是这一层：外层会被 maxHeight 裁掉，量不到自然高度 -->
          <div ref="cards">
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

/* 拖动时高度跟着手指插值，再叠过渡就变成慢半拍 */
.deck--dragging {
  transition: none;
}

.deck-card {
  transform-origin: 50% 30%;
  transition:
    transform 340ms cubic-bezier(0.22, 0.86, 0.24, 1),
    opacity 340ms ease-out;
  will-change: transform, opacity;
}

/* 非当前卡片已经 inert，这里再断掉文字选择，免得拖动时选中里面的内容 */
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
  z-index: 40;
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
