<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Group } from '@/types'

const props = defineProps<{
  /** 有值表示编辑，无值表示新增 */
  group?: Group | null
}>()

const emit = defineEmits<{ saved: []; cancel: [] }>()

const data = useDataStore()

const isEdit = computed(() => props.group != null)
const name = ref(props.group?.name ?? '')
const icon = ref(props.group?.icon ?? '')

const saving = ref(false)
const error = ref<string | null>(null)
const confirmingDelete = ref(false)

const others = computed(() => data.groups.filter((group) => group.id !== props.group?.id))
const moveTo = ref(others.value[0]?.id ?? '')

const bookmarkCount = computed(() => {
  const group = props.group
  return group == null ? 0 : data.bookmarks.filter((item) => item.groupId === group.id).length
})

const canSave = computed(() => !saving.value && name.value.trim() !== '')

async function save(): Promise<void> {
  if (!canSave.value) {
    error.value = '分组名不能为空'
    return
  }

  saving.value = true
  error.value = null
  const payload = {
    name: name.value.trim(),
    icon: icon.value.trim() === '' ? null : icon.value.trim(),
  }

  const ok =
    props.group != null
      ? await data.updateGroup(props.group.id, payload)
      : (await data.createGroup(payload)) !== null

  saving.value = false
  if (ok) emit('saved')
}

/** @param deleteBookmarks true 表示组内书签一起删，false 表示迁到 moveTo */
async function remove(deleteBookmarks: boolean): Promise<void> {
  const group = props.group
  if (group == null) return

  saving.value = true
  const ok = await data.removeGroup(group.id, deleteBookmarks ? undefined : moveTo.value)
  saving.value = false
  if (ok) emit('saved')
}
</script>

<template>
  <form class="form" @submit.prevent="save" @keydown.enter.prevent="save">
    <div class="field">
      <label class="field__label" for="grp-name">分组名</label>
      <input id="grp-name" v-model="name" class="input" type="text" placeholder="比如「开发工具」" />
    </div>

    <div class="field">
      <label class="field__label" for="grp-icon">图标</label>
      <input
        id="grp-icon"
        v-model="icon"
        class="input"
        type="text"
        placeholder="可选，一个 emoji"
        maxlength="4"
      />
    </div>

    <p v-if="error" class="field__error" role="alert">{{ error }}</p>

    <template v-if="!confirmingDelete">
      <div class="btn-row">
        <button class="btn" type="button" @click="emit('cancel')">取消</button>
        <button class="btn btn--primary" type="submit" :disabled="!canSave">
          {{ saving ? '保存中…' : isEdit ? '保存修改' : '创建分组' }}
        </button>
      </div>

      <div v-if="isEdit" class="zone">
        <button class="btn btn--danger" type="button" @click="confirmingDelete = true">删除分组</button>
      </div>
    </template>

    <!-- 删除是不可逆的，先问清楚组内书签怎么处理 -->
    <div v-else class="zone zone--confirm">
      <p class="confirm__title">
        删除「{{ props.group?.name }}」？组内还有 {{ bookmarkCount }} 个书签。
      </p>

      <template v-if="bookmarkCount > 0 && others.length > 0">
        <label class="field__label" for="grp-move">把这些书签移到</label>
        <select id="grp-move" v-model="moveTo" class="select">
          <option v-for="other in others" :key="other.id" :value="other.id">
            {{ other.icon ? `${other.icon} ` : '' }}{{ other.name }}
          </option>
        </select>
        <button class="btn btn--primary" type="button" :disabled="saving" @click="remove(false)">
          移到该分组并删除
        </button>
        <button class="btn btn--danger" type="button" :disabled="saving" @click="remove(true)">
          连同书签一起删掉
        </button>
      </template>

      <template v-else-if="bookmarkCount > 0">
        <p class="field__hint">没有别的分组可以接收，只能连同书签一起删掉。</p>
        <button class="btn btn--danger" type="button" :disabled="saving" @click="remove(true)">
          连同书签一起删掉
        </button>
      </template>

      <button v-else class="btn btn--danger" type="button" :disabled="saving" @click="remove(true)">
        删除这个空分组
      </button>

      <button class="btn" type="button" :disabled="saving" @click="confirmingDelete = false">
        返回
      </button>
    </div>
  </form>
</template>

<style scoped>
.zone {
  display: grid;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--stroke);
}

.zone--confirm {
  gap: 10px;
}

.confirm__title {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}
</style>
