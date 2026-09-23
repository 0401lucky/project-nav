# 状态管理

> Pinia setup store，只有三个。这份文档的重心在**乐观更新**和**服务端状态的同步规则**，
> 它们是这个项目里最容易写错的部分。

---

## 三个 store

| store | 负责 | 生命周期 |
| --- | --- | --- |
| `useAuthStore` | 登录态、密码错误、锁定状态 | 登出时由调用方 `data.reset()` / `settings.reset()` 配合 |
| `useDataStore` | 分组与书签的全量数据 | 登录后 `applyBootstrap` 一次性灌入 |
| `useSettingsStore` | 设置、壁纸清单、壁纸选择模型 | 同上 |

全部用 setup 语法，不用 options 语法：

```ts
export const useDataStore = defineStore('data', () => {
  const groups = ref<Group[]>([])
  const byGroup = computed<GroupWithBookmarks[]>(() => { /* ... */ })
  function applyBootstrap(payload: BootstrapResponse): void { /* ... */ }

  return { groups, bookmarks, loaded, byGroup, applyBootstrap, /* ... */ }
})
```

---

## 加第四个 store 之前

`design.md` 只规划了这三个。搜索状态（`useFilter`）和提示队列（`useToast`）
都**没有**做成 store——它们各自只在两处用到，用模块级 `ref` 就够了。

判断顺序：

1. 只有当前组件用 → 组件内 `ref`
2. 两三个组件用、不涉及持久或跨页面 → 模块级 `ref` 的 composable（见 [hook-guidelines.md](./hook-guidelines.md)）
3. 跨页面存活、或本身就是服务端数据 → store

---

## 状态分类

| 类别 | 存在哪 | 例子 |
| --- | --- | --- |
| 服务端数据 | store | `groups`、`bookmarks`、`settings`、`wallpapers` |
| 跨组件 UI 状态 | store 或模块级 ref | `auth.loggedIn`、`useFilter.query` |
| 组件局部 UI 状态 | 组件内 `ref` | `App.vue` 的 `panel`、`BookmarkForm` 的 `saving` |
| 派生数据 | `computed`，**不要**另存一份 | `byGroup`、`currentWallpaper`、`visibleByGroup` |

派生状态永远从源数据算，不要用 `watch` 同步出第二份 ref——那会立刻产生一致性问题。

---

## 服务端状态

### 只拉一次

首页登录后只发一次 `/api/bootstrap`，拿到全量数据：

```ts
async function loadAll(): Promise<void> {
  const payload = await api.bootstrap()
  data.applyBootstrap(payload)
  settings.applyBootstrap(payload)
}
```

之后所有改动都在本地改。没有轮询、没有重新拉取（导入完成后会再调一次 `loadAll`）。

### 写操作一律乐观更新

固定三段式，三个 store 都一样：

```ts
async function createBookmark(input: BookmarkInput): Promise<Bookmark | null> {
  const snap = snapshot()                          // 1. 先存快照
  try {
    const created = await api.createBookmark(input)
    bookmarks.value = [...bookmarks.value, created] // 2. 成功就落地
    return created
  } catch (error) {
    handleFailure(error, snap)                     // 3. 失败回滚 + 提示 + 处理 401
    return null
  }
}
```

有些操作要先改本地再发请求（`updateGroup`、`removeGroup`、`applyBookmarkOrder`），
顺序是「快照 → 改本地 → 发请求 → 失败 `handleFailure`」，快照照样要存。

```ts
function handleFailure(error: unknown, snap: Snapshot): void {
  restore(snap)
  if (error instanceof UnauthorizedError) useAuthStore().markUnauthorized()
  toast.error(describeError(error))
}
```

`handleFailure` 是三件事的合并：回滚、会话失效退回登录屏、把错误翻译成一句人话。
**任何写操作失败都必须走它**，不要各写一份。

### 成功后以服务端返回为准

```ts
const updated = await api.updateGroup(id, patch)
// 以服务端返回为准，避免本地推断和真实结果有偏差
groups.value = groups.value.map((group) => (group.id === id ? updated : group))
```

本地推断的 `updatedAt`、`sortOrder` 可能和服务端算出来的不一致，能覆盖就覆盖。

### 写操作的返回类型约定

| 返回 | 含义 | 调用方怎么用 |
| --- | --- | --- |
| `Promise<boolean>` | 改/删是否成功 | `if (ok) closePanel()` |
| `Promise<Group \| null>` | 创建的分组，失败为 `null` | `if (created !== null)` |
| `Promise<Bookmark \| null>` | 创建的书签，失败为 `null` | 表单里判断是否关闭面板 |

调用方靠返回值决定后续动作（关面板、跳转），**不要**靠 `try/catch` 包 store 方法——
错误已经处理过了，不会往外抛。

### 顺序只在本地数组里体现

`bookmarks` 数组的次序就是显示次序，`byGroup` **只做分区、不重排**：

```ts
/** 按分组分区，保持数组原有次序；空分组也保留，否则新建分组看不见 */
const byGroup = computed<GroupWithBookmarks[]>(() => { /* ... */ })
```

好处是本地重排只要重排数组，不用在客户端复刻服务端的 `sort_order` 计算规则。
翻倍/中位数的排序算法只存在于服务端（`server/lib/order.ts`）。

重排的纯逻辑在 `composables/drag.ts`，改这部分先读它顶部的注释。

---

## 401 的处理

`api/client.ts` 默认把 401 当「会话失效」，抛 `UnauthorizedError`。
但**登录接口必须显式关掉**这个行为：

```ts
login: (password: string) =>
  request<void>('POST', '/api/auth/login', { password }, { sessionExpiryOn401: false }),
```

否则「密码错误」（服务端也返回 401）会被翻译成「登录已失效，请重新登录」，
用户看到的是错误的提示。

`UnauthorizedError` 冒泡到 store 后由 `handleFailure` / `reportFailure` 调
`auth.markUnauthorized()`，整站退回登录屏。

---

## 壁纸的选择模型

`settings.wallpaper` 存的是壁纸行的 `id`，不是「第几张」。内置壁纸横竖成对（`pairId`），
所以选中一行之后还要按屏幕方向挑：

```ts
/** 取某个方向的壁纸：选中项本身就是就返回它，否则从同一 pairId 里找 */
function atOrientation(orientation: WallpaperOrientation): Wallpaper | null { /* ... */ }
```

- 选中项被删或从未选过 → `currentWallpaper` 回落到第一张（首屏不会没背景）
- 上传的壁纸 `pairId` 为 `null` → 只有自己一张，没有配对
- 删除当前选中的壁纸时，本地要把 `wallpaper` 置空，服务和后端行为对齐

---

## 常见错误

### 乐观更新漏了回滚

每个 `try` 之前都要有 `const snap = snapshot()`。漏掉后接口一失败，界面上就留着
一条并不存在的书签，刷新才消失。

### 回滚时把别人的改动也吞了

`snapshot()` 存的是数组副本（`[...groups.value]`），`restore()` 整个换回去。
如果失败期间用户又做了别的操作，那些操作会被一起回滚——单人站点可接受，
但如果将来加了并发操作，要改成按 id 精确回滚。

### `reset()` 漏清字段

登出要清干净。`useSettingsStore.reset()` 里**故意保留** `wallpapers`：
壁纸清单是公开构建产物，登录屏也要用。敏感字段（`bookmarkletToken`）必须清。

### 在组件里直接改 store 的数组

`data.groups.push(...)` 绕过 store 方法就没有乐观更新的失败回滚。
所有改动都通过 store 暴露的方法。

### 以为 `loaded` 和登录态是一回事

`loaded` 表示数据到了，`auth.loggedIn` 表示会话有效。未登录时 `loaded` 是 `false`，
`BookmarkGrid` 靠它避免空状态一闪而过。
