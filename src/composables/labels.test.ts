import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayHost, findDuplicateTitleKeys, hueOf, initialOf, titleKey } from './labels.ts'

describe('initialOf', () => {
  it('转大写：小写 l 不再像 I', () => {
    assert.equal(initialOf('lucky API'), 'L')
  })

  it('跳过开头的括号等符号', () => {
    assert.equal(initialOf('（codex2）CPA Manager Plus'), 'C')
    assert.equal(initialOf('  [beta] tool'), 'B')
  })

  it('汉字与数字照取', () => {
    assert.equal(initialOf('米饭机'), '米')
    assert.equal(initialOf('3D 打印'), '3')
  })

  it('emoji、全是符号、空串都返回 ?', () => {
    assert.equal(initialOf('🚀🚀'), '?')
    assert.equal(initialOf('——·'), '?')
    assert.equal(initialOf(''), '?')
  })

  it('跳过 emoji 取后面的字', () => {
    assert.equal(initialOf('🚀 rocket'), 'R')
  })
})

describe('hueOf', () => {
  /** 原 FallbackIcon.vue 里的实现，逐字照搬，用来确认搬家后颜色一个都没变 */
  function legacyHue(url: string): number {
    let host = url
    try {
      host = new URL(url).hostname
    } catch {
      /* 网址解析不了就用原串 */
    }
    let hash = 0
    for (let i = 0; i < host.length; i += 1) {
      hash = (hash * 31 + host.charCodeAt(i)) % 360
    }
    return hash
  }

  it('与旧实现结果一致', () => {
    const urls = [
      'https://example.com',
      'https://cpa-codex.lucky0506.shop/#/login',
      'https://mail.lucky04.dpdns.org/admin',
      'https://www.google.com/search?q=1',
      'http://127.0.0.1:8080/',
      'not a url',
      '',
    ]
    for (const url of urls) assert.equal(hueOf(url), legacyHue(url), url)
  })

  it('只看主机名：同一个站的不同页面同色', () => {
    assert.equal(hueOf('https://mail.lucky04.dpdns.org/'), hueOf('https://mail.lucky04.dpdns.org/admin'))
  })

  it('落在 0～359', () => {
    const hue = hueOf('https://some-very-long-hostname.example.org')
    assert.ok(hue >= 0 && hue < 360)
  })
})

describe('titleKey / findDuplicateTitleKeys', () => {
  it('去掉首尾空白、不区分大小写', () => {
    assert.equal(titleKey('  CLI Proxy API  '), 'cli proxy api')
  })

  it('只返回出现两次及以上的键', () => {
    const keys = findDuplicateTitleKeys([
      { title: 'CLI Proxy API Management Center' },
      { title: ' cli proxy api management center ' },
      { title: 'CLI Proxy API Management Center' },
      { title: 'NewAPI Middleware Tool' },
      { title: '我的 API 店铺 · 首页' },
      { title: '我的 API 店铺 · 后台' },
    ])
    assert.deepEqual([...keys], ['cli proxy api management center'])
  })

  it('空列表返回空集合', () => {
    assert.equal(findDuplicateTitleKeys([]).size, 0)
  })
})

describe('displayHost', () => {
  it('去掉开头的 www.', () => {
    assert.equal(displayHost('https://www.example.com/a?b=1'), 'example.com')
  })

  it('只去开头，不误伤别处的 www', () => {
    assert.equal(displayHost('https://wwwx.com/'), 'wwwx.com')
    assert.equal(displayHost('https://a.www.example.com/'), 'a.www.example.com')
  })

  it('带端口、路径、hash 时只留主机名', () => {
    assert.equal(displayHost('https://cpa-codex.lucky0506.shop:8443/#/login'), 'cpa-codex.lucky0506.shop')
  })

  it('网址解析失败时返回原串', () => {
    assert.equal(displayHost('not a url'), 'not a url')
  })
})
