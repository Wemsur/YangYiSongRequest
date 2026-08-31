<script setup lang="ts">
// 标识是构建期由 scripts/build-wordmark.mjs 从霞鹜文楷取出的字形路径，
// 内容完全来自本仓库，不含外部输入，所以可以安全地内联。
import markSvg from '@/assets/wordmark-mark.svg?raw'
import fullSvg from '@/assets/wordmark-full.svg?raw'

const { variant = 'mark' } = defineProps<{ variant?: 'mark' | 'full' }>()
</script>

<template>
  <span class="wordmark" v-html="variant === 'full' ? fullSvg : markSvg" />
</template>

<style scoped>
/* 组件的 scoped 样式没有进 @layer，而 Tailwind 的工具类在 @layer utilities 里；
   按层叠层规则，无层样式总是压过有层样式，特异性再低也一样。
   所以这里的 display 会盖掉调用方传的 hidden / sm:block ——
   要控制显隐，请在外面套一层元素，不要往 Wordmark 上传 display 类。 */
.wordmark {
  display: inline-block;
  line-height: 0;
}

.wordmark :deep(svg) {
  display: block;
  height: 1em;
  width: auto;
}
</style>
