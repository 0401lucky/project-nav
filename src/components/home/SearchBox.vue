<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFilter } from '@/composables/useFilter'
import { useSettingsStore } from '@/stores/settings'

const { query, result, activeBookmark, moveActive, clear } = useFilter()
const settings = useSettingsStore()

const input = ref<HTMLInputElement | null>(null)

/** 回车会发生什么，提前说清楚 */
const hint = computed(() => {
  if (query.value.trim() === '') return ''
  if (result.value.noMatches) {
    return `没有匹配的书签，回车用 ${settings.searchEngine.name} 搜索`
  }
  const active = activeBookmark.value
  return active === null
    ? ''
    : `回车打开「${active.title}」 · Shift+回车 用 ${settings.searchEngine.name} 搜`
})

/** 有内容才显示「用搜索引擎搜」按钮；全是空格时搜了也没意义 */
const hasTerm = computed(() => query.value.trim() !== '')

function focus(): void {
  input.value?.focus()
  input.value?.select()
}

function onEscape(event: KeyboardEvent): void {
  // 在输入框里按 Esc 就地处理完，别冒泡给全局的 Esc（那是关面板用的）
  event.stopPropagation()
  if (query.value === '') {
    input.value?.blur()
    return
  }
  clear()
}

/** 输入法组词时的按键属于候选框，不是给我们的 */
function isComposing(event: KeyboardEvent): boolean {
  // Safari 的上屏回车晚于 compositionend、isComposing 已是 false，只能靠 keyCode 229 识别
  return event.isComposing || event.keyCode === 229
}

/** ↑↓ 在匹配结果里移动；←→ 不拦，留给输入光标 */
function onArrow(event: KeyboardEvent, delta: number): void {
  if (isComposing(event)) return
  // 没有匹配时不拦截，方向键保持输入框的默认行为
  if (activeBookmark.value === null) return
  event.preventDefault()
  moveActive(delta)
}

function onEnter(event: KeyboardEvent): void {
  // 输入法组词时的回车是「上屏」，不是提交
  if (isComposing(event)) return
  event.preventDefault()
  if (event.shiftKey) searchWeb()
  else submit()
}

function submit(): void {
  if (query.value.trim() === '') return

  // activeBookmark 只在有匹配时非空：没匹配上时首页按 design §6 保持全量，
  // 那时打开「全量里的第一条」就成了打开一个跟搜索词无关的书签。
  const active = activeBookmark.value
  if (active !== null) {
    openUrl(active.url)
    return
  }
  searchWeb()
}

/** 不管有没有匹配，都用搜索引擎搜当前词 */
function searchWeb(): void {
  const term = query.value.trim()
  if (term === '') return
  const target = searchUrl(settings.searchEngine.template, term)
  if (target !== null) openUrl(target)
}

function searchUrl(template: string, term: string): string | null {
  const filled = template.replace('%s', encodeURIComponent(term))
  // 模板是用户自己配的，仍然只放行 http(s)，避免 javascript: 之类被当成地址打开
  return /^https?:\/\//i.test(filled) ? filled : null
}

function openUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

defineExpose({ focus })
</script>

<template>
  <div class="search">
    <div class="search__row">
      <svg class="search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>

      <input
        ref="input"
        v-model="query"
        class="search__input"
        type="search"
        placeholder="搜索书签，或直接回车用搜索引擎搜"
        aria-label="搜索书签"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="onEnter"
        @keydown.down="onArrow($event, 1)"
        @keydown.up="onArrow($event, -1)"
        @keydown.esc.prevent="onEscape"
      />

      <button v-if="hasTerm" class="search__engine" type="button" @click="searchWeb">
        用 {{ settings.searchEngine.name }} 搜
      </button>

      <button
        v-if="query !== ''"
        class="search__clear"
        type="button"
        aria-label="清空搜索"
        @click="clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <p v-if="hint" class="search__hint" role="status">{{ hint }}</p>
  </div>
</template>

<style scoped>
/* 提示行用正常文档流而不是绝对定位，免得和下面的网格叠在一起 */
.search {
  display: grid;
  margin-bottom: 16px;
  background: var(--glass-panel);
  border: 1px solid var(--stroke);
  border-radius: var(--r-panel);
  transition: border-color var(--dur) var(--ease);
}

.search:focus-within {
  border-color: var(--accent);
}

.search__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}

.search__icon {
  flex: 0 0 auto;
  color: var(--text-3);
}

.search__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 13px 0;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
}

.search__input::placeholder {
  color: var(--text-3);
}

/* 去掉 type=search 自带的清除按钮，用我们自己的 */
.search__input::-webkit-search-cancel-button {
  appearance: none;
}

.search__clear {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--r-pill);
  color: var(--text-3);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}

.search__clear:hover {
  background: rgb(255 255 255 / 0.14);
  color: var(--text);
}

.search__engine {
  flex: 0 0 auto;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  background: rgb(255 255 255 / 0.06);
  border: 1px solid var(--stroke);
  border-radius: var(--r-pill);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}

.search__engine:hover {
  background: rgb(255 255 255 / 0.14);
  color: var(--text);
}

.search__hint {
  padding: 0 14px 10px;
  font-size: 12px;
  color: var(--text-2);
}
</style>
