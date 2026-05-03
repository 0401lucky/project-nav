<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HealthSample, HealthSummary } from '@/types'
import { useHealthStore } from '@/stores/health'
import { useUiStore } from '@/stores/ui'

const TOTAL_BARS = 30

const props = defineProps<{
  projectId: string
}>()

const health = useHealthStore()
const ui = useUiStore()

const summary = computed<HealthSummary>(
  () =>
    health.getSummary(props.projectId) || {
      status: 'unknown',
      latencyMs: 0,
      uptime: 0,
      lastChecked: 0,
      samples: [],
    },
)

const padded = computed<(HealthSample | null)[]>(() => {
  const samples = summary.value.samples || []
  const list: (HealthSample | null)[] = Array(
    Math.max(0, TOTAL_BARS - samples.length),
  ).fill(null)
  return list.concat(samples).slice(-TOTAL_BARS)
})

const statusLabel = computed(() => {
  const s = summary.value
  switch (s.status) {
    case 'online':
      return `在线 ${(s.uptime * 100).toFixed(s.uptime >= 0.999 ? 0 : 1)}%`
    case 'degraded':
      return `延迟 ${s.latencyMs}ms`
    case 'offline':
      return '离线'
    default:
      return '尚未检测'
  }
})

const checking = ref(false)

async function checkNow(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  if (checking.value) return
  checking.value = true
  try {
    await health.checkNow(props.projectId)
  } catch {
    /* 错误信息暂不在卡片内提示，避免 UI 干扰 */
  } finally {
    checking.value = false
  }
}

function tipFor(s: HealthSample | null): string {
  if (!s) return '尚无数据'
  const time = new Date(s.ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${time} · ${s.ok ? s.status || 'OK' : '错误'} · ${s.latencyMs}ms`
}

function colorFor(s: HealthSample | null): string {
  if (!s) return 'unknown'
  if (!s.ok) return 'down'
  if (s.latencyMs > 2000) return 'slow'
  return 'up'
}
</script>

<template>
  <div class="health">
    <div class="bars" :title="`最近 ${padded.length} 次检测`">
      <span
        v-for="(s, i) in padded"
        :key="i"
        class="bar"
        :class="colorFor(s)"
        :title="tipFor(s)"
      />
    </div>
    <div class="meta">
      <span class="dot" :class="summary.status"></span>
      <span class="label">{{ statusLabel }}</span>
      <button
        v-if="ui.editMode"
        class="check"
        :disabled="checking"
        type="button"
        @click="checkNow"
      >
        {{ checking ? '检测中…' : '立即检测' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.health {
  display: grid;
  gap: 6px;
}

.bars {
  display: flex;
  gap: 2px;
  align-items: end;
  height: 18px;
}

.bar {
  flex: 1;
  min-width: 2px;
  height: 14px;
  border-radius: 1px;
  background: var(--status-unknown);
  transition: filter 0.15s var(--ease-out-soft);
}

.bar.up {
  background: var(--status-online);
  height: 18px;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.45);
}
.bar.slow {
  background: var(--status-degraded);
  height: 14px;
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
}
.bar.down {
  background: var(--status-offline);
  height: 8px;
}
.bar.unknown {
  height: 4px;
}

.bar:hover {
  filter: brightness(1.4);
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 11px;
  color: var(--text-muted);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-unknown);
  flex-shrink: 0;
}
.dot.online {
  background: var(--status-online);
  box-shadow: 0 0 8px var(--status-online);
}
.dot.degraded {
  background: var(--status-degraded);
  box-shadow: 0 0 8px var(--status-degraded);
}
.dot.offline {
  background: var(--status-offline);
  box-shadow: 0 0 8px var(--status-offline);
}

.label {
  font-variant-numeric: tabular-nums;
}

.check {
  margin-left: auto;
  font-size: 10.5px;
  font-family: var(--font-mono);
  color: var(--aurora-2);
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(34, 211, 238, 0.3);
  transition: all 0.2s var(--ease-out-soft);
}
.check:hover:not(:disabled) {
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.5);
}
.check:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
