// 首页操作易用性：删除撤销、拖整张卡片 / 标题栏、菜单直接移分组、搜索 ↑↓ 与主动用搜索引擎。
//
// 不假设库是干净的：每条用例自己建带时间戳的分组和书签，断言只看自己建的那几条，
// 结束时整组删掉（不带 moveTo 删分组时组内书签会被级联删除）。

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { apiJson, login } from './helpers.ts'

/** 连不上的端口：既不会打外网，也不会真的抓到图标 */
const UNREACHABLE = 'http://127.0.0.1:1/interaction'

/** 删除要等这么久才真正提交（与 src/stores/data.ts 的 UNDO_MS 一致） */
const UNDO_MS = 5000

const createdGroups: string[] = []

test.afterEach(async ({ page }) => {
  for (const id of createdGroups.splice(0)) {
    await apiJson(page, `/api/groups/${id}`, { method: 'DELETE' })
  }
})

async function createGroup(page: Page, name: string): Promise<string> {
  const created = await apiJson<{ id: string }>(page, '/api/groups', {
    method: 'POST',
    body: { name },
  })
  createdGroups.push(created.id)
  return created.id
}

/** 按顺序建书签，服务端依次追加在组末尾，所以显示顺序就是入参顺序 */
async function createBookmarks(page: Page, groupId: string, titles: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const [index, title] of titles.entries()) {
    const created = await apiJson<{ id: string }>(page, '/api/bookmarks', {
      method: 'POST',
      body: { groupId, title, url: `${UNREACHABLE}/${Date.now()}-${index}` },
    })
    ids.push(created.id)
  }
  return ids
}

async function serverHas(page: Page, id: string): Promise<boolean> {
  const found = await apiJson<{ id?: string } | null>(page, `/api/bookmarks/${id}`)
  return found?.id === id
}

function panelNamed(page: Page, name: string): Locator {
  return page.locator('.panel', { has: page.locator('.panel__name', { hasText: name }) })
}

function cardTitled(page: Page, title: string): Locator {
  return page.locator('.card', { has: page.locator('.card__title', { hasText: title }) })
}

async function openCardMenu(page: Page, title: string): Promise<void> {
  const card = cardTitled(page, title)
  // 宽屏下「⋯」悬停才显形
  await card.hover()
  await card.locator('.card__more').click()
  await expect(page.getByRole('menu')).toBeVisible()
}

/**
 * window.open 换成桩，理由同 main.spec.ts：真开新标签页会打外网，
 * 而且 headless 下 noopener 弹窗断言不了。换成桩能直接断言交出去的地址。
 */
async function stubWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(`
    window.__opened = []
    window.open = function (url) { window.__opened.push(String(url)); return null }
  `)
}

function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate('window.__opened') as Promise<string[]>
}

test.describe('删除可撤销', () => {
  test('5 秒内点「撤销」：卡片回到原位置，刷新后仍在', async ({ page }) => {
    await login(page)
    const stamp = Date.now()
    const name = `撤销组 ${stamp}`
    const titles = [`甲 ${stamp}`, `乙 ${stamp}`, `丙 ${stamp}`]
    const groupId = await createGroup(page, name)
    await createBookmarks(page, groupId, titles)
    await page.reload()

    const titlesIn = () => panelNamed(page, name).locator('.card__title')
    await expect(titlesIn()).toHaveText(titles)

    await openCardMenu(page, titles[1]!)
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await expect(titlesIn()).toHaveText([titles[0]!, titles[2]!])

    const toast = page.locator('.toast', { hasText: `已删除「${titles[1]}」` })
    await toast.getByRole('button', { name: '撤销' }).click()
    // 插回原来的位置，而不是组末尾
    await expect(titlesIn()).toHaveText(titles)

    // 撤销之后定时器不能再去删：等过了提交时间再刷新
    await page.waitForTimeout(UNDO_MS + 1000)
    await page.reload()
    await expect(titlesIn()).toHaveText(titles)
  })

  test('不撤销：5 秒内服务端还在，到期后真正删除', async ({ page }) => {
    await login(page)
    const stamp = Date.now()
    const name = `到期组 ${stamp}`
    const titles = [`去 ${stamp}`, `留 ${stamp}`]
    const groupId = await createGroup(page, name)
    const [goneId] = await createBookmarks(page, groupId, titles)
    await page.reload()

    await openCardMenu(page, titles[0]!)
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await expect(cardTitled(page, titles[0]!)).toHaveCount(0)

    // 期间只在页面上隐藏，还没调删除接口
    expect(await serverHas(page, goneId!), '撤销窗口内不该提交删除').toBe(true)

    await expect.poll(() => serverHas(page, goneId!), { timeout: UNDO_MS * 2 }).toBe(false)
    await page.reload()
    await expect(panelNamed(page, name).locator('.card__title')).toHaveText([titles[1]!])
  })

  test('删除后 5 秒内拖动同组另一条重排：不报错，刷新后顺序正确', async ({ page }) => {
    await login(page)
    const stamp = Date.now()
    const name = `删后重排 ${stamp}`
    const [a, b, c, d] = [`甲 ${stamp}`, `乙 ${stamp}`, `丙 ${stamp}`, `丁 ${stamp}`]
    const groupId = await createGroup(page, name)
    const ids = await createBookmarks(page, groupId, [a, b, c, d])
    await page.reload()

    const panel = panelNamed(page, name)
    const titlesIn = () => panel.locator('.card__title')

    await openCardMenu(page, b)
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await expect(titlesIn()).toHaveText([a, c, d])

    // 重排接口要全量 id：待删除项必须先提交，否则服务端判「缺项」400
    await cardTitled(page, d).dragTo(panel.locator('.panel__cell').first(), {
      targetPosition: { x: 8, y: 8 },
    })
    await expect(titlesIn()).toHaveText([d, a, c])
    await expect(page.locator('.toast.is-error')).toHaveCount(0)
    // 已经提交了，撤销提示跟着收起
    await expect(page.locator('.toast', { hasText: `已删除「${b}」` })).toHaveCount(0)

    await page.reload()
    await expect(titlesIn()).toHaveText([d, a, c])
    expect(await serverHas(page, ids[1]!)).toBe(false)
  })
})

test.describe('拖整张卡片 / 整个标题栏', () => {
  test('按住卡片中部拖到另一个分组，单击卡片仍打开链接', async ({ page }) => {
    await login(page)
    const stamp = Date.now()
    const from = `拖出组 ${stamp}`
    const to = `拖入组 ${stamp}`
    const [moving, staying, target] = [`移动 ${stamp}`, `原地 ${stamp}`, `目标 ${stamp}`]
    const fromId = await createGroup(page, from)
    const toId = await createGroup(page, to)
    await createBookmarks(page, fromId, [moving, staying])
    await createBookmarks(page, toId, [target])
    await page.reload()

    await panelNamed(page, to).scrollIntoViewIfNeeded()
    // dragTo 默认从源元素正中间按下，正好是「卡片中部」
    await cardTitled(page, moving).dragTo(panelNamed(page, to).locator('.panel__cell').first(), {
      targetPosition: { x: 8, y: 8 },
    })
    await expect(panelNamed(page, to).locator('.card__title')).toHaveText([moving, target])
    await expect(panelNamed(page, from).locator('.card__title')).toHaveText([staying])

    await page.reload()
    await expect(panelNamed(page, to).locator('.card__title')).toHaveText([moving, target])

    // 卡片变成拖拽源之后，普通单击仍要走链接的默认行为。
    // 在 document 上记下这次点击有没有被拦，再拦下来免得真开新标签页。
    await page.evaluate(`(() => {
      window.__clicks = []
      document.addEventListener('click', (event) => {
        const link = event.target.closest('a.card')
        if (!link) return
        window.__clicks.push({ href: link.href, prevented: event.defaultPrevented })
        event.preventDefault()
      })
    })()`)
    await cardTitled(page, staying).click()
    const clicks = (await page.evaluate('window.__clicks')) as { href: string; prevented: boolean }[]
    expect(clicks).toHaveLength(1)
    expect(clicks[0]!.prevented, '单击不能被拖拽逻辑拦掉').toBe(false)
    expect(clicks[0]!.href).toContain(UNREACHABLE)
  })

  test('按住分组标题栏空白处拖动排序；「添加」「编辑」按钮照常', async ({ page }) => {
    await login(page)
    const stamp = Date.now()
    const first = `前组 ${stamp}`
    const second = `后组 ${stamp}`
    await createGroup(page, first)
    await createGroup(page, second)
    await page.reload()
    await expect(panelNamed(page, second)).toBeVisible()

    const names = () => page.locator('.panel__name').allTextContents()
    const order = async () => {
      const list = await names()
      return list.indexOf(second) + 1 === list.indexOf(first)
    }
    expect(await order(), '新建的两个分组此时是 前组、后组').toBe(false)

    // 从计数和「添加」按钮之间的空白处按下
    const head = panelNamed(page, second).locator('.panel__head')
    const headBox = await head.boundingBox()
    const countBox = await head.locator('.panel__count').boundingBox()
    expect(headBox).not.toBeNull()
    expect(countBox).not.toBeNull()
    const cell = page.locator('.panels__cell', { has: page.locator('.panel__name', { hasText: first }) })
    await head.dragTo(cell, {
      sourcePosition: { x: countBox!.x - headBox!.x + countBox!.width + 16, y: headBox!.height / 2 },
      // 落在目标面板上半部：按上下半边判断前后
      targetPosition: { x: 40, y: 8 },
    })
    await expect.poll(order).toBe(true)

    await page.reload()
    await expect(page.locator('.panel__name', { hasText: first })).toBeVisible()
    expect(await order(), '分组顺序要落到服务端').toBe(true)

    // 标题栏整条可拖之后，按钮的点击不能受影响
    await panelNamed(page, first).getByRole('button', { name: '编辑' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('编辑分组')
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('.sheet')).toHaveCount(0)

    await panelNamed(page, first).getByRole('button', { name: '添加' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('添加书签')
    await page.getByRole('button', { name: '关闭' }).click()
  })
})

test('卡片菜单里直接点分组：书签移过去并提示，菜单里没有当前分组', async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const from = `移出组 ${stamp}`
  const to = `移入组 ${stamp}`
  const title = `待移动 ${stamp}`
  const fromId = await createGroup(page, from)
  await createGroup(page, to)
  await createBookmarks(page, fromId, [title])
  await page.reload()

  await openCardMenu(page, title)
  await expect(page.getByRole('group', { name: '移到分组' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: from, exact: true })).toHaveCount(0)

  // 分组多时目标可能在菜单下方，click 会先在菜单内部滚过去（菜单自己的滚动不会收起菜单）
  await page.getByRole('menuitem', { name: to, exact: true }).click()

  await expect(page.locator('.toast', { hasText: `已移到「${to}」` })).toBeVisible()
  await expect(panelNamed(page, to).locator('.card__title')).toHaveText([title])
  await expect(panelNamed(page, from).locator('.card__title')).toHaveCount(0)
  // 不再经过侧栏面板
  await expect(page.locator('.sheet')).toHaveCount(0)

  await page.reload()
  await expect(panelNamed(page, to).locator('.card__title')).toHaveText([title])
})

test('分组标题栏的「添加」默认选中这个分组，不是排序第一的分组', async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const target = `添加目标组 ${stamp}`
  const title = `标题栏添加 ${stamp}`
  // 新建的分组排在最后，一定不是第一个
  const targetId = await createGroup(page, target)
  await page.reload()

  await panelNamed(page, target).getByRole('button', { name: '添加' }).click()
  await expect(page.locator('.sheet__title')).toHaveText('添加书签')
  await expect(page.locator('#bm-group')).toHaveValue(targetId)

  await page.locator('#bm-url').fill(`${UNREACHABLE}/add-${stamp}`)
  await page.locator('#bm-url').blur()
  await expect(page.locator('.field__hint')).toContainText('手动填写')
  await page.locator('#bm-title').fill(title)
  await page.locator('.sheet button[type=submit]').click()

  await expect(page.locator('.sheet')).toHaveCount(0)
  await expect(panelNamed(page, target).locator('.card__title')).toHaveText([title])
})

test.describe('搜索', () => {
  test('↓↓ 回车打开显示顺序里的第三条；当前项有描边、提示行跟着变', async ({ page }) => {
    await stubWindowOpen(page)
    await login(page)
    const stamp = Date.now()
    const term = `检索 ${stamp}`
    const titles = [`${term} 一`, `${term} 二`, `${term} 三`]
    const groupId = await createGroup(page, `检索组 ${stamp}`)
    await createBookmarks(page, groupId, titles)
    await page.reload()

    const input = page.locator('.search__input')
    const hint = page.locator('.search__hint')
    await input.fill(term)
    await expect(hint).toContainText(`回车打开「${titles[0]}」`)
    await expect(cardTitled(page, titles[0]!)).toHaveClass(/is-active/)

    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await expect(hint).toContainText(`回车打开「${titles[2]}」`)
    await expect(cardTitled(page, titles[2]!)).toHaveClass(/is-active/)
    await expect(page.locator('.card.is-active')).toHaveCount(1)

    // 到头不循环
    await input.press('ArrowDown')
    await expect(hint).toContainText(`回车打开「${titles[2]}」`)

    // 要拿到书签的真实地址，才能断言打开的是第三条
    const boot = await apiJson<{ bookmarks: { title: string; url: string }[] }>(page, '/api/bootstrap')
    const third = boot.bookmarks.find((item) => item.title === titles[2])
    expect(third).toBeDefined()

    await input.press('Enter')
    expect(await openedUrls(page)).toEqual([third!.url])

    // 改搜索词后回到第一项
    await input.fill(`${term} `)
    await expect(hint).toContainText(`回车打开「${titles[0]}」`)
  })

  test('Shift+回车、「用 {搜索引擎} 搜」按钮：有匹配也用搜索引擎', async ({ page }) => {
    await stubWindowOpen(page)
    await login(page)
    const stamp = Date.now()
    const term = `引擎 ${stamp}`
    const groupId = await createGroup(page, `引擎组 ${stamp}`)
    await createBookmarks(page, groupId, [`${term} 书签`])
    await page.reload()

    const settings = await apiJson<{ searchEngine: { name: string; template: string } }>(
      page,
      '/api/settings',
    )
    const engine = settings.searchEngine
    const expected = engine.template.replace('%s', encodeURIComponent(term))

    const input = page.locator('.search__input')
    await input.fill(term)
    await expect(page.locator('.search__hint')).toContainText(
      `回车打开「${term} 书签」 · Shift+回车 用 ${engine.name} 搜`,
    )

    await input.press('Shift+Enter')
    expect(await openedUrls(page)).toEqual([expected])

    await page.getByRole('button', { name: `用 ${engine.name} 搜` }).click()
    expect(await openedUrls(page)).toEqual([expected, expected])
  })
})
