import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { apiJson, login } from './helpers.ts'

const STORAGE_KEY = 'nav.collapsedGroups.v1'
const createdGroups: string[] = []

test.beforeEach(async ({ page }) => login(page))
test.afterEach(async ({ page }) => {
  for (const id of createdGroups.splice(0)) {
    await apiJson(page, `/api/groups/${id}`, { method: 'DELETE' })
  }
})

function panelNamed(page: Page, name: string): Locator {
  return page.locator('.panel', { has: page.getByRole('heading', { name, exact: true }) })
}

async function createGroup(page: Page, name: string): Promise<string> {
  const group = await apiJson<{ id: string }>(page, '/api/groups', {
    method: 'POST', body: { name },
  })
  expect(group.id).toBeTruthy()
  createdGroups.push(group.id)
  return group.id
}

async function fixture(page: Page) {
  const stamp = Date.now()
  const term = `折叠书签 ${stamp}`
  const firstName = `甲组 ${stamp}`
  const secondName = `乙组 ${stamp}`
  const firstId = await createGroup(page, firstName)
  const secondId = await createGroup(page, secondName)
  const titles = [`${term} 甲`, `${term} 乙`]
  for (const [index, groupId] of [firstId, secondId].entries()) {
    await apiJson(page, '/api/bookmarks', {
      method: 'POST',
      body: { groupId, title: titles[index], url: `http://127.0.0.1:1/collapse/${stamp}/${index}` },
    })
  }
  await page.reload()
  const first = panelNamed(page, firstName)
  const second = panelNamed(page, secondName)
  await expect(first.locator('.card__title')).toHaveText([titles[0]!])
  await expect(second.locator('.card__title')).toHaveText([titles[1]!])
  return { first, second, firstId, secondId, firstName, secondName, titles, term }
}

function storedIds(page: Page): Promise<string[]> {
  return page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '[]')`)
}

test('独立折叠、标题点击、空组和刷新 / 重新打开后的浏览器记忆', async ({ page, context }) => {
  const { first, second, firstId, firstName } = await fixture(page)
  const arrow = first.getByRole('button', { name: `收起「${firstName}」` })
  await expect(arrow).toHaveAttribute('aria-expanded', 'true')
  await arrow.click()
  await expect(first.locator('.card, .panel__grid')).toHaveCount(0)
  await expect(first.locator('.panel__name')).toHaveText(firstName)
  await expect(first.locator('.panel__count')).toHaveText('1')
  await expect(first.locator('.panel__tools')).toHaveCSS('opacity', '1')
  await expect(second.locator('.card')).toHaveCount(1)
  expect(await storedIds(page)).toEqual([firstId])

  await page.reload()
  await expect(first.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await expect(second.locator('.card')).toHaveCount(1)
  const reopened = await context.newPage()
  await reopened.goto('/')
  await expect(panelNamed(reopened, firstName).locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await reopened.close()

  await first.locator('.panel__name').click()
  await expect(first.locator('.card')).toHaveCount(1)
  expect(await storedIds(page)).toEqual([])

  const emptyName = `空组 ${Date.now()}`
  await createGroup(page, emptyName)
  await page.reload()
  const empty = panelNamed(page, emptyName)
  await expect(empty.locator('.panel__empty')).toBeVisible()
  await empty.locator('.panel__toggle').click()
  await expect(empty.locator('.panel__empty')).toHaveCount(0)
  await expect(empty.locator('.panel__count')).toHaveText('0')
  await empty.locator('.panel__name').click()
  await expect(empty.locator('.panel__empty')).toBeVisible()
})

test('匹配时临时展开、禁止隐藏搜索结果，清空或无匹配时恢复偏好', async ({ page }) => {
  const { first, second, firstId, secondId, titles, term } = await fixture(page)
  await first.locator('.panel__toggle').click()
  await second.locator('.panel__toggle').click()
  const input = page.locator('.search__input')
  await input.fill(term)
  await expect(first.locator('.card__title')).toHaveText([titles[0]!])
  await expect(second.locator('.card__title')).toHaveText([titles[1]!])
  await expect(first.locator('.panel__toggle')).toBeDisabled()
  await expect(first.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(first.locator('.panel__toggle')).toHaveAccessibleName(/搜索中已展开/)
  await first.locator('.panel__name').click()
  await expect(first.locator('.card')).toHaveCount(1)
  await input.press('ArrowDown')
  await expect(second.locator('.card')).toHaveClass(/is-active/)
  expect(await storedIds(page)).toEqual([firstId, secondId])

  // 搜索只命中另一组时，原组会被卸载；重新出现也必须保留它的偏好。
  await input.fill(titles[1]!)
  await expect(first).toHaveCount(0)
  await input.fill('')
  await expect(first.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await input.fill(`完全没有匹配 ${Date.now()}`)
  await expect(first.locator('.card')).toHaveCount(0)
  await expect(second.locator('.card')).toHaveCount(0)
  await expect(first.locator('.panel__toggle')).toBeEnabled()
  expect(await storedIds(page)).toEqual([firstId, secondId])
  await second.locator('.panel__toggle').click()
  await input.fill('')
  await expect(second.locator('.card')).toHaveCount(1)
  await expect(first.locator('.card')).toHaveCount(0)
})

test('键盘切换后隐藏卡片不参与 Tab，也不残留 Teleport 菜单', async ({ page }) => {
  const { first } = await fixture(page)
  await first.locator('.card__more').click()
  await expect(page.getByRole('menu')).toBeVisible()
  const arrow = first.locator('.panel__toggle')
  await arrow.focus()
  await page.keyboard.press('Space')
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  await expect(first.locator('a')).toHaveCount(0)
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(first.getByRole('button', { name: '添加', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first.getByRole('button', { name: '编辑', exact: true })).toBeFocused()
  await arrow.focus()
  await page.keyboard.press('Enter')
  await expect(first.locator('.card')).toHaveCount(1)
  await first.locator('.card__more').click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('操作其他分组的折叠和工具按钮会关闭卡片菜单，不误折叠', async ({ page }) => {
  const { first, second } = await fixture(page)
  await first.locator('.card__more').click()
  await expect(page.getByRole('menu')).toBeVisible()
  await second.locator('.panel__toggle').click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  // 菜单所属卡片仍挂载，必须由外部点击关闭，不能只靠折叠时卸载卡片。
  await expect(first.locator('.card')).toHaveCount(1)
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')

  for (const [button, title] of [['添加', '添加书签'], ['编辑', '编辑分组']] as const) {
    await first.locator('.card__more').click()
    await expect(page.getByRole('menu')).toBeVisible()
    // 多列布局下菜单可能盖住后一组的右侧工具，用键盘触发同一原生 click。
    await second.getByRole('button', { name: button, exact: true }).press('Enter')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(page.locator('.sheet__title')).toHaveText(title)
    await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
  }
})

test('工具按钮不误折叠，取消 / 保存失败保留偏好，两个新增入口成功后展开目标组', async ({ page }) => {
  const { first, firstId } = await fixture(page)
  const arrow = first.locator('.panel__toggle')
  await arrow.click()
  await first.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.locator('.sheet__title')).toHaveText('编辑分组')
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await first.getByRole('button', { name: '添加', exact: true }).click()
  await expect(page.locator('#bm-group')).toHaveValue(firstId)
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  expect(await storedIds(page)).toEqual([firstId])

  await first.getByRole('button', { name: '添加', exact: true }).click()
  await page.locator('#bm-url').fill(`http://127.0.0.1:1/collapse/save-${Date.now()}`)
  await page.locator('#bm-title').fill('保存失败不展开')
  await page.route('**/api/bookmarks', (route) => route.fulfill({
    status: 500, json: { error: '测试保存失败' },
  }))
  await page.locator('.sheet button[type=submit]').click()
  await expect(page.locator('.toast.is-error')).toContainText('测试保存失败')
  await expect(page.locator('.sheet')).toBeVisible()
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  expect(await storedIds(page)).toEqual([firstId])
  await page.unroute('**/api/bookmarks')
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  for (const entry of ['分组', '顶栏']) {
    if (entry === '分组') await first.getByRole('button', { name: '添加', exact: true }).click()
    else {
      await arrow.click()
      await page.getByRole('button', { name: '新增', exact: true }).click()
      await page.locator('#bm-group').selectOption(firstId)
    }
    const title = `${entry}新增 ${Date.now()}`
    await page.locator('#bm-url').fill(`http://127.0.0.1:1/collapse/save-${Date.now()}`)
    await page.locator('#bm-title').fill(title)
    await page.locator('.sheet button[type=submit]').click()
    await expect(page.locator('.sheet')).toHaveCount(0)
    await expect(arrow).toHaveAttribute('aria-expanded', 'true')
    await expect(first.locator('.card__title', { hasText: title })).toBeVisible()
    expect(await storedIds(page)).not.toContain(firstId)
  }
})

test('折叠组仍可排序和接收书签，拖拽结束不误折叠，下一次点击正常', async ({ page }) => {
  const { first, second, firstId, secondId, firstName, titles } = await fixture(page)
  await first.locator('.panel__toggle').click()
  await second.locator('.panel__toggle').click()
  const target = page.locator('.panels__cell', { has: page.getByRole('heading', { name: firstName, exact: true }) })
  await second.locator('.panel__name').dragTo(target, { targetPosition: { x: 60, y: 5 } })
  const order = async () => {
    const boot = await apiJson<{ groups: { id: string }[] }>(page, '/api/bootstrap')
    return boot.groups.map((group) => group.id).filter((id) => id === firstId || id === secondId)
  }
  await expect.poll(order).toEqual([secondId, firstId])
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  // 显式模拟浏览器在 dragend 后补发 click，不能让它翻转偏好。
  await second.locator('.panel__head').dispatchEvent('click')
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await second.locator('.panel__name').click()
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'true')
  await second.locator('.panel__toggle').click()

  await first.locator('.panel__name').click()
  await first.locator('.card').dragTo(second.locator('.panel__head'))
  await expect(first.locator('.panel__count')).toHaveText('0')
  await expect(second.locator('.panel__count')).toHaveText('2')
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.toast.is-error')).toHaveCount(0)
  await page.reload()
  await expect(second.locator('.panel__count')).toHaveText('2')
  await expect(second.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await second.locator('.panel__toggle').click()
  await expect(second.locator('.card__title')).toHaveText([titles[1]!, titles[0]!])
})

test('损坏偏好和 localStorage 访问被禁用时，首页与内存折叠仍可用', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { first } = await fixture(page)
  await page.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, '{bad json')`)
  await page.reload()
  await expect(first.locator('.card')).toHaveCount(1)
  await first.locator('.panel__toggle').click()
  await expect(first.locator('.card')).toHaveCount(0)
  await page.addInitScript(`Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('Storage blocked', 'SecurityError') }
  })`)
  await page.reload()
  await expect(first.locator('.card')).toHaveCount(1)
  await first.locator('.panel__toggle').click()
  await expect(first.locator('.card')).toHaveCount(0)
  await first.locator('.panel__toggle').click()
  await expect(first.locator('.card')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('读取成功但写入配额失败时，不回滚本次折叠和展开', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { first, firstId } = await fixture(page)
  await first.locator('.panel__toggle').click()
  await page.addInitScript(`Storage.prototype.setItem = function () {
    throw new DOMException('Storage full', 'QuotaExceededError')
  }`)
  await page.reload()
  await expect(first.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
  await first.locator('.panel__toggle').click()
  await expect(first.locator('.card')).toHaveCount(1)
  expect(await storedIds(page)).toEqual([firstId])
  await first.locator('.panel__toggle').click()
  await expect(first.locator('.card')).toHaveCount(0)
  expect(errors).toEqual([])
})

test.describe('手机分组折叠', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('常显箭头可触摸、标题可展开，刷新记忆且无横向溢出', async ({ page }) => {
    const { first, firstId } = await fixture(page)
    await expect(first.locator('.panel__toggle')).toBeVisible()
    await first.locator('.panel__toggle').tap()
    await expect(first.locator('.card')).toHaveCount(0)
    await expect(first.locator('.panel__tools')).toHaveCSS('opacity', '1')
    expect(await storedIds(page)).toEqual([firstId])
    await page.reload()
    await expect(first.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
    await first.getByRole('button', { name: '添加', exact: true }).tap()
    await expect(page.locator('#bm-group')).toHaveValue(firstId)
    await page.getByRole('button', { name: '关闭', exact: true }).tap()
    await expect(first.locator('.panel__toggle')).toHaveAttribute('aria-expanded', 'false')
    await first.locator('.panel__name').tap()
    await expect(first.locator('.card')).toHaveCount(1)
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true)
  })
})
