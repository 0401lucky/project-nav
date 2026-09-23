import { defineConfig } from '@playwright/test'

/** 允许用系统已装的浏览器跑，省掉一次浏览器下载 */
const BROWSER_CHANNELS = ['chrome', 'msedge', 'chromium'] as const

function channelFromEnv(): (typeof BROWSER_CHANNELS)[number] | undefined {
  const raw = process.env.NAV_BROWSER_CHANNEL
  return BROWSER_CHANNELS.find((item) => item === raw)
}

/**
 * e2e 跑在一个已经起好的实例上（本地或 docker compose），
 * 所以这里不负责拉起服务，只约定地址。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // 单人站点，串行跑就够；也不开重试，避免把偶发失败盖过去
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.NAV_BASE_URL ?? 'http://127.0.0.1:3000',
    headless: true,
    // 默认用 Playwright 自带的 chromium；本机没下载时可用
    // NAV_BROWSER_CHANNEL=chrome 走系统 Chrome
    channel: channelFromEnv(),
    // 失败时留一份可回看的现场
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
