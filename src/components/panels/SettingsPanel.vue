<script setup lang="ts">
import { computed, ref } from 'vue'
import ImportSection from '@/components/panels/ImportSection.vue'
import WallpaperPicker from '@/components/panels/WallpaperPicker.vue'
import { api, describeError } from '@/api/client'
import { useToast } from '@/composables/useToast'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import type { MissingIconReport, SearchEngine } from '@/types'

const emit = defineEmits<{ logout: []; imported: [] }>()

const settings = useSettingsStore()
const data = useDataStore()
const toast = useToast()

const PRESETS: SearchEngine[] = [
  { name: 'Google', template: 'https://www.google.com/search?q=%s' },
  { name: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
]

const CUSTOM = '自定义'

/** 当前模板对得上哪个预置；对不上就是自定义 */
const preset = ref(PRESETS.find((item) => item.template === settings.searchEngine.template)?.name ?? CUSTOM)
const customName = ref(settings.searchEngine.name)
const customTemplate = ref(settings.searchEngine.template)

function choosePreset(name: string): void {
  preset.value = name
  const found = PRESETS.find((item) => item.name === name)
  if (found !== undefined) {
    void settings.saveSearchEngine(found)
    return
  }
  // 切到自定义时用当前值当起点
  customName.value = settings.searchEngine.name
  customTemplate.value = settings.searchEngine.template
}

async function saveCustom(): Promise<void> {
  const name = customName.value.trim()
  const template = customTemplate.value.trim()
  if (name === '') {
    toast.error('搜索引擎要有个名字')
    return
  }
  if (!template.includes('%s')) {
    toast.error('模板里要用 %s 代表搜索词')
    return
  }
  await settings.saveSearchEngine({ name, template })
}

const ACCENTS = ['#e8c87a', '#7fd1ae', '#8ab4f8', '#e79ab5', '#c9a0ff']

/**
 * bookmarklet：点一下就把当前页网址带回本站。
 * 令牌是服务端生成的长随机串，改密码不会让它失效。
 */
const bookmarklet = computed(() => {
  const token = settings.bookmarkletToken
  if (token === '') return ''
  return (
    `javascript:location.href='${location.origin}/add?token=${token}` +
    `&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)`
  )
})

const missingIcons = computed(() => data.bookmarks.filter((item) => !item.hasIcon).length)
const repairing = ref(false)
const repairReport = ref<MissingIconReport | null>(null)

/** 同步等服务端逐条抓完，几十条大约一分钟 */
async function repairIcons(): Promise<void> {
  repairing.value = true
  repairReport.value = null
  try {
    repairReport.value = await api.refetchMissingIcons()
    await data.reloadBookmarks()
  } catch (error) {
    toast.error(describeError(error))
  } finally {
    repairing.value = false
  }
}
</script>

<template>
  <div class="settings">
    <section class="section">
      <h3 class="section__title">壁纸</h3>
      <WallpaperPicker />
    </section>

    <section class="section">
      <h3 class="section__title">搜索引擎</h3>
      <p class="field__hint">搜索框里没有匹配的书签时，回车用它来搜</p>

      <div class="chips">
        <button
          v-for="item in [...PRESETS.map((p) => p.name), CUSTOM]"
          :key="item"
          class="chip"
          :class="{ 'is-on': preset === item }"
          type="button"
          @click="choosePreset(item)"
        >
          {{ item }}
        </button>
      </div>

      <div v-if="preset === CUSTOM" class="custom">
        <div class="field">
          <label class="field__label" for="se-name">名称</label>
          <input id="se-name" v-model="customName" class="input" type="text" />
        </div>
        <div class="field">
          <label class="field__label" for="se-template">搜索地址模板</label>
          <input
            id="se-template"
            v-model="customTemplate"
            class="input"
            type="text"
            placeholder="https://example.com/search?q=%s"
          />
          <p class="field__hint">用 %s 代表搜索词</p>
        </div>
        <div class="btn-row">
          <button class="btn btn--primary" type="button" @click="saveCustom">保存</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h3 class="section__title">强调色</h3>
      <div class="chips">
        <button
          v-for="color in ACCENTS"
          :key="color"
          class="swatch"
          :class="{ 'is-on': settings.accent.toLowerCase() === color }"
          type="button"
          :style="{ background: color }"
          :aria-label="`强调色 ${color}`"
          @click="settings.saveAccent(color)"
        />
        <label class="swatch swatch--picker" aria-label="自定义强调色">
          <input
            type="color"
            :value="settings.accent"
            @change="settings.saveAccent(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </section>

    <section class="section">
      <h3 class="section__title">收藏按钮</h3>
      <p class="field__hint">把下面这个按钮拖到浏览器书签栏，在任意网页点它就能存到本站</p>
      <div class="bookmarklet">
        <!-- 点它会在这里执行 javascript:，所以拦住默认行为，只让拖拽生效 -->
        <a class="bookmarklet__link" :href="bookmarklet" draggable="true" @click.prevent>＋ 存到书签</a>
      </div>
    </section>

    <section class="section">
      <h3 class="section__title">图标</h3>
      <div class="repair">
        <p class="field__hint">
          {{ missingIcons === 0 ? '所有书签都有图标' : `有 ${missingIcons} 个书签还没有图标，可以让服务器再抓一次` }}
        </p>
        <button class="btn" type="button" :disabled="repairing || missingIcons === 0" @click="repairIcons">
          {{ repairing ? '正在补抓…' : '补抓缺失图标' }}
        </button>
      </div>
      <div v-if="repairReport" class="repair__report" role="status">
        <p>补抓 {{ repairReport.total }} 个：成功 {{ repairReport.succeeded }}，失败 {{ repairReport.failed.length }}</p>
        <ul v-if="repairReport.failed.length > 0" class="repair__list">
          <li v-for="item in repairReport.failed" :key="item.id">
            <span class="repair__name">{{ item.title }}</span>
            <span class="repair__reason">{{ item.reason }}</span>
          </li>
        </ul>
        <p v-if="repairReport.failed.length > 0" class="field__hint">
          失败的可以在书签的「编辑」里上传图片，或点「从公共服务获取」
        </p>
      </div>
    </section>

    <section class="section">
      <h3 class="section__title">导入</h3>
      <ImportSection @imported="emit('imported')" />
    </section>

    <section class="section">
      <button class="btn btn--danger" type="button" @click="emit('logout')">退出登录</button>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  gap: 22px;
}

.section {
  display: grid;
  gap: 10px;
}

.section + .section {
  padding-top: 18px;
  border-top: 1px solid var(--stroke);
}

.section__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-2);
  background: rgb(255 255 255 / 0.06);
  border: 1px solid var(--stroke);
  border-radius: var(--r-pill);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}

.chip:hover {
  background: rgb(255 255 255 / 0.12);
  color: var(--text);
}

.chip.is-on {
  color: #10131a;
  background: var(--accent);
  border-color: transparent;
  font-weight: 600;
}

.custom {
  display: grid;
  gap: 0;
  margin-top: 4px;
}

.swatch {
  width: 28px;
  height: 28px;
  border: 2px solid transparent;
  border-radius: var(--r-pill);
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.swatch:hover {
  transform: scale(1.08);
}

.swatch.is-on {
  border-color: var(--text);
}

/* 自定义颜色：把原生 color input 铺满整个圆点 */
.swatch--picker {
  position: relative;
  overflow: hidden;
  background: conic-gradient(#e8c87a, #7fd1ae, #8ab4f8, #e79ab5, #c9a0ff, #e8c87a);
}

.swatch--picker input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.bookmarklet__link {
  display: inline-block;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text);
  background: var(--glass-card);
  border: 1px dashed var(--stroke-strong);
  border-radius: 10px;
  cursor: grab;
}

.bookmarklet__link:hover {
  background: var(--glass-card-hover);
}

.repair {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.repair .btn {
  flex: 0 0 auto;
}

.repair__report {
  display: grid;
  gap: 8px;
  font-size: 12px;
}

.repair__list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 10px;
  list-style: none;
  background: rgb(0 0 0 / 0.2);
  border-radius: 10px;
}

.repair__list li {
  display: grid;
  gap: 1px;
}

.repair__name {
  color: var(--text);
}

.repair__reason {
  color: var(--text-3);
}
</style>
