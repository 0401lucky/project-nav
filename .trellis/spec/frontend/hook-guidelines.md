# Composable 规范

> 本项目用 Vue 3，所以叫 **composable** 不叫 hook。命名 `useXxx`，导出普通函数，
> 但**没有** React 那套调用规则——不要求每次渲染返回同一引用，也允许模块级状态。

---

## 两种形态，先选对再动手

| 形态 | 状态放哪 | 每次调用的结果 | 现有例子 |
| --- | --- | --- | --- |
| **A. 模块级共享** | 模块顶层 `const x = ref()` | 同一个引用，跨组件同步 | `useFilter`、`useToast` |
| **B. 实例级** | 函数体内 `const x = ref()` | 各自独立的一份 | `useDrag`、`useHotkeys` |

### A 形态：模块级共享

```ts
// useToast.ts —— 队列是全局的，任何地方 show 一下即可
const items = ref<ToastItem[]>([])
let nextId = 1

export function useToast() {
  return { items: readonly(items), show, dismiss, error: (m: string) => show(m, 'error') }
}
```

状态定义在函数**外面**，函数只负责返回引用。这样 `BookmarkForm` 和 `data` store
调用 `useToast()` 拿到的是同一份队列——不需要建 store，也不需要 provide。

对外暴露的只读状态用 `readonly()` 包一层，防止调用方直接 `items.value.push(...)`。

### B 形态：实例级

```ts
// useHotkeys.ts —— 每个调用者注册自己的处理器
export function useHotkeys(handlers: HotkeyHandlers): void {
  function onKeydown(event: KeyboardEvent): void { /* ... */ }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
```

用了 `onMounted` / `onBeforeUnmount` 的必须是 B 形态——生命周期钩子只能在组件
`setup` 期间注册。

### 什么时候「B 形态也要全局唯一」

`useDrag` 本身是 B 形态，但首页要求「同一时刻只有一份拖拽状态」，
于是它在 `App.vue` 里**只创建一次**，再用 provide/inject 往下传：

```ts
// App.vue
const drag = useDrag()
provideHomeContext({ drag, actions })
```

不要为了让它全局唯一就改成 A 形态——A 形态没有生命周期，而拖拽要在组件卸载时收尾。
需要「唯一 + 生命周期」时，就在顶层组件建一次再 provide。

---

## 纯逻辑必须拆出去

能写成纯函数的计算**不要**留在 composable 里，拆成同名的小写文件：

```
composables/drag.ts     ← reorder / planDrop / applyOrderWithin …纯函数
composables/useDrag.ts  ← 事件接线、拖拽状态、调用 drag.ts
composables/filter.ts   ← filterBookmarks / rangesOf / splitByHighlights …纯函数
composables/useFilter.ts← 搜索状态与响应式包装
```

判断标准：**参数只进、返回值只出，不碰 ref、不碰 DOM、不发请求** → 纯逻辑。

这样拆的收益是能测。`drag.ts` 和 `filter.ts` 被 `node:test` 直接执行，
项目不引 Vitest，这是前端唯一有单元测试的地方。

### 纯逻辑文件的硬性约束

```ts
// filter.ts 顶部
import type { Bookmark, Group } from '../types'
```

- **零运行时 import**。类型导入会被擦除，所以 `import type` 是允许的，其他一律不行
- **不能用 `@/` 别名**，`@` 在 node 里解析不了。只能写相对路径
- 测试文件导入时**要带 `.ts` 扩展名**：`import { filterBookmarks } from './filter.ts'`
- 参数用 `readonly T[]` 表达「不修改入参」，返回新数组

---

## 数据获取

**不在 composable 里发请求。** 全部走 `api/client.ts`：

```ts
// stores/data.ts —— store 调 api
const created = await api.createBookmark(input)

// components/panels/BookmarkForm.vue —— 表单直接调 api（抓取元信息，不落库）
const meta = await api.meta(target)
```

`api/client.ts` 是唯一 HTTP 出口，理由是集中处理三件事：错误形状、204 空响应、401。
绕过它自己 `fetch` 就会漏掉 401 → 退回登录屏的逻辑。

**唯一例外**是 `settings.loadPublicManifest()`：它 `fetch('/wallpapers/manifest.json')`，
因为登录屏也需要背景，而 `/api/bootstrap` 需要鉴权（prd 要求未登录访问任何 API 都被拒绝）。
这个文件是构建产物里的公开静态文件，不含敏感信息。新增类似需求前先确认这个前提成立。

### 异步竞态要自己守

`BookmarkForm.fetchMeta` 是范本——防抖 + 序号校验：

```ts
const seq = ++requestSeq
const meta = await api.meta(target)
if (url.value.trim() !== target) return   // 期间改了网址，这份结果已过期
// ...
finally { if (seq === requestSeq) fetching.value = false }  // 旧请求晚回来不许关掉 loading
```

任何「输入变化触发异步请求」的场景都要有这两道：**比对当前值**和**请求序号**。

---

## 命名

- 文件与函数同名：`useDrag.ts` → `export function useDrag()`
- 纯逻辑模块不带 `use` 前缀：`drag.ts`、`filter.ts`
- 返回对象而不是数组，调用处用解构：`const { query, clear } = useFilter()`
  （不用 `[query, clear]` 的元组形式，字段多了可读性会崩）
- 一个 composable 一个文件，不做 `index.ts` 桶文件

---

## 常见错误

### 在组件卸载时留下监听器

`window` / `document` / `matchMedia` 上的监听必须成对写：

```ts
onMounted(() => orientationQuery.addEventListener('change', syncOrientation))
onBeforeUnmount(() => orientationQuery.removeEventListener('change', syncOrientation))
```

`useHotkeys`、`Wallpaper.vue`、`BookmarkCard.vue` 都有这类成对代码，照抄即可。
`BookmarkCard` 额外在 `onBeforeUnmount` 里清理一遍「菜单打开时才挂的监听」——
即使 watch 已经处理过，多清一次是廉价保险。

### 把 ref 直接暴露给调用方

共享状态被外部随意改会很难排查。`useToast` 返回 `readonly(items)`，
写操作只从 `show` / `dismiss` 进去。A 形态的 composable 都应该这样。

### 以为 A 形态的状态会跟着组件销毁

A 形态的状态活在模块作用域，**永远不重置**。登录、登出这类场景必须显式清理
（`App.vue` 里 logout 会调 `data.reset()`、`settings.reset()`），
不要指望「组件没了状态就没了」。

### 用 composable 代替 store

只有两处用到、又不涉及跨页面生命周期的状态，用 A 形态 composable 就够。
加 store 的门槛见 [state-management.md](./state-management.md)。
