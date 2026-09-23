<script setup lang="ts">
import { ref } from 'vue'
import { api, describeError } from '@/api/client'
import { useToast } from '@/composables/useToast'
import type { ImportResult } from '@/types'

const emit = defineEmits<{ imported: [] }>()

const toast = useToast()
const busy = ref(false)

const htmlInput = ref<HTMLInputElement | null>(null)
const jsonInput = ref<HTMLInputElement | null>(null)

function report(result: ImportResult): void {
  if (result.bookmarks === 0) {
    toast.show('没有新的书签可导入，可能与现有的重复')
    return
  }
  toast.show(`导入完成：新增 ${result.groups} 个分组、${result.bookmarks} 个书签`)
}

async function run(task: () => Promise<ImportResult>): Promise<void> {
  busy.value = true
  try {
    report(await task())
    emit('imported')
  } catch (error) {
    toast.error(describeError(error))
  } finally {
    busy.value = false
  }
}

function pick(input: HTMLInputElement | null): void {
  input?.click()
}

async function takeFile(event: Event): Promise<File | null> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // 先清空，这样连续选同一个文件也能再次触发 change
  input.value = ''
  return file
}

async function onHtml(event: Event): Promise<void> {
  const file = await takeFile(event)
  if (file === null) return
  await run(() => api.importHtml(file))
}

async function onJson(event: Event): Promise<void> {
  const file = await takeFile(event)
  if (file === null) return

  // 在本地先解析，坏文件就别往服务端发了
  let payload: unknown
  try {
    payload = JSON.parse(await file.text())
  } catch {
    toast.error('这个文件不是合法的 JSON')
    return
  }
  await run(() => api.importLegacy(payload))
}
</script>

<template>
  <div class="import">
    <div class="import__row">
      <div class="import__text">
        <p class="import__title">浏览器书签 HTML</p>
        <p class="field__hint">Chrome / Edge / Firefox 导出的 .html，文件夹会变成分组</p>
      </div>
      <button class="btn" type="button" :disabled="busy" @click="pick(htmlInput)">选择文件</button>
    </div>

    <div class="import__row">
      <div class="import__text">
        <p class="import__title">旧站导出的 JSON</p>
        <p class="field__hint">旧站 /api/projects 保存下来的内容，category 会变成分组</p>
      </div>
      <button class="btn" type="button" :disabled="busy" @click="pick(jsonInput)">选择文件</button>
    </div>

    <input
      ref="htmlInput"
      class="import__input"
      type="file"
      accept="text/html,.html,.htm"
      @change="onHtml"
    />
    <input
      ref="jsonInput"
      class="import__input"
      type="file"
      accept="application/json,.json"
      @change="onJson"
    />
  </div>
</template>

<style scoped>
.import {
  display: grid;
  gap: 12px;
}

.import__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgb(0 0 0 / 0.22);
  border: 1px solid var(--stroke);
  border-radius: 12px;
}

.import__text {
  min-width: 0;
}

.import__title {
  font-size: 13px;
}

.import__row .field__hint {
  margin-top: 2px;
}

/* 文件选择靠按钮触发，原生控件藏起来 */
.import__input {
  display: none;
}
</style>
