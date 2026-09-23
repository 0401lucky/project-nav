// 主路径：登录 → 贴 URL 新增 → 拖拽排序 → 搜索回车打开 → 切壁纸，
// 以及几条「内容是否真的画出来了」的回归测试。
//
// 刻意不依赖外网：书签网址用 127.0.0.1:1（必然连接被拒），
// 顺带覆盖「抓取失败仍可手填保存」这条验收点。

import { expect, test } from '@playwright/test'
import { apiJson, login, topmostAt } from './helpers.ts'

/** 连不上的端口，用来触发「抓取失败」但保存照旧成功 */
const UNREACHABLE = 'http://127.0.0.1:1/primary'
/** 标题带时间戳：库可能不是干净的，固定标题会让「只应有 1 条」的断言假失败 */
const NEW_TITLE = `主路径书签 ${Date.now()}`

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

  // ---- 1. 贴一个连不上的网址，新增面板照样能保存 ----
  await page.getByRole('button', { name: '新增' }).click()
  await expect(page.locator('.sheet__title')).toHaveText('添加书签')

  await page.locator('#bm-url').fill(UNREACHABLE)
  await page.locator('#bm-url').blur()
  // 抓不到要有提示，但不能拦住保存
  await expect(page.locator('.field__hint')).toContainText('手动填写')

  await page.locator('#bm-title').fill(NEW_TITLE)
  await page.locator('.sheet button[type=submit]').click()

  await expect(page.locator('.sheet')).toHaveCount(0)

  // 不假设一定落进「常用」：表单默认选的是排序第一的分组，
  // 而别的用例可能删过或重排过分组。按「新书签实际落在哪个面板」来断言。
  const card = page.locator('.card-wrap').filter({ hasText: NEW_TITLE })
  const panel = page.locator('.panel', {
    has: page.locator('.card__title', { hasText: NEW_TITLE }),
  })
  const titles = () => panel.locator('.card__title')

  await expect(titles().filter({ hasText: NEW_TITLE })).toHaveCount(1)
  // 新增的排在该分组最后
  expect((await titles().allTextContents()).at(-1)).toBe(NEW_TITLE)

  // ---- 2. 拖到分组第一位 ----
  await card.locator('.card__handle').dragTo(panel.locator('.panel__cell').first())
  await expect.poll(async () => (await titles().allTextContents())[0]).toBe(NEW_TITLE)

  // 重排要落到服务端：刷新后顺序还在
  await page.reload()
  await expect(titles().first()).toBeVisible()
  expect((await titles().allTextContents())[0]).toBe(NEW_TITLE)

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

test('清空所有分组后的空状态画得出来', async ({ page }) => {
  await login(page)

  const boot = await apiJson<{ groups: { id: string }[] }>(page, '/api/bootstrap')
  for (const group of boot.groups) {
    await apiJson(page, `/api/groups/${group.id}`, { method: 'DELETE' })
  }
  await page.reload()

  await expect(page.locator('.empty__title')).toHaveText('还没有书签')
  expect(await topmostAt(page, '.empty__title')).toBe('self')
})
