<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError, api } from '@/api/client'
import type { BookmarkInput } from '@/api/client'
import { useDataStore } from '@/stores/data'
import type { Bookmark } from '@/types'

const props = defineProps<{
  /** 有值表示编辑，无值表示新增 */
  bookmark?: Bookmark | null
  /** 从 bookmarklet 的 #add 带进来的预填 */
  prefill?: { url?: string; title?: string }
}>()

const emit = defineEmits<{ saved: []; cancel: [] }>()

const data = useDataStore()

const isEdit = computed(() => props.bookmark != null)

const url = ref(props.bookmark?.url ?? props.prefill?.url ?? '')
const title = ref(props.bookmark?.title ?? props.prefill?.title ?? '')
const description = ref(props.bookmark?.description ?? '')
const groupId = ref(props.bookmark?.groupId ?? data.groups[0]?.id ?? '')

const candidates = ref<string[]>([])
const chosenIcon = ref<string | null>(null)
const fetching = ref(false)
const fetchNote = ref<string | null>(null)

const saving = ref(false)
const formError = ref<string | null>(null)

const canSave = computed(
  () => !saving.value && title.value.trim() !== '' && url.value.trim() !== '' && groupId.value !== '',
)

let debounceTimer: ReturnType<typeof setTimeout> | undefined
/** 最近一次发起抓取的网址：同一网址不重复抓（含抓完回写 finalUrl 触发的那次） */
let lastRequested = ''
let requestSeq = 0

/**
 * 贴完网址自动补全标题、描述与图标候选。
 * 只在新增时抓：编辑时页面已经有用户确认过的内容，再去覆盖会让人白改一场。
 */
async function fetchMeta(): Promise<void> {
  const target = url.value.trim()
  if (target === '' || isEdit.value || target === lastRequested) return

  lastRequested = target
  const seq = ++requestSeq
  fetching.value = true
  fetchNote.value = null
  try {
    const meta = await api.meta(target)
    // 抓取期间用户改了网址：这份结果已过期，丢掉，改后的网址有自己的那次抓取
    if (url.value.trim() !== target) return
    if (meta.finalUrl !== '') {
      lastRequested = meta.finalUrl
      url.value = meta.finalUrl
    }
    // 只填空字段，不覆盖用户已经敲进去的内容
    if (meta.title !== undefined && title.value.trim() === '') title.value = meta.title
    if (meta.description !== undefined && description.value.trim() === '') {
      description.value = meta.description
    }
    candidates.value = meta.iconCandidates
    chosenIcon.value = null
    if (meta.error !== undefined) {
      fetchNote.value = '没能抓取到信息，可以手动填写'
    } else if (meta.iconCandidates.length === 0) {
      fetchNote.value = '这个站点没有提供图标，会用首字色块'
    }
  } catch (error) {
    if (url.value.trim() !== target) return
    // 抓取失败不阻塞保存
    fetchNote.value =
      error instanceof ApiError ? `没能抓取到信息：${error.message}` : '没能抓取到信息，可以手动填写'
  } finally {
    // 只有最新一次抓取结束才收起「正在抓取」，旧请求晚回来不该把它提前关掉
    if (seq === requestSeq) fetching.value = false
  }
}

/** 输入停顿 500ms 后抓一次，避免每敲一个字符就发请求 */
watch(url, () => {
  if (isEdit.value) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchMeta, 500)
})

function flushDebounce(): void {
  clearTimeout(debounceTimer)
  if (!isEdit.value) void fetchMeta()
}

onBeforeUnmount(() => clearTimeout(debounceTimer))

async function save(): Promise<void> {
  if (!canSave.value) {
    formError.value =
      title.value.trim() === ''
        ? '标题不能为空'
        : url.value.trim() === ''
          ? '网址不能为空'
          : '请选择分组'
    return
  }

  saving.value = true
  formError.value = null

  const input: BookmarkInput = {
    groupId: groupId.value,
    title: title.value.trim(),
    url: url.value.trim(),
    description: description.value.trim() === '' ? null : description.value.trim(),
    // 只有用户真的选了图标才带上 iconUrl：传 null 会被服务端当成「清除图标」，
    // 编辑时什么都不选反而会把原图标抹掉
    ...(chosenIcon.value === null ? {} : { iconUrl: chosenIcon.value }),
  }

  const ok =
    props.bookmark != null
      ? await data.updateBookmark(props.bookmark.id, input)
      : (await data.createBookmark(input)) !== null

  saving.value = false
  if (ok) emit('saved')
}
</script>

<template>
  <form class="form" @submit.prevent="save">
    <div class="field">
      <label class="field__label" for="bm-url">网址</label>
      <input
        id="bm-url"
        v-model="url"
        class="input"
        type="text"
        placeholder="粘贴网址，会自动补全标题"
        autocomplete="off"
        spellcheck="false"
        @blur="flushDebounce"
      />
      <p v-if="fetching" class="field__hint">正在抓取页面信息…</p>
      <p v-else-if="fetchNote" class="field__hint">{{ fetchNote }}</p>
    </div>

    <div class="field">
      <label class="field__label" for="bm-title">标题</label>
      <input id="bm-title" v-model="title" class="input" type="text" placeholder="标题" />
    </div>

    <div class="field">
      <label class="field__label" for="bm-desc">描述</label>
      <textarea id="bm-desc" v-model="description" class="textarea" placeholder="可选" rows="2" />
    </div>

    <div class="field">
      <label class="field__label" for="bm-group">分组</label>
      <select id="bm-group" v-model="groupId" class="select">
        <option v-for="group in data.groups" :key="group.id" :value="group.id">
          {{ group.icon ? `${group.icon} ` : '' }}{{ group.name }}
        </option>
      </select>
    </div>

    <!-- 候选图标是外链预览，只在这一处允许：保存后由服务端下载到本地 -->
    <div v-if="!isEdit && candidates.length > 0" class="field">
      <span class="field__label">图标</span>
      <div class="icons">
        <button
          v-for="candidate in candidates"
          :key="candidate"
          class="icons__item"
          :class="{ 'is-chosen': chosenIcon === candidate }"
          type="button"
          :title="candidate"
          @click="chosenIcon = chosenIcon === candidate ? null : candidate"
        >
          <img :src="candidate" alt="" loading="lazy" decoding="async" />
        </button>
      </div>
      <p class="field__hint">选中后会下载到本站；不选就用首字色块</p>
    </div>

    <p v-if="formError" class="field__error" role="alert">{{ formError }}</p>

    <div class="btn-row">
      <button class="btn" type="button" @click="emit('cancel')">取消</button>
      <button class="btn btn--primary" type="submit" :disabled="!canSave">
        {{ saving ? '保存中…' : isEdit ? '保存修改' : '添加书签' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.icons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icons__item {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: rgb(0 0 0 / 0.3);
  border: 1px solid var(--stroke);
  border-radius: 10px;
  transition: border-color var(--dur) var(--ease);
}

.icons__item img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.icons__item.is-chosen {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
</style>
