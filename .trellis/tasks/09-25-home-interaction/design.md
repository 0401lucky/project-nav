# 首页操作易用性 · 技术设计

纯前端改动：不动服务端、不动共享类型、不加依赖。

## 1. 删除撤销（R1、R2）

### store（`src/stores/data.ts`）

```ts
const UNDO_MS = 5000
interface PendingDelete { bookmark: Bookmark; nextId: string | null; timer: ReturnType<typeof setTimeout> }
const pending = new Map<string, PendingDelete>()   // 不放进响应式：UI 不需要看它

removeBookmark(id): void            // 本地移除 + 记下同组后一条的 id + 定时提交 + 弹撤销提示
undoRemove(id): void                // 清定时器，插回原位
flushPendingDeletes(): Promise<void>// 立刻提交全部待删除项，供其他操作前调用
```

- **插回原位**：记同组里「后一条」的 id；撤销时插到它前面，它也不在了就放到该组末尾（复用 `moveToGroupEnd`）。所在分组已不存在就放弃撤销。
  **不用** `snapshot()/restore()`：5 秒后整表回滚会吞掉这期间的其他改动（spec「回滚时把别人的改动也吞了」）。
- **提交**：`api.deleteBookmark(id)`；404 视为成功（比如所在分组已被删）；401 走 `markUnauthorized`；其他失败按「撤销」的方式插回，并 `toast.error`。
- **先提交再操作**：`applyBookmarkOrder`、`removeGroup`、`reloadBookmarks` 开头 `await flushPendingDeletes()`；`App.vue` 的 `reload()`、`logout()` 同样先 flush。`reset()` 清定时器与 Map。
- 返回值从 `Promise<boolean>` 改为 `void`（调用方 `App.vue:79-81` 本来就没用返回值）。

### 提示条（`useToast.ts`、`Toast.vue`）

- `useToast` 增加 `action(message, label, run, durationMs)`，`ToastItem` 增加可选 `action: { label; run }`。
- `Toast.vue` 的每条从 `<button>` 改成容器：文字部分点了仍然关闭，另起一个「撤销」按钮（按钮里不能套按钮）。点「撤销」先 `dismiss` 再 `run`。
- 撤销提示的时长就用 `UNDO_MS`，与提交定时器一致。

## 2. 拖整张卡片 / 标题栏（R3）

- `BookmarkCard.vue`：删除 `.card__handle`，改在 `<a class="card">` 上 `:draggable="drag ? 'true' : undefined"` 并绑定 `dragstart/dragend`。不传 `drag` 时不写属性，保留浏览器默认行为。拖动时给卡片加 `is-dragging`（降低不透明度），代替原来的手柄视觉反馈。
- `GroupPanel.vue`：删除 `.panel__handle`，`<header>` 在可拖时 `draggable="true"`。用 `pointerdown` 记下按下点是否在 `button` 内，是的话在 `dragstart` 里 `preventDefault()`。标题栏可拖时鼠标显示 `grab`。
- **窄屏不可拖**：`useDrag` 增加 `narrow`（`matchMedia('(max-width: 640px)')` 加 change 监听），对外暴露 `canDrag = enabled && !narrow`。GroupPanel 过滤时或 `!canDrag` 时不传 `drag`、标题栏不设 draggable。断点与 CSS 保持一致。
- 落点计算、`planDrop`、store 重排都不变。

## 3. 菜单直接选分组（R4）

- `BookmarkCard.vue` 直接 `useDataStore()` 取 `groups`，过滤掉当前分组；emit 从 `move: []` 改为 `move: [groupId: string]`。
- 菜单结构：编辑 / 分隔线 + 小标题「移到分组」+ 分组项（`role="menuitem"`）/ 分隔线 + 删除。只有一个分组时不显示这一节。
- 菜单 `max-height` 按视口剩余空间计算、`overflow-y: auto`；按钮下方空间不足（< 240px）时改为向上展开。
- `CardActions.move(bookmark, groupId)`；`App.vue` 调 `data.updateBookmark(id, { groupId })`，成功后 `toast.show('已移到「分组名」')`。删除 `move-bookmark` 面板、`moveTargetId`、`confirmMove` 及对应模板和 footer。

## 4. 搜索 ↑↓ 与主动搜索引擎（R5、R6）

- `filter.ts`（纯函数，可单测）：`stepIndex(current, delta, length)` 在 `[0, length-1]` 内夹住，不循环；`length=0` 返回 0。
- `useFilter.ts`：模块级 `activeIndex`；`visibleList` = `visibleByGroup` 展平；`activeBookmark` = 有匹配时的 `visibleList[activeIndex]`，否则为 null；`watch(query)` 把 `activeIndex` 归 0。`firstVisible` 由 `activeBookmark` 取代（仅 SearchBox 使用）。
- `SearchBox.vue`：
  - `@keydown.down/up`：有匹配时 `preventDefault` 并移动 `activeIndex`；没有匹配时不处理。
  - `onEnter`：`event.shiftKey` → `searchWeb()`；否则有匹配就打开 `activeBookmark`，无匹配就 `searchWeb()`。保留 `isComposing` / `keyCode 229` 判断。
  - 有内容时在清空按钮左侧显示「用 {settings.searchEngine.name} 搜」按钮，点击 → `searchWeb()`。
  - 提示行：有匹配时显示「回车打开「X」 · Shift+回车 用 {name} 搜」；无匹配时文案不变。
- `GroupPanel.vue` 给卡片传 `active`（`activeBookmark?.id === bookmark.id`）；`BookmarkCard.vue` 用 `is-active` 类显示强调色描边，并在 `active` 变 true 时 `scrollIntoView({ block: 'nearest' })`。

## 兼容与回滚

- 数据与接口不变，回滚即回退前端代码。部署仍是整镜像替换，沿用部署记录里的回滚 tag 流程。
- 性能：不新增依赖，增量只有几百行组件代码，首屏 JS 仍远低于 80KB（现约 47.7KB）。
