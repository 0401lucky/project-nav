# 分组折叠设计

壁纸部分已完成并提交 `aa7c5ec`，本次追加前端分组折叠，最后一起发布。

## 边界与状态

- 现有 GroupPanel 的标题栏兼作分组拖拽区，BookmarkGrid 使用 CSS 多列；保留这些结构和排序数据。
- 新增共享 UI composable `useGroupCollapse`，用稳定 group id 集合记录收起状态，localStorage key 为 `nav.collapsedGroups.v1`。不加第四个 Pinia store，不改 API/数据库。
- localStorage 只保存字符串 id 数组；读取时校验并去重。读取或写入失败时保留内存状态，不能阻止渲染或切换。
- 解析存储值的纯函数放 `groupCollapse.ts` 并用 node:test 覆盖损坏 JSON、非数组、混合类型与去重；Vue/DOM 接线留 composable。
- 保存偏好与实际显示分开：`searchHasMatches = result.visibleIds !== null`，匹配时实际显示展开，搜索结束还原保存值；无匹配时 visibleIds 为 null，不覆盖收起状态。
- 搜索匹配期间折叠按钮显示展开且不可切换，说明搜索正在展开分组；避免隐藏仍由搜索键盘选中的结果。

## 标题栏和拖拽

- 加常显的箭头 button，标注包含分组名的 aria-label 与 aria-expanded，键盘 Enter/Space 使用原生按钮行为。
- 标题区域点击可切换，工具按钮不冒泡触发。继续使用按下时判断 button 的拖拽保护。
- 从标题栏开始真实拖拽后抑制该次点击，下一次 pointerdown 清除拖拽标记，避免拖动结束误折叠或下一次正常点击失效。
- 折叠时不渲染卡片内容，避免隐藏链接参与 Tab 或遗留 Teleport 菜单；组容器和标题仍在，接收拖入书签，沿用全量数据计算追加位置。
- 空组也能折叠；收起时隐藏空提示。禁止通过过滤数据来实现折叠，否则会影响排序接口要求的全量 id。

## 保存后的可见性

- 在现有新增书签成功路径展开返回书签的 groupId，确保从顶栏或分组入口新增都能看到结果；不在取消或失败时修改偏好。
- 移动/拖入折叠组沿用现有操作反馈和数量更新；如需展开，仅在成功后处理，不在 dragover 阶段改变布局造成落点抖动。

## 验证和发布

- 新增 E2E 自建分组/书签并清理，只修改专用测试实例；覆盖独立折叠、刷新记忆、搜索恢复、无匹配、键盘/手机、工具按钮、拖拽兼容与存储异常。
- 运行全量单测、build/typecheck 和 E2E；主会话在真实密度本地快照上查看折叠布局及新壁纸。
- 部署继续使用 yunyou-9 `/root/apps/nav/compose.server.yml`，备份旧数据与镜像。不动已有 settings 选择；新壁纸同步允许 wallpapers 表增加 8 行，其余数据指纹应保持一致。
