/* 三版样稿共用的渲染函数：卡片、分组、顶栏、搜索框、壁纸、样稿工具条。
   用普通脚本而不是 ES 模块：直接双击用 file:// 打开时，浏览器会拦掉模块脚本。 */
;(function () {
  const WP_BASE = '../../../../public/wallpapers/'
  const WALLPAPERS = [
    { id: 'w-01', portrait: 941 },
    { id: 'w-02', portrait: 940 },
    { id: 'w-03', portrait: 940 },
    { id: 'w-04', portrait: 941 },
  ]
  const VARIANTS = [
    { file: 'a.html', label: 'A 左栏海报' },
    { file: 'b.html', label: 'B 玻璃启动器' },
    { file: 'c.html', label: 'C 全宽瀑布' },
  ]

  const SVG = {
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    more: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    gear: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.86a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.1l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" stroke="currentColor" stroke-width="1.5"/></svg>',
  }

  const DATA = window.NAV_DATA
  const TOTAL = DATA.reduce((sum, group) => sum + group.bookmarks.length, 0)

  /** 极简的建元素工具：attrs 里 html 写 innerHTML、text 写文本，其余当属性 */
  function h(tag, attrs, children) {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue
      if (key === 'html') node.innerHTML = value
      else if (key === 'text') node.textContent = value
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value)
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
      else node.setAttribute(key, value === true ? '' : value)
    }
    for (const child of [].concat(children || [])) if (child) node.append(child)
    return node
  }

  function hostname(url) {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  /** 已定：标题重复时显示主机名。判重范围是全部书签，去掉首尾空白、不区分大小写 */
  const titleKey = (title) => title.trim().toLowerCase()
  const titleCount = new Map()
  for (const group of DATA) {
    for (const bookmark of group.bookmarks) {
      const key = titleKey(bookmark.title)
      titleCount.set(key, (titleCount.get(key) || 0) + 1)
    }
  }

  function duplicateHost(bookmark) {
    return titleCount.get(titleKey(bookmark.title)) > 1 ? hostname(bookmark.url).replace(/^www\./, '') : null
  }

  /** 与线上 FallbackIcon 相同：域名哈希决定色相 */
  function hue(url) {
    const host = hostname(url)
    let hash = 0
    for (let i = 0; i < host.length; i += 1) hash = (hash * 31 + host.charCodeAt(i)) % 360
    return hash
  }

  /** 已确认的新规则：取第一个字母、数字或汉字并转大写，跳过括号等符号 */
  function initial(title) {
    const match = title.match(/[\p{L}\p{N}]/u)
    return match ? [...match[0].toUpperCase()][0] : '?'
  }

  function icon(bookmark, size) {
    if (bookmark.icon) {
      return h('img', { class: 'card__icon', src: bookmark.icon, alt: '', width: size, height: size, draggable: 'false' })
    }
    // 色相走 --h 变量，具体配色交给 base.css，方便工具条切换对比
    return h('span', {
      class: 'fallback',
      style: `--h: ${hue(bookmark.url)}`,
      'aria-hidden': 'true',
      text: initial(bookmark.title),
    })
  }

  function card(bookmark, options) {
    const size = (options && options.iconSize) || 32
    const host = duplicateHost(bookmark)
    return h('li', { class: 'panel__cell' }, [
      h(
        'a',
        {
          class: 'card',
          href: bookmark.url,
          title: bookmark.url,
          // 样稿里不真的跳转，免得误点进线上站点
          onclick: (event) => event.preventDefault(),
        },
        [
          icon(bookmark, size),
          h('span', { class: 'card__text' }, [
            h('span', { class: 'card__title', text: bookmark.title }),
            host ? h('span', { class: 'card__host', text: host }) : null,
          ]),
          h('span', { class: 'card__more', html: SVG.more, 'aria-hidden': 'true' }),
        ],
      ),
    ])
  }

  function groupHead(group) {
    return h('header', { class: 'panel__head' }, [
      group.icon ? h('span', { class: 'panel__icon', 'aria-hidden': 'true', text: group.icon }) : null,
      h('h2', { class: 'panel__name', text: group.name, title: group.name }),
      h('span', { class: 'panel__count', text: String(group.bookmarks.length) }),
      h('span', { class: 'panel__rule', 'aria-hidden': 'true' }),
      h('span', { class: 'panel__tools' }, [
        h('button', { class: 'panel__tool', type: 'button', 'aria-label': '添加', title: '添加书签到这个分组', html: SVG.plus }),
        h('button', { class: 'panel__tool', type: 'button', 'aria-label': '编辑', title: '编辑分组', html: SVG.edit }),
      ]),
    ])
  }

  function panel(group, options) {
    return h('div', { class: 'panels__cell' }, [
      h('section', { class: 'panel' }, [
        groupHead(group),
        h('ul', { class: 'panel__grid' }, group.bookmarks.map((bookmark) => card(bookmark, options))),
      ]),
    ])
  }

  function addGroupButton() {
    return h('button', { class: 'add-group', type: 'button', html: `${SVG.plus}<span>新建分组</span>` })
  }

  function topbar() {
    return h('header', { class: 'top' }, [
      h('div', { class: 'top__brand' }, [
        h('span', { class: 'top__title', text: '书签' }),
        h('span', { class: 'top__count', text: String(TOTAL) }),
      ]),
      h('div', { class: 'top__actions' }, [
        h('button', { class: 'btn-primary', type: 'button', html: `${SVG.plus}<span>新增</span>` }),
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': '设置', title: '设置', html: SVG.gear }),
      ]),
    ])
  }

  function search() {
    return h('label', { class: 'search' }, [
      h('span', { html: SVG.search }),
      h('input', { type: 'search', placeholder: '搜索书签，或直接回车用搜索引擎搜', 'aria-label': '搜索书签' }),
      h('kbd', { text: '/' }),
    ])
  }

  // ---------------- 壁纸 ----------------

  function currentWallpaper() {
    const fromQuery = new URLSearchParams(location.search).get('wp')
    let stored = null
    try {
      stored = localStorage.getItem('mock-wp')
    } catch {
      /* file:// 下个别浏览器不给用本地存储，退回默认壁纸即可 */
    }
    const id = fromQuery || stored || 'w-01'
    return WALLPAPERS.some((item) => item.id === id) ? id : 'w-01'
  }

  let wallpaperId = currentWallpaper()

  function wallpaperSources(id) {
    const item = WALLPAPERS.find((entry) => entry.id === id)
    return {
      landscape: `${WP_BASE}${id}-landscape-1672.webp`,
      portrait: `${WP_BASE}${id}-portrait-${item.portrait}.webp`,
    }
  }

  function mountWallpaper(host) {
    const sources = wallpaperSources(wallpaperId)
    host.append(
      h('picture', {}, [
        h('source', { media: '(orientation: portrait)', srcset: sources.portrait }),
        h('img', { src: sources.landscape, alt: '' }),
      ]),
      h('div', { class: 'wp__scrim' }),
    )
  }

  function setWallpaper(id) {
    wallpaperId = id
    const sources = wallpaperSources(id)
    document.querySelector('.wp source').srcset = sources.portrait
    document.querySelector('.wp img').src = sources.landscape
    // 记住选择只是方便来回切换；file:// 下可能被拒，失败就算了
    try {
      localStorage.setItem('mock-wp', id)
      const url = new URL(location.href)
      url.searchParams.set('wp', id)
      history.replaceState(null, '', url)
    } catch {
      /* 忽略 */
    }
  }

  // ---------------- 样稿工具条 ----------------

  /**
   * note: 这一版的一句话说明，显示在工具条第一行
   * extras: [{ label, options: [{ text, value }], value, onChange }]
   * 用来在同一版里切换某个可选项（比如分组面板要不要模糊）。
   */
  function mountToolbar(currentFile, note, extras) {
    const bar = h('div', { class: 'mock-bar', role: 'toolbar', 'aria-label': '样稿切换' })
    if (note) bar.append(h('span', { class: 'mock-bar__note', text: note }))

    const variants = h('div', { class: 'mock-bar__group' }, [h('span', { class: 'mock-bar__label', text: '样稿' })])
    for (const variant of VARIANTS) {
      variants.append(
        h('a', {
          href: variant.file,
          class: variant.file === currentFile ? 'is-on' : undefined,
          text: variant.label,
          // 带上当前壁纸，换版时不跳回第一张
          onclick: (event) => {
            event.preventDefault()
            location.href = `${variant.file}?wp=${wallpaperId}`
          },
        }),
      )
    }
    bar.append(variants)

    const wallpapers = h('div', { class: 'mock-bar__group' }, [h('span', { class: 'mock-bar__label', text: '壁纸' })])
    WALLPAPERS.forEach((item, index) => {
      const button = h('button', {
        type: 'button',
        class: item.id === wallpaperId ? 'is-on' : undefined,
        text: String(index + 1),
        onclick: () => {
          setWallpaper(item.id)
          for (const other of wallpapers.querySelectorAll('button')) other.classList.toggle('is-on', other === button)
        },
      })
      wallpapers.append(button)
    })
    bar.append(wallpapers)

    for (const extra of extras || []) {
      const group = h('div', { class: 'mock-bar__group' }, [h('span', { class: 'mock-bar__label', text: extra.label })])
      for (const option of extra.options) {
        const button = h('button', {
          type: 'button',
          class: option.value === extra.value ? 'is-on' : undefined,
          text: option.text,
          onclick: () => {
            extra.onChange(option.value)
            for (const other of group.querySelectorAll('button')) other.classList.toggle('is-on', other === button)
          },
        })
        group.append(button)
      }
      bar.append(group)
    }

    const size = h('span', { class: 'mock-bar__size' })
    const syncSize = () => {
      size.textContent = `${innerWidth}×${innerHeight}`
    }
    syncSize()
    addEventListener('resize', syncSize)
    bar.append(size)

    document.body.append(bar)
  }

  window.Mock = {
    DATA,
    TOTAL,
    SVG,
    h,
    icon,
    card,
    panel,
    groupHead,
    addGroupButton,
    topbar,
    search,
    mountWallpaper,
    mountToolbar,
  }
})()
