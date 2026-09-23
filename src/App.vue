<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { UnauthorizedError, api } from '@/api/client'
import BookmarkGrid from '@/components/home/BookmarkGrid.vue'
import TopBar from '@/components/home/TopBar.vue'
import Wallpaper from '@/components/home/Wallpaper.vue'
import LoginScreen from '@/components/login/LoginScreen.vue'
import { useAuthStore } from '@/stores/auth'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'

const auth = useAuthStore()
const data = useDataStore()
const settings = useSettingsStore()

const booting = ref(true)
const bootError = ref<string | null>(null)

/**
 * 首屏只发这一次数据请求（design §6）。
 * 401 说明没登录，整站切到登录屏；其它错误才当成连接问题。
 */
async function bootstrap(): Promise<void> {
  try {
    const payload = await api.bootstrap()
    data.applyBootstrap(payload)
    settings.applyBootstrap(payload)
    auth.markLoggedIn()
    bootError.value = null
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

onMounted(async () => {
  await bootstrap()
  // 未登录时要给登录屏一个背景，用公开的静态 manifest 兜底
  await settings.loadPublicManifest()
  booting.value = false
})

/**
 * 登录成功后要把全量数据拉回来。
 *
 * 这里刻意用 watch 而不是让登录屏 emit：登录会把 loggedIn 置为 true，
 * 组件随即被卸载，而 emit 排在重渲染的微任务之后，父组件根本收不到。
 * 盯住状态本身既绕开了这个时序陷阱，也顺带覆盖了「退出后重新登录」。
 */
watch(
  () => auth.loggedIn,
  async (loggedIn) => {
    if (loggedIn && !data.loaded) await bootstrap()
  },
)

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
        <!-- TopBar 的 add / settings 事件由阶段 7、8 的面板接上 -->
        <TopBar />

        <main class="app__main">
          <!-- 数据没到之前不渲染网格，避免空状态一闪而过 -->
          <BookmarkGrid v-if="data.loaded" />
        </main>
      </template>
    </template>
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
</style>
