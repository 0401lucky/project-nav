# 目录结构

> 前端代码放在哪里、文件怎么命名、什么该跟什么放在一起。

---

## 实际布局

```
src/
├── main.ts                  应用入口：createApp + Pinia + 两份全局 CSS
├── App.vue                  根组件：登录态分流、面板状态机、全局快捷键、provide 首页上下文
├── types.ts                 共享契约的再导出（真正定义在 shared/types.ts）
├── env.d.ts                 Vite 客户端类型声明
│
├── api/
│   └── client.ts            唯一 HTTP 出口 + UnauthorizedError / ApiError + describeError
│
├── stores/                  Pinia，只有三个
│   ├── auth.ts              登录态、密码错误、锁定
│   ├── data.ts              分组与书签全量数据，乐观更新
│   └── settings.ts          设置、壁纸清单、壁纸选择模型
│
├── composables/             可复用逻辑，两种形态
│   ├── homeContext.ts       首页 provide/inject 契约（拖拽控制器 + 卡片动作）
│   ├── useDrag.ts           原生 HTML5 拖拽接线
│   ├── useFilter.ts         搜索状态与过滤结果
│   ├── useHotkeys.ts        全局快捷键
│   ├── useToast.ts          轻量提示队列
│   ├── drag.ts              重排纯逻辑（零运行时 import，可被 node:test 直接跑）
│   ├── drag.test.ts
│   ├── filter.ts            搜索匹配纯逻辑（同上）
│   └── filter.test.ts
│
├── components/
│   ├── home/                首页结构性组件
│   │   ├── TopBar.vue       顶栏：站名、新增、设置
│   │   ├── SearchBox.vue    搜索框，含回车分流逻辑
│   │   ├── BookmarkGrid.vue 空状态 + 分组面板的网格容器
│   │   ├── GroupPanel.vue   单个分组面板：标题行 + 卡片网格
│   │   ├── BookmarkCard.vue 书签卡片 + Teleport 出去的更多菜单
│   │   └── Wallpaper.vue    壁纸层：LQIP + picture/srcset + scrim
│   ├── login/
│   │   └── LoginScreen.vue
│   ├── panels/              滑出面板的内容
│   │   ├── SlidePanel.vue   面板外壳：遮罩、焦点陷阱、过渡
│   │   ├── BookmarkForm.vue
│   │   ├── GroupForm.vue
│   │   ├── SettingsPanel.vue
│   │   ├── WallpaperPicker.vue
│   │   └── ImportSection.vue
│   └── ui/                  无业务语义的基础件
│       ├── IconButton.vue
│       ├── FallbackIcon.vue 首字 + 域名哈希色块
│       └── Toast.vue
│
└── styles/
    ├── tokens.css           设计令牌的唯一出处
    └── base.css             重置、排版、表单与按钮基础件、.sr-only
```

`shared/types.ts` 与 `server/` 在 `src/` 之外——见 [index.md](./index.md#与后端的边界)。

---

## 模块归属：新文件该放哪

| 你要写的东西 | 放哪 | 判断依据 |
| --- | --- | --- |
| 有业务语义的界面块 | `components/home/`、`components/panels/`、`components/login/` | 按它出现在哪个界面区域分，不按技术类型分 |
| 无业务语义的通用件 | `components/ui/` | 换个项目也能原样用，才算 ui |
| 可复用的有状态逻辑 | `composables/useXxx.ts` | 被两个以上组件用，或逻辑本身够复杂 |
| 无状态的纯计算 | `composables/<名词>.ts` | 能写成纯函数就应该写成纯函数，见 [hook-guidelines.md](./hook-guidelines.md) |
| 跨页面存活的共享状态 | `stores/` | 先读 [state-management.md](./state-management.md)，多数情况**不该**新建 store |
| HTTP 调用 | `api/client.ts` 里加一个方法 | 不新建文件，也不在组件里直接 `fetch` |
| 设计令牌（颜色、圆角、时长） | `styles/tokens.css` | 组件里只引用变量，不写死数值 |
| 跨组件复用的基础样式（输入框、按钮） | `styles/base.css` | 只放「多个面板共用」的那一层，布局一律留给组件 |

图标一律内联 `<svg>`，不引图标库，不放 `assets/`。项目里没有图片资源目录，
唯一的静态资源是 `public/wallpapers/`（构建产物，由 `scripts/build-wallpapers.ts` 生成）。

---

## 命名约定

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 组件文件 | PascalCase，与组件名一致 | `BookmarkCard.vue` |
| composable | `useXxx.ts`，导出同名函数 | `useDrag.ts` → `useDrag()` |
| 纯逻辑模块 | 小写名词，不含 `use` 前缀 | `drag.ts`、`filter.ts` |
| store 文件 | 按领域命名，导出 `useXxxStore` | `data.ts` → `useDataStore` |
| 测试 | 与被测文件同目录，同名 + `.test.ts` | `filter.ts` → `filter.test.ts` |
| 类型文件 | `types.ts`（每个目录至多一个） | `src/types.ts` |
| CSS 类名 | BEM 风格：`块__元素`、状态用 `is-` 修饰 | `.card__title`、`.panel.is-dragging-over` |

CSS 类名用 `is-` 而不是 BEM 的 `--` 修饰符（`.toast.is-error`、`.icons__item.is-chosen`），
全项目统一，跟着现有代码写。

---

## 导入路径规则

```ts
// 跨目录引用一律走 @/ 别名
import { useDataStore } from '@/stores/data'
import BookmarkCard from '@/components/home/BookmarkCard.vue'

// 例外一：纯逻辑模块内部只能写相对路径，且要带 .ts 扩展名
// drag.ts / filter.ts 会被 node:test 直接执行，@ 别名在 node 里解析不了
import type { Bookmark, Group } from '../types'
// filter.test.ts
import { filterBookmarks } from './filter.ts'

// 例外二：类型契约从 @/types 取，不要直达 shared/
import type { Bookmark } from '@/types'
```

`src/` 里**不允许**出现 `import ... from '../server/...'` 或 `'../../server/...'`。

---

## 参考实现

写新代码时最值得照抄的三个文件：

- `src/composables/filter.ts` —— 纯逻辑模块该有的样子：零运行时 import、参数只进不出、注释解释取舍
- `src/stores/settings.ts` —— store 该有的样子：状态分类清楚、写操作带快照回滚
- `src/components/home/BookmarkCard.vue` —— 复杂组件该有的样子：模块级共享状态用独立的 `<script>`、样式令牌化、无障碍属性齐全
