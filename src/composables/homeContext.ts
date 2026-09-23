// 首页的共享上下文。
//
// 拖拽控制器必须全局唯一，卡片操作又要从卡片冒到 App 去开面板，
// 而 App → BookmarkGrid → GroupPanel → BookmarkCard 有四层。
// 层层传 prop 会把每个组件的接口都撑大，所以用 provide/inject 传一份。

import { inject, provide } from 'vue'
import type { DragController } from '@/composables/useDrag'
import type { Bookmark, Group } from '@/types'

export interface CardActions {
  edit: (bookmark: Bookmark) => void
  remove: (bookmark: Bookmark) => void
  move: (bookmark: Bookmark) => void
  addBookmark: (group: Group) => void
  editGroup: (group: Group) => void
}

export interface HomeContext {
  drag: DragController
  actions: CardActions
}

const KEY = Symbol('home-context')

export function provideHomeContext(context: HomeContext): void {
  provide(KEY, context)
}

export function useHomeContext(): HomeContext {
  const context = inject<HomeContext | null>(KEY, null)
  if (context === null) {
    throw new Error('useHomeContext 只能在首页组件树里用（App.vue 里 provide）')
  }
  return context
}
