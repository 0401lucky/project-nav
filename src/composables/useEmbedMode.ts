// 嵌入模式检测：URL 参数显式覆盖 > iframe 自动判断
//   ?embed=1 / ?bare=1 / ?embed=true → 强制嵌入
//   ?embed=0 / ?embed=false           → 强制非嵌入
//   未指定                            → 检测 self !== top
export function detectEmbedMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const v = (params.get('embed') ?? params.get('bare') ?? '').toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  try {
    return window.self !== window.top
  } catch {
    // 跨域 iframe 访问 top 会抛 SecurityError，说明是被嵌入了
    return true
  }
}

// 嵌入模式下顶部留出的高度（避开宿主页面 sticky 顶栏）
//   ?offsetTop=N （N 是 px，0-300 之间）
//   默认 64px（适配 NewAPI 等常见后台）
export function detectEmbedOffsetTop(): number {
  const DEFAULT = 64
  if (typeof window === 'undefined') return DEFAULT
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('offsetTop') ?? params.get('topOffset')
  if (!raw) return DEFAULT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0 || n > 300) return DEFAULT
  return n
}
