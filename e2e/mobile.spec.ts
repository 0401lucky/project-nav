// 窄屏适配。断言用 Playwright 自带的 toHaveCSS / boundingBox，
// 不引 DOM 类型（Node 工程里本来就没有）。

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiJson, login } from './helpers.ts'

/**
 * 种子用独立前缀与独立路径。
 * 别和 e2e/fixtures/bookmarks.html 里的 URL 撞：那份夹具也有 example.com/alpha，
 * 撞上就会被导入去重掉，导入用例会莫名其妙地少几条。
 */
const SEED_TITLES = ['Seed Alpha', 'Seed Beta', 'Seed Gamma', 'Seed Delta']

/**
 * 登录并确保首页有卡片。
 *
 * 这个规格不依赖别的文件先跑过，也不假设库是干净的：
 * 「空状态」那条用例会删光所有分组、别的用例会留下自己的数据，
 * 而它们都可能先跑。所以缺什么就自己补什么。
 */
async function loginWithCards(page: Page): Promise<void> {
  await login(page)

  const boot = await apiJson<{
    groups: { id: string }[]
    bookmarks: { title: string }[]
  }>(page, '/api/bootstrap')

  let groupId = boot.groups[0]?.id
  if (groupId === undefined) {
    const created = await apiJson<{ id: string }>(page, '/api/groups', {
      method: 'POST',
      body: { name: '测试分组' },
    })
    groupId = created.id
  }

  // 判断「是不是自己播的种」，而不是「库里有没有书签」：
  // 别的规格可能先跑过并留下数据，只看条数会误判成已播种而跳过。
  if (boot.bookmarks.some((item) => item.title === SEED_TITLES[0])) return

  for (const title of SEED_TITLES) {
    const slug = title.toLowerCase().replace(/\s+/g, '-')
    await apiJson(page, '/api/bookmarks', {
      method: 'POST',
      body: { groupId, title, url: `https://example.com/seed/${slug}` },
    })
  }
  await page.reload()
  await expect(page.locator('.card').first()).toBeVisible()
}

test.describe('窄屏 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('首页：固定 3 列、无拖拽手柄、菜单按钮常显', async ({ page }) => {
    await loginWithCards(page)

    // auto-fill 会按容器宽度铺开，窄屏必须是固定 3 列
    await expect(page.locator('.panel__grid').first()).toHaveCSS(
      'grid-template-columns',
      /^[\d.]+px [\d.]+px [\d.]+px$/,
    )

    // 触屏没有 hover：拖拽手柄藏起来，菜单按钮反过来必须常显
    await expect(page.locator('.card__handle').first()).toBeHidden()
    await expect(page.locator('.card__more').first()).toHaveCSS('opacity', '1')

    // 留一张现场图，方便人工核对移动端观感
    await page.screenshot({ path: 'test-results/mobile-home.png' })
  })

  test('弹层占满宽度', async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: '设置' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('设置')

    const box = await page.locator('.sheet').boundingBox()
    expect(box).not.toBeNull()
    // 亚像素布局下拿到 389.99998 或 390.00001 都正常，留一点余量
    expect(box!.width).toBeGreaterThan(389.5)
    expect(box!.width).toBeLessThan(390.5)
  })

  test('竖屏真的去加载竖版壁纸', async ({ page }) => {
    // 用真实发出的请求判断，而不是看 <img> 的 src：
    // src 只是兜底属性，实际选哪条 <source> 由媒体查询决定，
    // 「横屏显示竖版图」这类 bug 只有盯请求才抓得到。
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/wallpapers/')) requested.push(request.url())
    })

    await login(page)
    await expect(page.locator('.wallpaper__img')).toBeVisible()

    await expect.poll(() => requested.some((url) => url.includes('-portrait-'))).toBe(true)

    const landscape = requested.filter((url) => url.includes('-landscape-'))
    expect(landscape, `竖屏下不该请求横版，实际请求了：${JSON.stringify(requested)}`).toEqual([])
  })

  test('登录屏的密码框完整可见', async ({ page }) => {
    await page.goto('/')
    const input = page.locator('input[type=password]')
    await expect(input).toBeVisible()

    const box = await input.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  })

  test('搜索与新增在窄屏仍可用', async ({ page }) => {
    await loginWithCards(page)

    await page.locator('.search__input').fill('seed')
    await expect(page.locator('.search__hint')).toContainText('回车打开')

    await page.getByRole('button', { name: '新增' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('添加书签')
    await expect(page.locator('#bm-url')).toBeVisible()
  })
})

test.describe('宽屏下的对照', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('宽屏按容器自动铺开，拖拽手柄存在（hover 才显形）', async ({ page }) => {
    await loginWithCards(page)

    // 只断言不是固定 3 列：具体列数随窗口宽度变化，写死会很脆
    await expect(page.locator('.panel__grid').first()).not.toHaveCSS(
      'grid-template-columns',
      /^[\d.]+px [\d.]+px [\d.]+px$/,
    )

    // 手柄在 DOM 里（只是 hover 才显形），移动端那条 display:none 不生效
    await expect(page.locator('.card__handle').first()).toBeAttached()
    await expect(page.locator('.card__more').first()).toHaveCSS('opacity', '0')
  })
})
