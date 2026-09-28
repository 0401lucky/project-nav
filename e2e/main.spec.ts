// 主路径：登录 → 贴 URL 新增 → 拖拽排序 → 搜索回车打开 → 切壁纸，
// 以及几条「内容是否真的画出来了」的回归测试。
//
// 刻意不依赖外网：书签网址用 127.0.0.1:1（必然连接被拒），
// 顺带覆盖「抓取失败仍可手填保存」这条验收点。

import { expect, test } from '@playwright/test'
import type { BootstrapResponse, Settings } from '../shared/types.ts'
import { apiJson, login, topmostAt } from './helpers.ts'

/** 连不上的端口，用来触发「抓取失败」但保存照旧成功 */
const UNREACHABLE = 'http://127.0.0.1:1/primary'
/** 标题带时间戳：库可能不是干净的，固定标题会让「只应有 1 条」的断言假失败 */
const NEW_TITLE = `主路径书签 ${Date.now()}`

const createdGroups: string[] = []
let originalWallpaper: Settings['wallpaper'] | undefined

test.afterEach(async ({ page }) => {
  for (const id of createdGroups.splice(0)) {
    await apiJson(page, `/api/groups/${id}`, { method: 'DELETE' })
  }
  if (originalWallpaper !== undefined) {
    await apiJson(page, '/api/settings', {
      method: 'PATCH',
      body: { wallpaper: originalWallpaper },
    })
    originalWallpaper = undefined
  }
})

test('主路径：登录 → 新增 → 拖拽 → 搜索回车 → 切壁纸', async ({ page }) => {
  /*
   * 把 window.open 换成桩。理由：
   * 一是真开新标签页会去打外网；二是 headless 下 noopener 弹窗的导航会落到
   * chrome-error 报错页，连上下文级的 request 事件都不会触发，断言不了。
   * 换成桩之后能直接断言「回车时交出去的到底是哪个地址」，反而更精确。
   * 用字符串形式注入是为了不引 DOM 类型（Node 工程里没有）。
   */
  await page.addInitScript(`
    window.__opened = []
    window.open = function (url) { window.__opened.push(String(url)); return null }
  `)

  await login(page)

  // 自己准备分组和对照书签：无默认分组时也能运行，拖拽不会退化成唯一一项拖自己。
  const group = await apiJson<{ id: string }>(page, '/api/groups', {
    method: 'POST',
    body: { name: `主路径分组 ${Date.now()}` },
  })
  createdGroups.push(group.id)
  const firstTitle = `拖拽对照 ${Date.now()}`
  await apiJson(page, '/api/bookmarks', {
    method: 'POST',
    body: { groupId: group.id, title: firstTitle, url: `${UNREACHABLE}/existing` },
  })
  originalWallpaper = (await apiJson<Settings>(page, '/api/settings')).wallpaper
  await page.reload()

  // ---- 1. 贴一个连不上的网址，新增面板照样能保存 ----
  await page.getByRole('button', { name: '新增' }).click()
  await expect(page.locator('.sheet__title')).toHaveText('添加书签')
  await page.locator('#bm-group').selectOption(group.id)

  await page.locator('#bm-url').fill(UNREACHABLE)
  await page.locator('#bm-url').blur()
  // 抓不到要有提示，但不能拦住保存
  await expect(page.locator('.field__hint')).toContainText('手动填写')

  await page.locator('#bm-title').fill(NEW_TITLE)
  await page.locator('.sheet button[type=submit]').click()

  await expect(page.locator('.sheet')).toHaveCount(0)

  // 只检查本用例创建的分组，不依赖其他用例留下的内容。
  const card = page.locator('.card-wrap').filter({ hasText: NEW_TITLE })
  const panel = page.locator('.panel', {
    has: page.locator('.card__title', { hasText: NEW_TITLE }),
  })
  const titles = () => panel.locator('.card__title')

  await expect(titles()).toHaveText([firstTitle, NEW_TITLE])

  // ---- 2. 按住卡片本体（不是边缘手柄）拖到分组第一位 ----
  // 竖排列表按上下半边判断前后，落点取第一格上半部。
  await card.locator('.card').dragTo(panel.locator('.panel__cell').first(), {
    targetPosition: { x: 8, y: 8 },
  })
  await expect(titles()).toHaveText([NEW_TITLE, firstTitle])

  // 重排要落到服务端：刷新后顺序还在
  await page.reload()
  await expect(titles()).toHaveText([NEW_TITLE, firstTitle])

  // ---- 3. 搜索回车打开第一条 ----
  await page.locator('.search__input').fill(NEW_TITLE)
  await expect(page.locator('.search__hint')).toContainText(`回车打开「${NEW_TITLE}」`)

  await page.locator('.search__input').press('Enter')
  const opened = (await page.evaluate('window.__opened')) as string[]
  expect(opened).toEqual([UNREACHABLE])

  // 清掉搜索，回到全量
  await page.locator('.search__input').press('Escape')
  await expect(page.locator('.search__input')).toHaveValue('')

  // ---- 4. 切壁纸 ----
  await page.getByRole('button', { name: '设置' }).click()
  const tiles = page.locator('.tile')
  const total = await tiles.count()
  expect(total, '至少要有内置壁纸可切').toBeGreaterThan(1)

  const before = await page.locator('.wallpaper__img').getAttribute('src')
  // 挑一个当前没选中的：库里有上传壁纸时格子数不是 4，写死会很脆
  const currentIndex = (await page.evaluate(`(() => {
    const list = [...document.querySelectorAll('.tile')]
    return list.findIndex((el) => el.classList.contains('is-current'))
  })()`)) as number
  const target = (currentIndex + 1) % total

  await tiles.nth(target).click()
  await expect(tiles.nth(target)).toHaveClass(/is-current/)
  // 壁纸真的换了（img 的兜底 src 跟着当前壁纸走）
  await expect(page.locator('.wallpaper__img')).not.toHaveAttribute('src', before ?? '')

  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.wallpaper__img')).toBeVisible()
})

/*
 * 下面三条是回归测试。
 *
 * 为什么需要它们：首页的静态内容曾经被壁纸层整个盖住——元素存在、boundingBox
 * 正常、Playwright 也认为它「可见」，但一个像素都没画出来、鼠标也点不到。
 * 而 fill() 不检查命中目标，所以当时的端到端测试全绿，功能却完全不可用。
 * 只有 elementFromPoint 能问出「这一点的最上层究竟是谁」。
 */

test('首页内容真的画在壁纸之上：搜索框可点、提示可读', async ({ page }) => {
  await login(page)

  expect(await topmostAt(page, '.search__input')).toBe('self')

  // 真点一下：click() 会检查命中目标，fill() 不会
  await page.locator('.search__input').click()
  await expect(page.locator('.search__input')).toBeFocused()

  // 提示行也得画得出来，否则用户不知道回车会做什么
  await page.locator('.search__input').fill('随便写点什么')
  expect(await topmostAt(page, '.search__hint')).toBe('self')
})

test('连不上服务器时的提示画得出来', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')

  const error = page.locator('.app__error')
  await expect(error).toContainText('无法连接到服务器')
  expect(await topmostAt(page, '.app__error')).toBe('self')
})

test('没有分组时的空状态画得出来，新建入口可点', async ({ page }) => {
  await login(page)

  // 只模拟本页的空数据，不能为测空状态删掉服务器上的全部分组和书签。
  const boot = await apiJson<BootstrapResponse>(page, '/api/bootstrap')
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ json: { ...boot, groups: [], bookmarks: [] } }),
  )
  await page.reload()

  await expect(page.locator('.empty__title')).toHaveText('还没有书签')
  expect(await topmostAt(page, '.empty__title')).toBe('self')
  expect(await topmostAt(page, '.empty__action')).toBe('self')
  await page.getByRole('button', { name: '新建分组' }).click()
  await expect(page.locator('.sheet__title')).toHaveText('新建分组')

  await page.unroute('**/api/bootstrap')
  const after = await apiJson<BootstrapResponse>(page, '/api/bootstrap')
  expect(after.groups).toEqual(boot.groups)
  expect(after.bookmarks).toEqual(boot.bookmarks)
})
