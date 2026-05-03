<script setup lang="ts">
import type { Project } from '@/types'
import ProjectCard from './ProjectCard.vue'

defineProps<{
  projects: Project[]
}>()
</script>

<template>
  <TransitionGroup name="grid-stagger" tag="div" class="grid">
    <ProjectCard 
      v-for="(p, index) in projects" 
      :key="p.id" 
      :project="p"
      :style="{ '--enter-index': index }"
    />
  </TransitionGroup>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
  position: relative;
}

/* 列表过渡动画：平滑位移 */
.grid-stagger-move,
.grid-stagger-enter-active,
.grid-stagger-leave-active {
  transition: all 0.6s var(--ease-spring-bounce);
}

.grid-stagger-enter-from,
.grid-stagger-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.95);
}

.grid-stagger-leave-active {
  position: absolute;
}

/* 入场交错延迟：利用 CSS 变量 */
.grid-stagger-enter-active {
  transition-delay: calc(var(--enter-index) * 0.05s);
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }
}
</style>
