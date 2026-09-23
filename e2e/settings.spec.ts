// 阶段 8 的实操验证：设置面板、壁纸切换与上传、导入、收藏按钮、退出登录。
// 服务由外部起好（见 package.json / README），这里只管点。

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const HERE = dirname(fileURLToPath(import.meta.url))
const BOOKMARKS_HTML = resolve(HERE, 'fixtures/bookmarks.html')
/**
 * 上传素材用仓库自带的小夹具，不依赖 assets/wallpapers-src（那是 gitignore 的，
 * 换台机器克隆下来就没有了，测试会莫名其妙挂掉）。
 */
const UPLOAD_IMAGE = resolve(HERE, 'fixtures/upload.png')

const PASSWORD = process.env.NAV_PASSWORD ?? ''

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.locator('input[type=password]').press('Enter')
  await expect(page.locator('.topbar__brand')).toBeVisible()
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.locator('.sheet__title')).toHaveText('设置')
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('设置面板打开后各分区都在', async ({ page }) => {
  await openSettings(page)

  for (const title of ['壁纸', '搜索引擎', '强调色', '收藏按钮', '导入']) {
    await expect(page.locator('.section__title', { hasText: title })).toBeVisible()
  }
  // 退出登录只有按钮，没有分区标题
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible()
})

test('壁纸：一个主题一个格子，切换后刷新仍生效', async ({ page }) => {
  await openSettings(page)

  // 四组内置主题，横竖版合成一个格子
  const tiles = page.locator('.tile')
  await expect(tiles).toHaveCount(4)

  const currentBefore = await page.locator('.tile.is-current img').getAttribute('src')
  expect(currentBefore).not.toBeNull()

  await tiles.nth(2).click()
  await expect(tiles.nth(2)).toHaveClass(/is-current/)
  const currentAfter = await page.locator('.tile.is-current img').getAttribute('src')
  expect(currentAfter).not.toBe(currentBefore)

  // 关面板再刷新，选择应该被服务端记住了
  await page.getByRole('button', { name: '关闭' }).click()
  await page.reload()
  await openSettings(page)
  await expect(page.locator('.tile').nth(2)).toHaveClass(/is-current/)
})

test('上传自定义壁纸后自动选中，并可删除', async ({ page }) => {
  await openSettings(page)
  const before = await page.locator('.tile').count()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '上传图片' }).click()
  await (await chooser).setFiles(UPLOAD_IMAGE)

  // 转码两档 avif/webp 要跑一会儿
  await expect(page.locator('.tile')).toHaveCount(before + 1, { timeout: 30_000 })
  await expect(page.locator('.tile__badge')).toHaveText('自定义')
  // 上传完会自动切过去
  await expect(page.locator('.tile.is-current .tile__badge')).toHaveText('自定义')

  // 删掉它
  await page.locator('.tile__remove').click()
  await expect(page.locator('.tile')).toHaveCount(before)
  await expect(page.locator('.tile__badge')).toHaveCount(0)
})

test('导入浏览器书签 HTML：文件夹变分组、嵌套合进顶层、占位跳过', async ({ page }) => {
  await openSettings(page)

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择文件' }).first().click()
  await (await chooser).setFiles(BOOKMARKS_HTML)

  await expect(page.locator('.toast')).toContainText('导入完成', { timeout: 20_000 })
  await page.getByRole('button', { name: '关闭' }).click()

  const toolbar = page.locator('.panel', { has: page.locator('.panel__name', { hasText: '书签栏' }) })
  await expect(toolbar).toBeVisible()
  // Alpha、Beta，加嵌套文件夹里那条；javascript: 占位不进总数
  await expect(toolbar.locator('.card__title')).toHaveCount(3)
  await expect(toolbar.locator('.card__title', { hasText: '嵌套里的书签' })).toBeVisible()

  const other = page.locator('.panel', { has: page.locator('.panel__name', { hasText: '导入测试组' }) })
  await expect(other.locator('.card__title')).toHaveCount(1)
})

test('收藏按钮是合法 bookmarklet，令牌能过 /add 校验', async ({ page }) => {
  await openSettings(page)

  const link = page.locator('.bookmarklet__link')
  const href = await link.getAttribute('href')
  expect(href).not.toBeNull()
  expect(href).toMatch(/^javascript:location\.href='https?:\/\/[^']+\/add\?token=[0-9a-f]{64}&url='/)
  await expect(link).toHaveAttribute('draggable', 'true')

  const token = /token=([0-9a-f]{64})/.exec(href ?? '')?.[1]
  expect(token).toBeTruthy()

  // 用它访问 /add，应带着 url 与 title 302 回首页
  const response = await page.request.get(
    `/add?token=${token}&url=${encodeURIComponent('https://example.com/page')}&title=${encodeURIComponent('示例 标题')}`,
    { maxRedirects: 0 },
  )
  expect(response.status()).toBe(302)
  expect(response.headers()['location']).toContain('/#add?')
})

test('搜索引擎与强调色：改完立刻生效', async ({ page }) => {
  await openSettings(page)

  await page.getByRole('button', { name: 'Bing' }).click()

  // 强调色写到 .app 的内联 style 上，断言这个字符串即可（不必引入 DOM 类型）
  await page.locator('.swatch').nth(1).click()
  await expect(page.locator('.app')).toHaveAttribute('style', /--accent:\s*#7fd1ae/i)

  await page.getByRole('button', { name: '关闭' }).click()

  // 无匹配时提示里应出现刚选的引擎
  await page.locator('.search__input').fill('zzzz-不存在的书签')
  await expect(page.locator('.search__hint')).toContainText('Bing')
})

test('自定义搜索引擎缺 %s 时给出提示且不保存', async ({ page }) => {
  await openSettings(page)

  await page.getByRole('button', { name: '自定义' }).click()
  await page.locator('#se-template').fill('https://example.com/search?q=')
  await page.locator('.custom').getByRole('button', { name: '保存' }).click()

  await expect(page.locator('.toast')).toContainText('%s')
})

test('退出登录回到登录屏', async ({ page }) => {
  await openSettings(page)

  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.locator('input[type=password]')).toBeVisible()
  await expect(page.locator('.topbar__brand')).toHaveCount(0)

  // 登录屏也要有壁纸：用公开的静态 manifest 兜底
  await expect(page.locator('.wallpaper__img')).toBeVisible()
})
