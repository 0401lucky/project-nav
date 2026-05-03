<script setup lang="ts">
import { onMounted } from 'vue'
import AuroraBg from '@/components/shell/AuroraBg.vue'
import CursorGlow from '@/components/shell/CursorGlow.vue'
import TopBar from '@/components/shell/TopBar.vue'
import CategoryFilter from '@/components/ui/CategoryFilter.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GlassButton from '@/components/ui/GlassButton.vue'
import ProjectGrid from '@/components/card/ProjectGrid.vue'
import PasswordPrompt from '@/components/editor/PasswordPrompt.vue'
import ProjectEditor from '@/components/editor/ProjectEditor.vue'
import EditModeBar from '@/components/editor/EditModeBar.vue'
import ScreenshotImport from '@/components/editor/ScreenshotImport.vue'
import CommandPalette from '@/components/command/CommandPalette.vue'
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
</script>

<template>
  <AuroraBg />
  <CursorGlow />

  <TopBar />

  <main class="page">
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
  <CommandPalette />
</template>

<style scoped>
.page {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6) var(--space-8);
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
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-2));
  box-shadow: 0 0 24px var(--aurora-1);
  animation: loader-pulse 1.4s var(--ease-out-soft) infinite;
}

@keyframes loader-pulse {
  0%, 100% { transform: scale(0.85); opacity: 0.6; }
  50%      { transform: scale(1.15); opacity: 1; }
}

.empty-wrap, .grid-wrap {
  position: relative;
}

@media (max-width: 480px) {
  .page { padding: var(--space-3) var(--space-4) var(--space-7); }
}
</style>
