import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadConfig } from '../env.ts'

const MINIMAL = {
  PASSWORD: 'open-sesame',
  SESSION_SECRET: 'x'.repeat(48),
}

function config(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({ ...MINIMAL, ...overrides })
}

describe('配置读取', () => {
  it('缺 PASSWORD 或 SESSION_SECRET 时抛错并说明缺哪个', () => {
    assert.throws(() => loadConfig({}), /PASSWORD.*SESSION_SECRET/)
    assert.throws(() => loadConfig({ PASSWORD: 'x' }), /SESSION_SECRET/)
    assert.throws(() => loadConfig({ SESSION_SECRET: 'y'.repeat(48) }), /PASSWORD/)
  })

  it('全空白的密码视为未配置', () => {
    assert.throws(() => config({ PASSWORD: '   ' }), /PASSWORD/)
  })

  it('SESSION_SECRET 不足 32 字节时拒绝', () => {
    assert.throws(() => config({ SESSION_SECRET: 'x'.repeat(31) }), /32/)
    assert.doesNotThrow(() => config({ SESSION_SECRET: 'x'.repeat(32) }))
  })

  it('端口与数据目录有默认值，非法端口直接拒绝', () => {
    assert.equal(config().port, 3000)
    assert.equal(config().dataDir, './data')
    assert.equal(config({ PORT: '8080' }).port, 8080)
    assert.throws(() => config({ PORT: 'abc' }), /PORT/)
    assert.throws(() => config({ PORT: '70000' }), /PORT/)
  })

  it('密码按原样使用，不做 trim', () => {
    assert.equal(config({ PASSWORD: ' pa ss ' }).password, ' pa ss ')
  })
})

describe('会话 Cookie 的 Secure 判定', () => {
  it('生产默认加，非生产默认不加', () => {
    assert.equal(config({ NODE_ENV: 'production' }).secureCookies, true)
    assert.equal(config({ NODE_ENV: 'development' }).secureCookies, false)
    assert.equal(config().secureCookies, false)
  })

  it('COOKIE_SECURE 能覆盖默认值', () => {
    // 内网纯 HTTP 自部署时 Secure 会让 Cookie 永远种不上，必须能关掉
    assert.equal(config({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).secureCookies, false)
    assert.equal(config({ COOKIE_SECURE: '0' }).secureCookies, false)
    // 反过来在非生产也要能强制打开（比如本地起 HTTPS 反代）
    assert.equal(config({ COOKIE_SECURE: 'true' }).secureCookies, true)
    assert.equal(config({ COOKIE_SECURE: '1' }).secureCookies, true)
  })

  it('无法识别的值退回按 NODE_ENV 判断', () => {
    assert.equal(config({ NODE_ENV: 'production', COOKIE_SECURE: 'maybe' }).secureCookies, true)
    assert.equal(config({ COOKIE_SECURE: '  ' }).secureCookies, false)
  })
})
