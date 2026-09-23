// 阶段 8 的实操验证：设置面板、壁纸切换与上传、导入、收藏按钮、退出登录。
// 服务由外部起好（见 package.json / README），这里只管点。

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiJson, login } from './helpers.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const BOOKMARKS_HTML = resolve(HERE, 'fixtures/bookmarks.html')
/**
 * 上传素材用仓库自带的小夹具，不依赖 assets/wallpapers-src（那是 gitignore 的，
 * 换台机器克隆下来就没有了，测试会莫名其妙挂掉）。
 */
const UPLOAD_IMAGE = resolve(HERE, 'fixtures/upload.png')

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

  // 期望的格子数从接口算出来，不写死：内置按主题配对成一个格子，上传的各占一个。
  // 写死 4 的话，库里只要有一张上传壁纸这条就挂。
  const boot = await apiJson<{ wallpapers: { pairId: string | null }[] }>(page, '/api/bootstrap')
  const themes = new Set(
    boot.wallpapers.filter((item) => item.pairId !== null).map((item) => item.pairId),
  )
  const uploaded = boot.wallpapers.filter((item) => item.pairId === null).length

  const tiles = page.locator('.tile')
  await expect(tiles).toHaveCount(themes.size + uploaded)

  // 挑一个当前没选中的格子
  const total = await tiles.count()
  const currentIndex = (await page.evaluate(`(() => {
    const list = [...document.querySelectorAll('.tile')]
    return list.findIndex((el) => el.classList.contains('is-current'))
  })()`)) as number
  const targetIndex = (currentIndex + 1) % total

  const before = await page.locator('.wallpaper__img').getAttribute('src')
  await tiles.nth(targetIndex).click()
  await expect(tiles.nth(targetIndex)).toHaveClass(/is-current/)
  await expect(page.locator('.wallpaper__img')).not.toHaveAttribute('src', before ?? '')

  // 关面板再刷新，选择应该被服务端记住了
  await page.getByRole('button', { name: '关闭' }).click()
  await page.reload()
  await openSettings(page)
  await expect(page.locator('.tile').nth(targetIndex)).toHaveClass(/is-current/)
})

test('上传自定义壁纸后自动选中，并可删除', async ({ page }) => {
  await openSettings(page)
  const before = await page.locator('.tile').count()
  const badgesBefore = await page.locator('.tile__badge').count()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '上传图片' }).click()
  await (await chooser).setFiles(UPLOAD_IMAGE)

  // 转码两档 avif/webp 要跑一会儿
  await expect(page.locator('.tile')).toHaveCount(before + 1, { timeout: 30_000 })
  await expect(page.locator('.tile__badge')).toHaveCount(badgesBefore + 1)
  // 上传完会自动切过去，所以当前格子上应该是「自定义」徽章
  await expect(page.locator('.tile.is-current .tile__badge')).toHaveText('自定义')

  // 删掉它（删除按钮与选择按钮是兄弟节点，靠 .cell 定位）
  await page
    .locator('.cell', { has: page.locator('.tile.is-current') })
    .locator('.tile__remove')
    .click()
  await expect(page.locator('.tile')).toHaveCount(before)
  await expect(page.locator('.tile__badge')).toHaveCount(badgesBefore)
})

test('导入浏览器书签 HTML：文件夹变分组、嵌套合进顶层、占位跳过', async ({ page }) => {
  await openSettings(page)

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择文件' }).first().click()
  await (await chooser).setFiles(BOOKMARKS_HTML)

  // 库里可能本来就有这些书签（导入是幂等的），所以两种情况都算通过
  await expect(page.locator('.toast')).toContainText('导入', { timeout: 20_000 })
  await page.getByRole('button', { name: '关闭' }).click()

  // 不断言条数，只断言「该落在哪个分组里」—— 这才是这条用例要验的映射关系，
  // 数条数会因为库里已有的数据而假失败。
  const panelOf = (name: string) =>
    page.locator('.panel', { has: page.locator('.panel__name', { hasText: name }) })

  const toolbar = panelOf('书签栏')
  await expect(toolbar).toBeVisible()
  for (const title of ['Alpha 示例', 'Beta 示例', '嵌套里的书签']) {
    await expect(toolbar.locator('.card__title', { hasText: title })).toBeVisible()
  }

  await expect(panelOf('导入测试组').locator('.card__title', { hasText: 'Gamma 示例' })).toBeVisible()
  // javascript: 占位书签应被跳过，任何分组里都不该出现它
  await expect(page.locator('.card__title', { hasText: '占位书签' })).toHaveCount(0)
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

  // 限定在搜索引擎分区里找：壁纸格子的可访问名字里也可能带「自定义」
  const section = page.locator('.section', {
    has: page.locator('.section__title', { hasText: '搜索引擎' }),
  })
  await section.getByRole('button', { name: '自定义' }).click()
  await page.locator('#se-template').fill('https://example.com/search?q=')
  await section.getByRole('button', { name: '保存' }).click()

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
