# 质量规范

> 提交前跑什么、什么模式禁止、测试写到什么程度。

---

## 验证命令

改动前端后，按这个顺序跑（`package.json` 里的脚本）：

```bash
npm run typecheck   # vue-tsc（src/）+ tsc（server/）双工程，无输出即通过
npm test            # node:test，跑 server/**/*.test.ts 和 src/**/*.test.ts
npm run build       # 内含 typecheck，再跑 vite build + esbuild 打包服务端
npm run e2e         # Playwright，需要一个已起好的实例（见下）
```

**项目没有配置 ESLint / Prettier。** 类型检查就是主要防线——`tsconfig.json` 开了
`strict`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`，
这些是真会拦住问题的开关，不要为了绕过它们加 `_` 前缀或 `void x`。

`npm run e2e` 跑在一个**已经起好**的实例上（本地 `npm run dev` 或 `docker compose up`），
Playwright 配置不负责拉起服务：

```bash
NAV_PASSWORD=<密码> npm run e2e
# 换地址：NAV_BASE_URL=http://127.0.0.1:5173
# 用系统已装的浏览器：NAV_BROWSER_CHANNEL=chrome
```

---

## 禁止的模式

| 禁止 | 为什么 | 应该 |
| --- | --- | --- |
| 组件里直接 `fetch` | 会漏掉 401 → 退回登录屏、204 空响应、错误形状这三种处理 | 走 `api/client.ts` |
| `any`、`as any` | `strict` 的意义就没了 | `unknown` + 收窄，见 [type-safety.md](./type-safety.md) |
| `@ts-ignore` / `@ts-expect-error` | 掩盖真实缺陷 | 修类型定义 |
| 新增运行时依赖 | prd 把「依赖最少」列为非功能需求 | 用原生 API，或先说明理由 |
| 在 `src/` 里 import `server/` | 跨层反向依赖，打包会带上 Node 专用代码 | 共享类型放 `shared/types.ts` |
| 写死的颜色/圆角/时长 | 换强调色、改主题时漏改 | `styles/tokens.css` 里的变量 |
| 第二个 `backdrop-filter` 用途 | 每个都新建合成层，直接吃帧率 | 见 [component-guidelines.md](./component-guidelines.md) |
| `innerHTML` / `v-html` | 书签标题来自用户输入与外部网页 | 文本插值 + `splitByHighlights` 切段渲染 |
| 用下标做 `v-for` 的 `:key` | 重排时状态会串到错误的行上 | 用稳定 id |

---

## 必需的模式

- **注释解释「为什么」，不解释「是什么」。** 现有代码的注释密度就是标准——
  凡是反直觉的写法（`type="button"` 之外的特殊处理、看起来多余的判空、顺序敏感的操作）
  都要说明原因
- **所有面向用户的文案用中文**，代码标识符用英文
- **错误必须让用户看见。** 要么 `toast.error(...)`，要么表单内的 `.field__error`
  （带 `role="alert"`）。不允许静默 `catch {}`——唯一的例外是
  `loadPublicManifest` 的兜底，那里失败只意味着登录屏没有背景
- **异步操作的按钮要有进行中状态**：`saving` / `fetching` / `pending` 置位并禁用按钮
- **浮层控件补齐三件套**：`aria-label`、键盘可达、点击外部收起

---

## 测试要求

| 层 | 工具 | 覆盖什么 |
| --- | --- | --- |
| 后端 | `node:test` | 鉴权、CRUD、排序、导入解析、URL 元信息、图标 |
| 前端纯函数 | `node:test` | `composables/drag.ts`、`composables/filter.ts` |
| 端到端 | Playwright | 登录 → 新增 → 拖拽 → 搜索 → 切壁纸等主路径 |

前端**不引** Vitest / @vue/test-utils。组件不做单元测试，交互正确性由 e2e 覆盖。
这条约束的实际含义是：**把能测的逻辑从组件里挤到纯函数模块里去**，
`drag.ts` / `filter.ts` 就是这么来的（见 [hook-guidelines.md](./hook-guidelines.md)）。

### 加纯函数测试时的写法

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filterBookmarks } from './filter.ts'   // 注意 .ts 扩展名
import type { Bookmark, Group } from '../types.ts'
```

用 `assert/strict`（`assert.equal` 就是全等），`describe` / `it` 标题写中文。
断言失败时补第三个参数说明意图：

```ts
assert.equal(result.visibleIds, null, 'design §6：没匹配上时首页保持全量')
```

### e2e 的三条硬规矩

**一、不假设库里是干净的。** 这是踩过的坑：早期 e2e 默认分组为空、标题唯一，
在用过一段时间的库上会成片假失败，而真实用户的库永远不是干净的。现在：

- 断言「新书签落在哪个分组」，不假设它叫「常用」
- 断言「落在哪个分组」而不是数总数
- 标题带时间戳，不假设唯一
- 每条规格自己保证前置条件（自己建分组、自己清理）

**二、用页面自身的 `fetch` 而不是 `page.request`。** `e2e/helpers.ts` 里的 `apiJson`：

> 容器里 `NODE_ENV=production`，会话 Cookie 带 `Secure`。浏览器把 `http://127.0.0.1`
> 当可信来源，允许在 http 下存取它；而 `APIRequestContext` 按字面语义处理，
> 纯 http 下会直接丢掉这个 Cookie，于是「页面已登录」和「page.request 却 401」
> 会同时成立。

**三、验证「被绘制」而不是「存在」。** 断言元素可见、可点，用
`helpers.ts` 的 `topmostAt`：

```ts
/** 每个元素是否真的画在最上层——只有 elementFromPoint 问得出来 */
export function topmostAt(page: Page, selector: string): Promise<string>
```

原因见下一节。「元素在 DOM 里」和 `boundingBox()` 都说明不了它有没有被画出来。

---

## 一个必须记住的教训

**`fix(web): 搜索框被壁纸层盖住——不可见也点不到`**

搜索框曾经完全不可见、点不到，而 15 条 e2e 全绿。原因是两层叠加的验证失误：

1. 用 `boundingBox()` 探测元素存在，就认为「截图大概是我看错了」
2. `fill()` 不检查命中目标，所以即使元素被盖住，填值照样成功

元素的**存在**与元素**被绘制、可点击**是两件事。凡是新增或移动了层叠结构中的元素
（浮层、壁纸、遮挡层），都要用 `elementFromPoint` 或真实 `click()` 验证命中目标。

改动 UI 后如果有截图，**截图里该出现的东西要真的出现**——README 头图曾经长期
缺少搜索框而无人察觉。

---

## 代码审查清单

- [ ] `npm run typecheck` 与 `npm test` 通过，无跳过
- [ ] 新增的写操作有快照回滚，失败走 `handleFailure` / `reportFailure`
- [ ] 新增的 `api.xxx` 方法与服务端路由签名一致（对照 `shared/types.ts`）
- [ ] 没有新增运行时依赖；没有写死的颜色/圆角/时长
- [ ] 异步操作有进行中状态，按钮会禁用
- [ ] 新的浮层控件有 `aria-label`、Esc 可关、点外部可关
- [ ] 新增/移动了层叠结构中的元素 → 已用 `elementFromPoint` 或真实点击验证
- [ ] 移动端（≤640px）下新增控件仍可点到（触屏没有 hover）
- [ ] 注释解释的是「为什么」，中文文案面向用户
