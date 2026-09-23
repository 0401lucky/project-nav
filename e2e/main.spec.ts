// 主路径：登录 → 贴 URL 新增 → 拖拽排序 → 搜索回车打开 → 切壁纸。
//
// 刻意不依赖外网：书签网址用 127.0.0.1:1（必然连接被拒），
// 顺带覆盖「抓取失败仍可手填保存」这条验收点。

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const PASSWORD = process.env.NAV_PASSWORD ?? ''
/** 连不上的端口，用来触发「抓取失败」但保存照旧成功 */
const UNREACHABLE = 'http://127.0.0.1:1/primary'

const NEW_TITLE = '主路径书签'

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.locator('input[type=password]').press('Enter')
  await expect(page.locator('.topbar__brand')).toBeVisible()
}

function panelOf(page: Page, name: string): Locator {
  return page.locator('.panel', { has: page.locator('.panel__name', { hasText: name }) })
}

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
  const panel = panelOf(page, '常用')
  const titles = panel.locator('.card__title')
  await expect(titles.filter({ hasText: NEW_TITLE })).toHaveCount(1)
  // 新增的排在该分组最后
  expect((await titles.allTextContents()).at(-1)).toBe(NEW_TITLE)

  // ---- 2. 拖到分组第一位 ----
  const handle = panel.locator('.card-wrap').filter({ hasText: NEW_TITLE }).locator('.card__handle')
  await handle.dragTo(panel.locator('.panel__cell').first())
  await expect.poll(async () => (await titles.allTextContents())[0]).toBe(NEW_TITLE)

  // 重排要落到服务端：刷新后顺序还在
  await page.reload()
  await expect(page.locator('.card__title').first()).toBeVisible()
  expect((await titles.allTextContents())[0]).toBe(NEW_TITLE)

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
  await expect(tiles).toHaveCount(4)

  const before = await page.locator('.wallpaper__img').getAttribute('src')
  await tiles.nth(3).click()
  await expect(tiles.nth(3)).toHaveClass(/is-current/)
  // 壁纸真的换了（img 的兜底 src 跟着当前壁纸走）
  await expect(page.locator('.wallpaper__img')).not.toHaveAttribute('src', before ?? '')

  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.wallpaper__img')).toBeVisible()
})
