// 端到端测试的公共装置。

import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const PASSWORD = process.env.NAV_PASSWORD ?? ''

export async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.locator('input[type=password]').press('Enter')
  await expect(page.locator('.topbar__brand')).toBeVisible()
}

/**
 * 通过页面自身发请求，而不是用 Playwright 的 APIRequestContext。
 *
 * 原因在 Secure Cookie：容器里 NODE_ENV=production，会话 Cookie 带 Secure。
 * 浏览器把 http://127.0.0.1 当可信来源，允许在 http 下存取它；
 * 而 APIRequestContext 按字面语义处理，纯 http 下会直接丢掉这个 Cookie，
 * 于是「页面已登录」和「page.request 却 401」会同时成立。
 * 走页面自身的 fetch 就没有这个错位。
 */
export async function apiJson<T>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const request = {
    method: init?.method ?? 'GET',
    ...(init?.body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }),
  }

  return (await page.evaluate(
    `fetch(${JSON.stringify(path)}, ${JSON.stringify(request)})
       .then((r) => r.text())
       .then((t) => { try { return JSON.parse(t) } catch { return null } })`,
  )) as T
}

/** 每个元素是否真的画在最上层——只有 elementFromPoint 问得出来 */
export function topmostAt(page: Page, selector: string): Promise<string> {
  return page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'missing'
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (hit === el || (hit && el.contains(hit))) return 'self'
    return hit ? String(hit.className) : 'none'
  })()`) as Promise<string>
}
