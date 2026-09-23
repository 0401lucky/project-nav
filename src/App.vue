<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { UnauthorizedError, api } from '@/api/client'
import BookmarkGrid from '@/components/home/BookmarkGrid.vue'
import SearchBox from '@/components/home/SearchBox.vue'
import TopBar from '@/components/home/TopBar.vue'
import Wallpaper from '@/components/home/Wallpaper.vue'
import LoginScreen from '@/components/login/LoginScreen.vue'
import BookmarkForm from '@/components/panels/BookmarkForm.vue'
import GroupForm from '@/components/panels/GroupForm.vue'
import SettingsPanel from '@/components/panels/SettingsPanel.vue'
import SlidePanel from '@/components/panels/SlidePanel.vue'
import Toast from '@/components/ui/Toast.vue'
import { useFilter } from '@/composables/useFilter'
import { useDrag } from '@/composables/useDrag'
import { useHotkeys } from '@/composables/useHotkeys'
import { provideHomeContext } from '@/composables/homeContext'
import type { CardActions } from '@/composables/homeContext'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import type { Bookmark, Group } from '@/types'

const auth = useAuthStore()
const data = useDataStore()
const settings = useSettingsStore()
const toast = useToast()
const drag = useDrag()
const { query: searchQuery, clear: clearSearch } = useFilter()

const searchBox = ref<InstanceType<typeof SearchBox> | null>(null)

// ---------------- 面板 ----------------

type PanelKind =
  | 'add-bookmark'
  | 'edit-bookmark'
  | 'add-group'
  | 'edit-group'
  | 'move-bookmark'
  | 'settings'

const panel = ref<PanelKind | null>(null)
const activeBookmark = ref<Bookmark | null>(null)
const activeGroup = ref<Group | null>(null)
const prefill = ref<{ url?: string; title?: string }>({})
const moveTargetId = ref('')

const PANEL_TITLES: Record<PanelKind, string> = {
  'add-bookmark': '添加书签',
  'edit-bookmark': '编辑书签',
  'add-group': '新建分组',
  'edit-group': '编辑分组',
  'move-bookmark': '移到分组',
  settings: '设置',
}

const panelTitle = computed(() => (panel.value === null ? '' : PANEL_TITLES[panel.value]))

function closePanel(): void {
  panel.value = null
  activeBookmark.value = null
  activeGroup.value = null
  prefill.value = {}
}

function addBookmarkTo(group?: Group): void {
  activeBookmark.value = null
  activeGroup.value = group ?? data.groups[0] ?? null
  panel.value = 'add-bookmark'
}

const actions: CardActions = {
  edit: (bookmark) => {
    activeBookmark.value = bookmark
    panel.value = 'edit-bookmark'
  },
  remove: (bookmark) => {
    void data.removeBookmark(bookmark.id)
  },
  move: (bookmark) => {
    activeBookmark.value = bookmark
    moveTargetId.value = data.groups.find((group) => group.id !== bookmark.groupId)?.id ?? ''
    panel.value = 'move-bookmark'
  },
  addBookmark: (group) => addBookmarkTo(group),
  editGroup: (group) => {
    activeGroup.value = group
    panel.value = 'edit-group'
  },
}

async function confirmMove(): Promise<void> {
  const bookmark = activeBookmark.value
  if (bookmark === null || moveTargetId.value === '') return
  const ok = await data.updateBookmark(bookmark.id, { groupId: moveTargetId.value })
  if (ok) closePanel()
}

provideHomeContext({ drag, actions })

// ---------------- 快捷键 ----------------

useHotkeys({
  focusSearch: () => searchBox.value?.focus(),
  escape: () => {
    // 面板优先：开着面板时 Esc 先关面板，再谈清空搜索
    if (panel.value !== null) {
      closePanel()
      return
    }
    if (searchQuery.value !== '') clearSearch()
  },
})

/**
 * 过滤状态下禁用拖拽：重排接口要求带上该分组的全部书签 id，
 * 过滤后只剩子集，提交上去会被服务端判为「缺项」直接 400。
 */
watch(
  () => searchQuery.value.trim() !== '',
  (filtering) => {
    drag.enabled.value = !filtering
  },
)

// ---------------- 启动 ----------------

const booting = ref(true)
const bootError = ref<string | null>(null)

async function loadAll(): Promise<void> {
  const payload = await api.bootstrap()
  data.applyBootstrap(payload)
  settings.applyBootstrap(payload)
}

async function bootstrap(): Promise<void> {
  try {
    await loadAll()
    auth.markLoggedIn()
    bootError.value = null
    openPrefilledAdd()
  } catch (thrown) {
    if (thrown instanceof UnauthorizedError) {
      auth.markUnauthorized()
      data.reset()
      settings.reset()
      return
    }
    bootError.value = '无法连接到服务器，请确认服务已启动'
  }
}

/** 导入之后要把分组与书签重新拉一遍 */
async function reload(): Promise<void> {
  try {
    await loadAll()
  } catch (thrown) {
    if (thrown instanceof UnauthorizedError) auth.markUnauthorized()
    else toast.error('刷新数据失败，请重试')
  }
}

async function logout(): Promise<void> {
  closePanel()
  await auth.logout()
  data.reset()
  settings.reset()
}

/**
 * login 会把 loggedIn 置为 true，组件随即被卸载，
 * 而 emit 排在重渲染的微任务之后，父组件收不到「登录成功」。
 * 盯住状态本身既绕开这个时序陷阱，也顺带覆盖「退出后重新登录」。
 */
watch(
  () => auth.loggedIn,
  async (loggedIn) => {
    if (loggedIn && !data.loaded) await bootstrap()
  },
)

/** bookmarklet 跳过来时带的 #add?url=&title=，登录后自动开面板预填 */
let prefillHandled = false

function openPrefilledAdd(): void {
  if (prefillHandled) return
  prefillHandled = true

  const hash = location.hash
  if (!hash.startsWith('#add')) return

  // 必须用 URLSearchParams：服务端生成的查询串里空格是 +，
  // decodeURIComponent 不会把 + 还原成空格
  const index = hash.indexOf('?')
  const params = new URLSearchParams(index === -1 ? '' : hash.slice(index + 1))
  const url = params.get('url')
  const title = params.get('title')
  if (url === null && title === null) return

  prefill.value = {
    ...(url === null ? {} : { url }),
    ...(title === null ? {} : { title }),
  }
  activeGroup.value = data.groups[0] ?? null
  panel.value = 'add-bookmark'
  // 清掉 hash，刷新时不要又弹一次
  history.replaceState(null, '', location.pathname)
}

onMounted(async () => {
  await bootstrap()
  // 未登录时要给登录屏一个背景，用公开的静态 manifest 兜底
  await settings.loadPublicManifest()
  booting.value = false
})

/** 强调色写到根节点，全站取色都从这里来 */
const rootStyle = computed(() => ({ '--accent': settings.accent }))
</script>

<template>
  <div class="app" :style="rootStyle">
    <Wallpaper />

    <template v-if="!booting">
      <p v-if="bootError" class="app__error">{{ bootError }}</p>

      <LoginScreen v-else-if="!auth.loggedIn" />

      <template v-else>
        <TopBar @add="addBookmarkTo()" @settings="panel = 'settings'" />

        <!-- 搜索框放在不滚动的区域，滚动网格时它一直在 -->
        <div class="app__search">
          <SearchBox ref="searchBox" />
        </div>

        <main class="app__main">
          <!-- 数据没到之前不渲染网格，避免空状态一闪而过 -->
          <BookmarkGrid v-if="data.loaded" />
        </main>

        <button class="app__fab" type="button" aria-label="新建分组" @click="panel = 'add-group'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          分组
        </button>
      </template>
    </template>

    <SlidePanel :open="panel !== null" :title="panelTitle" @close="closePanel">
      <!-- key 让每次打开都拿到全新实例，表单里的初始值才会跟着换 -->
      <BookmarkForm
        v-if="panel === 'add-bookmark' || panel === 'edit-bookmark'"
        :key="activeBookmark?.id ?? 'new-bookmark'"
        :bookmark="activeBookmark"
        :prefill="prefill"
        @saved="closePanel"
        @cancel="closePanel"
      />

      <GroupForm
        v-else-if="panel === 'add-group' || panel === 'edit-group'"
        :key="activeGroup?.id ?? 'new-group'"
        :group="activeGroup"
        @saved="closePanel"
        @cancel="closePanel"
      />

      <SettingsPanel v-else-if="panel === 'settings'" @logout="logout" @imported="reload" />

      <div v-else-if="panel === 'move-bookmark'" class="field">
        <label class="field__label" for="mv-group">移到哪个分组</label>
        <select id="mv-group" v-model="moveTargetId" class="select">
          <option value="" disabled>请选择</option>
          <option v-for="group in data.groups" :key="group.id" :value="group.id">
            {{ group.icon ? `${group.icon} ` : '' }}{{ group.name }}
          </option>
        </select>
      </div>

      <template #footer>
        <div v-if="panel === 'move-bookmark'" class="btn-row">
          <button class="btn" type="button" @click="closePanel">取消</button>
          <button class="btn btn--primary" type="button" @click="confirmMove">移动</button>
        </div>
      </template>
    </SlidePanel>

    <Toast />
  </div>
</template>

<style scoped>
.app {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app__search {
  flex: 0 0 auto;
  padding: 0 var(--page-x);
}

.app__main {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--page-x) var(--page-x);
}

.app__error {
  display: grid;
  place-content: center;
  height: 100%;
  font-size: 14px;
  color: var(--text-2);
}

.app__fab {
  position: fixed;
  right: var(--page-x);
  bottom: 24px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #10131a;
  background: var(--accent);
  border-radius: var(--r-pill);
  box-shadow: 0 12px 30px rgb(0 0 0 / 0.45);
  transition: filter var(--dur) var(--ease);
}

.app__fab:hover {
  filter: brightness(1.08);
}
</style>
