# 组件规范

> `.vue` 文件怎么写：结构、props/emits、数据来源、样式、层叠与无障碍。

---

## 文件结构

固定三段，中间可以有多个 `<script>`：

```vue
<script setup lang="ts">
// 第一段：所有逻辑。导入 → props/emits → 状态 → 计算属性 → 函数
</script>

<template>
  <!-- 第二段 -->
</template>

<style scoped>
/* 第三段，永远 scoped */
</style>
```

需要**模块级**共享状态时才在 `<script setup>` 前再加一个普通 `<script>`：

```vue
<!-- BookmarkCard.vue：同一时刻只开一个卡片菜单，所以开关放在模块作用域，所有卡片共享 -->
<script lang="ts">
import { ref } from 'vue'
const openMenuId = ref<string | null>(null)
</script>

<script setup lang="ts">
// ref 已由上面的普通 <script> 导入，两块同处一个模块作用域，重复导入会报错
import { computed, onBeforeUnmount, watch } from 'vue'
```

两块处于同一个模块作用域——上面已导入的标识符不要在下面重复导入（`vue-tsc` 会报错）。
如果状态不属于「所有实例共享」，就该用普通 `ref` 放在 `<script setup>` 里，别用这个模式。

---

## Props 与 Emits

用泛型声明，不用运行时对象写法：

```ts
const props = defineProps<{
  bookmark: Bookmark
  /** 当前搜索命中的标题区间，未搜索时为空 */
  highlight?: HighlightRange[]
  /** 拖拽手柄的事件绑定；不传就不显示手柄（触屏、搜索结果里都不需要） */
  drag?: { onStart: (event: DragEvent) => void; onEnd: () => void }
}>()

const emit = defineEmits<{ edit: []; remove: []; move: [] }>()
```

- 可选的用 `?`，并把「不传会怎样」写进注释。`drag` 不传 = 不渲染手柄，这就是控制显示的方式
- 不用 `withDefaults()`——需要默认值时在函数体里 `props.size ?? 32`
- 需要向父组件暴露方法时用 `defineExpose({ focus })`（`SearchBox.vue`），父组件拿 `ref` 调用

**回调优先于事件透传**：需要往下传「点击后做什么」，传函数比让每一层都 `emit` 上去短。
`BookmarkCard` 的 `drag` prop 就是这种形态。

---

## 数据从哪来

按这个顺序选：

1. **store** —— 分组、书签、设置、登录态。组件直接 `useDataStore()`，不做 prop 透传
2. **composable** —— 搜索状态用 `useFilter()`，提示用 `useToast()`
3. **props** —— 只传「这一份数据」和「回调」。`GroupPanel` 收 `entry`，不自己去 store 里捞
4. **provide/inject** —— 跨三层以上，且每层都传会撑大接口时。见下

### provide/inject 的使用条件

`App → BookmarkGrid → GroupPanel → BookmarkCard` 四层，拖拽控制器必须全局唯一，
卡片动作又要冒回 `App` 开面板。这两样走 prop 会把中间两层的接口撑大，
所以用一份 `HomeContext`（`composables/homeContext.ts`）：

```ts
// App.vue：建一次
provideHomeContext({ drag, actions })

// 任意后代组件
const { drag, actions } = useHomeContext()
```

`useHomeContext()` 在树外调用会直接抛错，而不是返回 `undefined` 让你在别处崩。
新增这种上下文时照此办理——**注入缺失必须显式失败**。

---

## 模板约定

```vue
<button class="panel__action" type="button" @click="actions.addBookmark(entry.group)">添加</button>
```

- 每个 `<button>` 都写 `type="button"`。表单里的提交按钮才用 `type="submit"`
- 只含图标的按钮必须有 `aria-label`；有可见文字的按钮不需要
- `<svg>` 一律加 `aria-hidden="true"`（读屏念不出路径数据）
- 装饰性图片 `alt=""`，不写字面量 `alt`
- `v-for` 必须有 `:key`，用稳定 id 而不是下标
- 门面组件（`SlidePanel`）用具名插槽 `#footer`，且用 `$slots.footer` 判断存在性

---

## 样式

### 只使用令牌

`styles/tokens.css` 是颜色、圆角、时长、留白的唯一出处。组件里不写字面量：

```css
.panel {
  padding: 14px;
  background: var(--glass-panel);
  border: 1px solid var(--stroke);
  border-radius: var(--r-panel);
  backdrop-filter: blur(var(--blur-panel));
  transition: border-color var(--dur) var(--ease);
}
```

例外是布局数值（`width: 150px`、`gap` 的具体值）和一次性颜色（`rgb(255 180 180)`）。
新增可复用的颜色/尺寸时，加进 `tokens.css` 而不是复制到第二个组件。

### 三类容器才准用 backdrop-filter

分组面板 `.panel`、弹出面板 `.sheet` / `.card-menu` / `.toast`、卡片悬停。
别处需要半透明背景就用 `--glass-*` 变量配 `rgb()`，不要加模糊。

### 移动端

`@media (max-width: 640px)` 里的调整必须解决三个具体问题，不是简单缩小：

- 触屏没有 hover —— 靠 hover 显形的控件要么常显，要么不渲染。
  `BookmarkCard` 在窄屏把 `.card__more` 改成常显，`:hover` 在触屏上永远触发不了
- 竖排分辨率下卡片只有约 100px 宽 —— 从横排改竖排（`flex-direction: column`）
- 拖拽手柄直接 `display: none`（prd 把移动端拖拽列为不在范围内）

`tokens.css` 里的媒体查询已经把 `--page-x`、`--blur-panel` 等整体降档，
组件里再写媒体查询前先确认变量解决不了。

---

## 层叠与绘制顺序

这是本项目最容易出隐蔽 bug 的地方，改动前务必读完本节。

### 全局层级表

| 层 | 元素 | 值 |
| --- | --- | --- |
| 壁纸 | `.wallpaper`（fixed, inset 0） | `0`，在 `.app` **之外** |
| 内容 | `.app` | `1` |
| 浮动按钮 | `.app__fab` | `5` |
| 滑出面板 | `.sheet-root` | `30` |
| 提示 | `.toasts` | `40` |
| 卡片菜单 | `.card-menu`（Teleport 到 body） | `60` |

### 铁律一：壁纸必须渲染在 `.app` 外面

`App.vue` 的模板里 `<Wallpaper />` 在 `<div class="app">` **之前**，这是有原因的：

`.app` 自身是 `z-index: 1` 的层叠上下文。壁纸如果放在它内部，就成了「定位元素 + z-index: 0」，
按 CSS 绘制顺序，定位元素（第 6 层）会盖住非定位的静态内容（第 3、5 层）。
而壁纸的 scrim 不透明，后果是静态块**一个像素都画不出来，也点不到**——
搜索框、连接失败提示、空状态全部消失，且没有任何报错。

同样的事发生过一次（`fix(web): 搜索框被壁纸层盖住`）。判断元素是否真的可见，
不能用「元素存在」，要用 `elementFromPoint`——见 [quality-guidelines.md](./quality-guidelines.md)。

### 铁律二：`backdrop-filter` 会新建层叠上下文

用了 `backdrop-filter` 的组件（分组面板、卡片菜单）内部，`z-index` **只在自身上下文内比较**。
DOM 中靠后的面板会整块盖在它上面，调多大都没用。

所以卡片菜单必须 Teleport 出去：

```vue
<!-- BookmarkCard.vue：菜单留在卡片里时，会被后面的分组面板盖住 -->
<Teleport to="body">
  <div v-if="menuOpen" class="card-menu" role="menu">…</div>
</Teleport>
```

Teleport 之后 `z-index` 只跟 `.card-menu` 自己的值（60）有关。代价是：
`position: fixed` 不跟随滚动，所以滚动、改窗口大小、点别处都要主动收起。

### 铁律三：不靠「加 z-index」绕过问题

遇到「被盖住」，先回答：祖先里谁建了层叠上下文？是被谁挡的？
直接加 `z-index` 在跨上下文时无效，只会让下一个改这块代码的人更困惑。

---

## 无障碍

现有做法（新增组件请照此）：

| 场景 | 做法 |
| --- | --- |
| 滑出面板 | `role="dialog"` + `aria-modal="true"` + `aria-label`，再配 Tab 焦点陷阱 |
| 更多菜单 | `role="menu"` / `role="menuitem"`，按钮加 `aria-expanded` |
| 瞬时提示 | `role="status"` + `aria-live="polite"`，**不用** `role="alert"` |
| 表单错误 | `role="alert"`（`BookmarkForm.vue`），这是必须打断的情形 |
| 纯装饰元素 | `aria-hidden="true"` + 空的 `alt` |
| 拖拽手柄 | `role="button"` + `aria-label="拖动排序"` + `tabindex="-1"` |
| 只给读屏的文字 | `.sr-only`（定义在 `base.css`） |

`:focus-visible` 的轮廓样式在 `base.css` 里全局定义了，组件不要覆盖掉。

### 可访问名字必须互不相同的提醒

同一个界面里存在多个同名按钮时会互相干扰（自动化测试尤其容易选错）。
壁纸选择格子曾经把 `aria-label` 写成内部徽章文字「自定义」，和搜索引擎里的
「自定义」按钮撞车。给可访问名字时带上上下文，例如「使用自定义壁纸」。

---

## 常见错误

### 「元素存在」不等于「被绘制」

`getBoundingClientRect()` 返回正常尺寸，元素照样可能被上层不透明的东西完全盖住，
或者因为祖先层叠上下文而根本没画出来。用 `elementFromPoint` 验证，别用 `boundingBox`。

### 菜单打开后点别处收不起来

`openMenu` 里的 `stopPropagation` 不能省。省掉后点击会冒泡到 `document`，
刚打开就被自己的 `dismiss` 关掉。代价是「点另一张卡片的更多按钮」也收不到——
所以开关状态放在模块级共享（`openMenuId`），由它来保证互斥。

### 在 `<script setup>` 里再导入一次上面普通 `<script>` 已导入的符号

两块共享模块作用域，重复导入会直接报错。看 `BookmarkCard.vue` 顶部那行注释。

### `v-model` 绑定的输入框里按 `/` 没反应

全局快捷键 `useHotkeys` 已经用 `isTyping()` 挡掉了输入框内的 `/`；
组件内的局部按键用 `@keydown` 自己处理，不要往全局堆。

### 表单面板切换时残留上一条数据

`App.vue` 给表单加了 `:key="activeBookmark?.id ?? 'new-bookmark'"`。
新增面板时记得加 key，否则编辑完 A 再编辑 B，表单里还是 A 的内容。
