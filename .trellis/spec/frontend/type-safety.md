# 类型安全

> TypeScript strict 模式下的类型组织、运行时校验边界，以及什么时候允许断言。

---

## 类型的唯一出处

```
shared/types.ts         ← 前后端契约的唯一定义
     ↓                          ↓
src/types.ts            server/types.ts（或直接 import）
（只做再导出）
```

`src/types.ts` **只有再导出，没有定义**：

```ts
// 前端类型统一从共享契约再导出。
// 只有一份定义（shared/types.ts），这里只是给 src 内部一个稳定的引用位置，
// 避免每个组件都写 ../../shared/types 这种相对路径。
export type { ApiError, Bookmark, BootstrapResponse, Group, /* ... */ } from '../shared/types'
```

组件里一律写 `import type { Bookmark } from '@/types'`。

新增 API 字段时改 `shared/types.ts` 一处，两侧同时生效——这是防止契约漂移的机制
（详见 [../guides/cross-layer-thinking-guide.md](../guides/cross-layer-thinking-guide.md)）。

### 契约类型的设计约定

```ts
export interface Bookmark {
  id: string
  groupId: string
  description: string | null      // 可空字段用 null，不用 undefined
  /** 图标是否已缓存在本站，前端据此决定显示图标还是首字色块 */
  hasIcon: boolean
  updatedAt: number
}
```

- 可空的**数据字段**用 `| null`（数据库里就是 null），**可选参数**用 `?`
- 每个非显然字段都写 JSDoc——`hasIcon` 和 `updatedAt` 都在服务端有专门语义，
  不写注释前端很容易用错（`updatedAt` 是图标缓存键，不只是「改过没有」）

---

## 只有一份类型定义

组件局部的类型就近定义，不要往 `shared/` 塞：

| 类型 | 放哪 | 例子 |
| --- | --- | --- |
| 前后端契约 | `shared/types.ts` | `Bookmark`、`BootstrapResponse` |
| store 的派生结构 | 对应 store 文件导出 | `GroupWithBookmarks`（`stores/data.ts`） |
| composable 的返回值 | 对应 composable 文件导出 | `FilterResult`、`HighlightRange` |
| 组件自己的 props | 组件内联 | `defineProps<{ entry: GroupWithBookmarks }>()` |
| 输入 DTO | `api/client.ts` 导出 | `BookmarkInput`、`BookmarkPatch` |

`BookmarkInput` / `BookmarkPatch` 是**写入口的类型**，与 `Bookmark`（读出的形状）分开——
前者没有 `id` / `sortOrder` / `hasIcon`，后者才有。不要用 `Partial<Bookmark>` 代替它们，
那会让调用方以为能传 `sortOrder`。

---

## 导入类型必须用 `import type`

`tsconfig.json` 开了 `verbatimModuleSyntax`，类型导入不加 `type` 会留下真实 import 语句，
纯逻辑模块的「零运行时 import」约束就会被打破。

```ts
import type { Bookmark, Group } from '../types'          // 正确
import { type Bookmark, type Group } from '../types'     // 也可以
import { Bookmark, Group } from '../types'               // 错误：会生成运行时 import
```

`filter.ts` / `drag.ts` 靠这条才能被 `node:test` 直接执行。

---

## 编译选项的实际含义

`tsconfig.json`（前端）：

```jsonc
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "isolatedModules": true,
  "verbatimModuleSyntax": true,
  "paths": { "@/*": ["src/*"] }
}
```

- `noUnusedLocals` / `noUnusedParameters` 是真的会拦下问题的开关。
  **不要**用 `_` 前缀或 `void x` 绕过去（本项目的 tsc 不忽略下划线前缀，绕不过去）。
  重构后遗留的未使用变量要真删掉——`阶段 11` 就清理过一个因重构变成孤儿 helper
- 前端测试文件被 `exclude`（`src/**/*.test.ts`），交给 `tsconfig.server.json` 检查
  ——它们跑在 Node 环境里。所以类型检查是**两个工程**，`npm run typecheck` 都跑
- `@` 别名只在前端工程生效；纯逻辑模块因此只能用相对路径

---

## 运行时校验

类型在编译后消失，**外部输入必须在边界处校验**。项目不引 Zod，靠手写收窄。

现有的唯一入口是 `settings.loadPublicManifest()`——它读的是一个静态 JSON 文件：

```ts
const manifest = (await response.json()) as { wallpapers?: unknown }
if (!Array.isArray(manifest.wallpapers)) return
wallpapers.value = (manifest.wallpapers as WallpaperManifestEntry[]).map((entry) => ({ /* ... */ }))
```

步骤是：先断言成 `{ 字段?: unknown }` → 检查结构 → 再收窄。
「先 `as` 成具体类型再检查」是反过来的，检查就失去意义了。

需要校验的新场景（新增静态文件、读 `localStorage`、解析 URL 参数）

- 网络来源（`/api/*`）**信任**服务端返回，不做逐字段校验——前后端共享类型，
  契约由 `shared/types.ts` 保证
- URL 参数用 `URLSearchParams` 解析，不要手写 `decodeURIComponent`：
  `App.vue` 处理 bookmarklet 的 `#add?url=&title=` 时有注释说明原因——
  服务端生成的查询串里空格是 `+`，`decodeURIComponent` 不会还原它

---

## 常见模式

### 用类区分错误类型

```ts
export class UnauthorizedError extends Error { /* ... */ }
export class ApiError extends Error {
  readonly status: number
  readonly detail: string | undefined
}
```

调用方用 `instanceof` 收窄，而不是拿字符串比对 message：

```ts
if (error instanceof ApiError) {
  locked.value = thrown.status === 429
  error.value = thrown.detail ?? thrown.message
}
```

服务端把「还需等多久」放在 `detail` 里，所以取错误文案的顺序是 `detail ?? message`。

### 泛型约束表达「最小形状」

重排逻辑不关心完整类型，只关心有 `id`：

```ts
export interface Reorderable { id: string }
export function reorder<T extends Reorderable>(list: readonly T[], fromId: string, toIndex: number): T[]

export interface GroupedItem { id: string; groupId: string }
export function applyOrderWithin<T extends GroupedItem>(list: readonly T[], groupId: string, ids: readonly string[]): T[]
```

好处是 `Bookmark` 和 `Group` 都能直接传进去，不需要联合类型或重载。

### 收窄而不是断言

```ts
// 好：让编译器验证
const group = byId.get(id)
return group === undefined ? [] : [group]

// 差：断言绕过检查，group 真为 undefined 时会在运行时炸
return [byId.get(id)!]
```

`!` 非空断言在本项目里只出现在 `without[i]!.groupId` 这种下标访问上（数组长度已判过），
其余地方一律显式判 `undefined`。

---

## 禁止的模式

| 禁止 | 应该 |
| --- | --- |
| `any` | `unknown` + 收窄 |
| `as SomeType`（无检查的断言） | 先收窄结构，或改类型定义 |
| `@ts-ignore` / `@ts-expect-error` | 修类型本身 |
| `Partial<Bookmark>` 当写入口 | `BookmarkInput` / `BookmarkPatch` |
| 类型导入不写 `type` | `import type { ... }` |
| 为绕过 `noUnusedLocals` 加 `_` 前缀 | 删掉那个变量 |
| 在 `src/` 里定义前后端共享的类型 | 写进 `shared/types.ts` |

---

## 检查清单

- [ ] 新增 API 字段只改了 `shared/types.ts` 一处
- [ ] 新增的类型导入都带 `type`
- [ ] 外部输入（静态文件 / URL 参数 / `localStorage`）在边界处做了运行时校验
- [ ] 没有新增 `any` / 断言 / `@ts-ignore`
- [ ] `npm run typecheck` 两个工程都通过
