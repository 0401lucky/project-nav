import { ref } from 'vue'
import { parseCollapsedGroups } from '@/composables/groupCollapse'

const STORAGE_KEY = 'nav.collapsedGroups.v1'
const collapsedIds = ref(new Set<string>())
let initialized = false

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedIds.value]))
  } catch {
    // 浏览器可能禁用存储或用完配额；内存中的偏好仍有效，不能回滚本次折叠。
  }
}

function isCollapsed(groupId: string): boolean {
  return collapsedIds.value.has(groupId)
}

function toggle(groupId: string): void {
  if (isCollapsed(groupId)) collapsedIds.value.delete(groupId)
  else collapsedIds.value.add(groupId)
  persist()
}

function expand(groupId: string): void {
  if (collapsedIds.value.delete(groupId)) persist()
}

/** 当前浏览器的共享 UI 偏好：登录切换及组件卸载不应清掉用户选择。 */
export function useGroupCollapse() {
  if (!initialized) {
    initialized = true
    try {
      collapsedIds.value = new Set(parseCollapsedGroups(localStorage.getItem(STORAGE_KEY)))
    } catch {
      // localStorage 的访问本身也可能抛错，保留默认内存状态继续启动。
    }
  }
  return { isCollapsed, toggle, expand }
}
