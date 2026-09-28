# 首页视觉调整 · 技术设计

前端为主，服务端只改图标转码一处（R10）。不改接口、不改共享类型、不加依赖。视觉数值以 `mockups/b.html` + `mockups/shared/base.css` 为准，下文只写结构和容易踩坑的地方。

## 1. 启动器面板（R1、R2、R6）

- `App.vue`：把 `TopBar`、`.app__search`、`.app__main` 包进一个新的 `<div class="launcher">`。**不能**沿用样稿的类名 `.sheet`：那是滑出面板的类名，e2e 有 5 处 `locator('.sheet')`。
- `SlidePanel`、`Toast` 必须留在 `.launcher` **外面**：带 `backdrop-filter` 的祖先会成为 `position: fixed` 后代的包含块，放进去就会被限制在面板范围内并被 `overflow: hidden` 裁掉。卡片菜单本来就 Teleport 到 body，不受影响。
- 布局：`.launcher` 是 `.app`（flex 纵向）里的 `flex: 1 1 auto; min-height: 0` 子项，四周留 22px 外边距；宽度 `min(var(--launcher-w), calc(100% - 44px))`。样稿只写了 `clamp(620px, 62vw, 980px)`，641～663px 宽时会溢出，所以加了 `min()` 兜底。内部 `overflow: hidden`，`.app__main` 仍然是唯一的滚动容器。
- 令牌（`tokens.css`）：新增 `--launcher-w`、`--glass-launcher: rgb(17 19 26 / 0.5)`、`--blur-launcher: 24px`（窄屏 14px）；`backdrop-filter: blur(var(--blur-launcher)) saturate(1.25)`。`--scrim` 换成样稿里更浅的渐变：面板本身已经保证可读，壁纸遮罩不用再压那么暗。
- 窄屏：`.launcher` 去掉外边距、圆角、边框和阴影，铺满全屏。
- 模糊层数：分组面板去掉模糊之后（见 §2），首页常驻元素只剩 `.launcher` 这一层；登录屏、滑出面板、卡片菜单、提示条沿用各自现有的模糊。

## 2. 分组（R3、R5）

- `BookmarkGrid.vue`：`.panels` 从 `display: grid` 改为 `columns: 3 220px; column-gap: 20px`，`.panels__cell` 加 `break-inside: avoid`，行间距改用 `padding-bottom`；窄屏 `columns: 1`。
  - 取舍：多列布局按「先排满第一列再排第二列」的顺序排分组，阅读顺序从「横着读」变成「竖着读」。拖拽排序只看 DOM 顺序和目标格的上下半边，不受影响。样稿就是这个效果，用户已选定。
- `GroupPanel.vue`：`.panel` 去掉背景、边框、圆角、内边距和 `backdrop-filter`。类名 `.panel`、`.panel__head`、`.panel__name`、`.panel__grid`、`.panel__cell` 都保留（e2e 依赖）。拖到分组上时原本是边框变色，改为保留 1px 透明边框、拖入时变成强调色，视觉反馈不丢。
- 分组头：「添加」「编辑」改成 24px 图标按钮，`aria-label` 分别是「添加」「编辑」，`title` 写完整说明。e2e 的 `getByRole('button', { name: '添加' })` 按 aria-label 就能定位到，不用改；Playwright 认为 `opacity: 0` 的元素也可见，悬停隐藏不影响点击。显隐规则：`.panel:hover`、`.panel:focus-within` 时显示（键盘 Tab 进来也能看到），窄屏常显。按下按钮时不起拖的 `pressedOnButton` 逻辑不变。
- 空分组的提示文字从「或点「添加」」改成「或点 +」，和图标按钮对应。

## 3. 新建分组入口（R5）

- `homeContext.ts` 的 `CardActions` 加 `addGroup: () => void`，由 `App.vue` 实现（`panel.value = 'add-group'`，和原来悬浮按钮的行为一样）。删掉 `.app__fab` 按钮和它的样式。
- `BookmarkGrid.vue` 在分组列表末尾放 `<button class="add-group">`（虚线、次要），放在自己的 `.panels__cell` 里，不响应拖放事件。
- **空状态也要有这个入口**：`isEmpty` 的判断条件是「没有分组」（`data.ts:65`），悬浮按钮删掉后，没有分组时就没有别的地方能建第一个分组。空状态的提示文字原来是「点右上角「新增」」，但没有分组时书签表单保存不了（`BookmarkForm.vue:38` 要求 `groupId`），这句提示本来就不对，改成「先建一个分组」，并在下面放同一个「新建分组」按钮。
- 搜索时列表末尾的「新建分组」照常显示，不为它另写隐藏逻辑。

## 4. 书签卡片（R4、R6、R8）

- `BookmarkCard.vue`：
  - 桌面端：卡片默认没有底色，悬停时用 `--glass-card-hover`；去掉悬停上浮的 `transform`。内边距 5px 6px，圆角 8px，图标 22px，标题单行截断。
  - 标题外包一层 `.card__text`（纵向），里面是 `.card__title` 和可选的 `.card__host`（11px、`--text-3`、单行截断）。
  - 「⋯」按钮改成盖在标题末尾上方（加不透明底 `rgb(34 37 46 / 0.92)`），标题不再预留 `padding-right: 22px`。
  - 窄屏保持现有的竖排结构，图标 32px、标题两行；`.card__text` 设 `width: 100%`，主机名才会被截断，而不是把卡片撑宽。
  - 卡片落点改成按纵向判断：`useDrag.overBookmark` 改传 `rect.top / rect.height / event.clientY`（`dropIndexFor` 本身不区分方向，`drag.ts:46`）；落点指示线从左侧竖线改成顶部横线。只有桌面端能拖，而桌面端现在是竖排列表，所以只需要按纵向判断。e2e 的落点都是目标格左上角 `{x:8, y:8}`，两种方向下结果一样。
  - Teleport 那段注释里「分组面板用了 backdrop-filter」改成「启动器面板」，原因不变。
- 判重（R8）：`data.ts` 加一个计算属性 `duplicateTitleKeys = computed(() => findDuplicateTitleKeys(bookmarks.value))`，基于全部书签计算，所以搜索时结果不会变。卡片里 `host = duplicateTitleKeys.has(titleKey(title)) ? displayHost(url) : null`。整个列表只算一次，不在每张卡片里重新扫一遍全部书签。

## 5. 首字色块（R7、R9）

- 新建纯逻辑文件 `src/composables/labels.ts`（遵守纯逻辑约束：零运行时 import、只用相对路径），配 `labels.test.ts`：
  - `initialOf(title)`：`/[\p{L}\p{N}]/u` 取第一个字母、数字或汉字并转大写，取不到返回 `'?'`
  - `hueOf(url)`：从 `FallbackIcon.vue` 原样搬过来，算法不变，所以现有的站点颜色不会变
  - `titleKey(title)`：去掉首尾空白并转小写
  - `findDuplicateTitleKeys(bookmarks)`：返回出现两次及以上的 key 集合
  - `displayHost(url)`：取主机名并去掉开头的 `www.`，解析失败时返回原串
- `FallbackIcon.vue`：改用上面的函数；配色改成底色 `hsl(h 26% 28%)`、字母 `hsl(h 55% 84%)`。`size` 改为可选、不设默认值：传了才写行内的宽、高和字号（`BookmarkForm` 传 40，不受影响）；不传时尺寸交给父组件的 class。卡片里写成 `<FallbackIcon class="card__icon" …>`，桌面端 22px、窄屏 32px 都由卡片的 CSS 决定。原来行内写死了尺寸，媒体查询覆盖不了，所以要这样改。选择器用 `.card .card__icon` 提高特异性，压过 FallbackIcon 自身的圆角。

## 6. 顶栏（R5）

- `TopBar.vue`：`.topbar__add` 改成强调色实心按钮，带「+」图标，文字仍是「新增」（e2e 按这个名字找）。按钮上的文字颜色沿用原来悬浮按钮的 `#10131a`，只是从 `.app__fab` 挪过来。

## 7. 深色透明图标反白（R10）

- `server/lib/icons.ts` 的 `encodeIcon`：`resize` 之后先 `.ensureAlpha().raw()` 取出 64×64 的 RGBA 数据（16KB），用 `isDarkGlyph(rgba)` 判断；命中就 `negate({ alpha: false })`，然后编码成 WebP。只解码一次：从 raw 数据重新建 `sharp(data, { raw })` 做编码。
- `isDarkGlyph` 作为纯函数导出，阈值沿用线上实测时用的那一版：不透明（alpha > 0.5）像素占比 < 0.7，**且**按 alpha 加权的平均线性亮度 < 0.05，**且**平均饱和度 < 0.15；alpha ≤ 0.05 的像素不计入平均。
- 下载、上传、公共服务三条来源都经过 `storeIcon → encodeIcon`，改这一处就全部覆盖。
- 测试（`icons.test.ts`）：透明底加黑色图形会被反成白色，透明部分不变；彩色图标不变；深色主体带白边的图标不变；整块不透明的黑色方图不变（不透明占比超过阈值）。另外用真实函数把 `mockups/icons/` 里的 31 个线上图标跑一遍，确认只命中那 2 个。

## 8. 不在范围

- 照片式 logo（「叙说·春信」「米饭机」）不做处理，需要时用已有的手动上传换图标。
- 线上已有的 2 个深色图标不写迁移脚本，上线后由用户在编辑框里点「重新抓取」。
- 搜索框外观、登录屏、滑出面板不改。

## 9. 兼容与回滚

- e2e 依赖的类名、按钮名都保留，预计不需要改测试；如果有断言改了，在 implement.md 对应步骤里写明原因。
- 纯前端部分和服务端反白互不依赖，可以分别回退。反白只影响之后新写入的图标，回退后已经反白的图标文件不会自动恢复，要再点一次「重新抓取」。
