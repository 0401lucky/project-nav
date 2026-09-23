<script setup lang="ts">
import { onMounted, watch } from 'vue'
import AuroraBg from '@/components/shell/AuroraBg.vue'
import CursorGlow from '@/components/shell/CursorGlow.vue'
import TopBar from '@/components/shell/TopBar.vue'
import EmbedToolbar from '@/components/shell/EmbedToolbar.vue'
import CategoryFilter from '@/components/ui/CategoryFilter.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GlassButton from '@/components/ui/GlassButton.vue'
import ProjectGrid from '@/components/card/ProjectGrid.vue'
import PasswordPrompt from '@/components/editor/PasswordPrompt.vue'
import ProjectEditor from '@/components/editor/ProjectEditor.vue'
import EditModeBar from '@/components/editor/EditModeBar.vue'
import ScreenshotImport from '@/components/editor/ScreenshotImport.vue'
import CommandPalette from '@/components/command/CommandPalette.vue'
import AdminPanel from '@/components/admin/AdminPanel.vue'
import AiWorkbench from '@/components/admin/AiWorkbench.vue'
import SubmitForm from '@/components/submit/SubmitForm.vue'
import { useProjectsStore } from '@/stores/projects'
import { useUiStore } from '@/stores/ui'
import { useHealthPolling } from '@/composables/useHealthPolling'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { DEMO_PROJECTS } from '@/utils/demo'

const projects = useProjectsStore()
const ui = useUiStore()

useHealthPolling()
useCommandPalette()

onMounted(async () => {
  await projects.fetchAll()
  if (import.meta.env.DEV && projects.items.length === 0) {
    projects.items = DEMO_PROJECTS.slice()
  }
})

// 嵌入模式：把 html/body 改成透明，让宿主页面（如 New API）的背景透出来
// 同时给根节点打个标记 class，方便外部通过 CSS 进一步定制
watch(
  () => ui.isEmbed,
  (embed) => {
    if (typeof document === 'undefined') return
    if (embed) {
      document.documentElement.classList.add('is-embed')
      document.body.classList.add('is-embed')
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
    } else {
      document.documentElement.classList.remove('is-embed')
      document.body.classList.remove('is-embed')
      document.documentElement.style.background = ''
      document.body.style.background = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <AuroraBg v-if="!ui.isEmbed" />
  <CursorGlow v-if="!ui.isEmbed" />

  <TopBar v-if="!ui.isEmbed" />

  <main
    class="page"
    :class="{ embedded: ui.isEmbed }"
    :style="ui.isEmbed ? { paddingTop: ui.embedOffsetTop + 'px' } : undefined"
  >
    <section class="filters">
      <CategoryFilter
        :categories="projects.categories"
        :active="ui.activeCategory"
        :total="projects.items.length"
        @change="ui.activeCategory = $event"
      />
    </section>

    <section v-if="projects.loading" class="loading">
      <div class="loader-orb"></div>
      <span>加载中…</span>
    </section>

    <section v-else-if="ui.filteredProjects.length === 0" class="empty-wrap">
      <EmptyState
        v-if="projects.items.length === 0"
        title="还没有项目"
        description="进入编辑模式添加你的第一个项目，或者直接粘贴 Cloudflare/Zeabur 控制台截图自动导入。"
      >
        <template #action>
          <GlassButton variant="primary" @click="ui.passwordOpen = true">
            进入编辑模式
          </GlassButton>
        </template>
      </EmptyState>
      <EmptyState
        v-else
        title="没有匹配的项目"
        :description="`换个关键词试试，或清除当前筛选「${ui.activeCategory ?? ui.searchKeyword}」。`"
      >
        <template #action>
          <GlassButton @click="(ui.searchKeyword = ''), (ui.activeCategory = null)">
            清除筛选
          </GlassButton>
        </template>
      </EmptyState>
    </section>

    <section v-else class="grid-wrap">
      <ProjectGrid :projects="ui.filteredProjects" />
    </section>
  </main>

  <PasswordPrompt />
  <ProjectEditor />
  <ScreenshotImport />
  <EditModeBar />
  <EmbedToolbar v-if="ui.isEmbed && !ui.editMode" />
  <CommandPalette />
  <AdminPanel />
  <AiWorkbench />
  <SubmitForm />
</template>

<style scoped>
.page {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6) var(--space-8);
}

/* 嵌入模式：让出宿主页面的顶栏（如 NewAPI 顶部菜单）—— padding-top 由 ui.embedOffsetTop 注入 */
.page.embedded {
  padding: 0 var(--space-4) var(--space-7);
  max-width: none;
  /* 嵌入时背景透明，让宿主页面自己的色调透出来 */
  background: transparent;
}

.filters {
  margin-bottom: var(--space-6);
}

.loading {
  display: grid;
  place-items: center;
  gap: var(--space-3);
  padding: var(--space-8) 0;
  color: var(--text-muted);
  font-size: 13px;
}

.loader-orb {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid rgba(207, 69, 32, 0.15);
  border-top-color: var(--accent);
  box-shadow: 0 0 20px rgba(207, 69, 32, 0.15);
  animation: loader-spin 0.9s linear infinite;
}

@keyframes loader-spin {
  to { transform: rotate(360deg); }
}

.empty-wrap, .grid-wrap {
  position: relative;
}

@media (max-width: 480px) {
  .page { padding: var(--space-3) var(--space-4) var(--space-7); }
}
</style>
