# 前端开发规范

> 本目录记录这个项目**真实生效**的前端约定。内容取自 `src/` 下实际存在的代码，
> 每一条都能在仓库里找到对应实现——不是理想化的最佳实践清单。

---

## 这个前端长什么样

单页应用，**没有路由**。`src/main.ts` 挂载 `App.vue`，登录屏 / 首页 / 滑出面板
全部由 `App.vue` 里的 `panel` 状态切换（`App.vue:36-59`）。

| 能力 | 选型 | 约束 |
| --- | --- | --- |
| 框架 | Vue 3.5 `<script setup>` + TypeScript strict | — |
| 构建 | Vite 8，别名 `@` → `src/` | — |
| 状态 | Pinia 4，只有 3 个 store | 不加第四个，见 [state-management.md](./state-management.md) |
| 样式 | 原生 CSS + CSS 变量 | 不引 Tailwind / CSS-in-JS / Sass |
| HTTP | 手写 `src/api/client.ts` | 不引 axios，组件不直接 `fetch` |
| 拖拽 | 原生 HTML5 DnD | 不引拖拽库 |
| 路由 | 无 | 不引 vue-router |
| 测试 | `node:test` + Playwright | 不引 Vitest / Jest |

**运行时依赖白名单**：`vue`、`pinia`、`hono`、`@hono/node-server`、`sharp`。
prd 把「依赖最少」列为非功能需求——新增任何运行时依赖前先说明理由。

## 性能预算（超出即视为回归）

- 首屏 JS gzip < 80KB（当前约 47.7KB；`vite.config.ts` 的 `manualChunks` 把 vendor 拆开以利长期缓存）
- 壁纸单张 ≤ 300KB，两档尺寸 + LQIP 占位
- `backdrop-filter` 只允许出现在三类容器上：分组面板、弹出面板、卡片悬停。
  这不是审美偏好——每个 `backdrop-filter` 都会新建层叠上下文和合成层，直接影响滚动帧率
- 不引动画库。动效一律走 `--dur` / `--ease` 两个令牌

## 规范索引

| 文件 | 内容 | 什么时候读 |
| --- | --- | --- |
| [directory-structure.md](./directory-structure.md) | 目录分层、文件命名、模块归属 | 新建文件前 |
| [component-guidelines.md](./component-guidelines.md) | 组件写法、props/emits、样式、层叠、无障碍 | 写改 `.vue` 前 |
| [hook-guidelines.md](./hook-guidelines.md) | composable 的两种形态、纯逻辑拆分 | 写改 `src/composables/` 前 |
| [state-management.md](./state-management.md) | 三个 store、乐观更新、服务端状态同步 | 写改 `src/stores/` 前 |
| [quality-guidelines.md](./quality-guidelines.md) | 验证命令、禁用与必需模式、测试要求 | 提交前 |
| [type-safety.md](./type-safety.md) | 共享类型、运行时校验、断言边界 | 改类型定义前 |

## 与后端的边界

前后端共享类型的唯一出处是 `shared/types.ts`，两侧都从这里取。

- 前端**不得** import `server/` 下的任何模块，后端也不得 import `src/`
- 前端类型一律从 `@/types` 取（它只是 `shared/types.ts` 的再导出），
  不要在组件里写 `../../shared/types` 这种相对路径
- 跨层数据流的核对清单见 [../guides/cross-layer-thinking-guide.md](../guides/cross-layer-thinking-guide.md)

---

**语言**：本目录文档使用简体中文，与项目其余产出（`README.md`、代码注释、提交信息）一致。
