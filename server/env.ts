// 启动配置。环境变量缺失或有明显问题时立刻抛错退出，不做静默兜底。

export interface ServerConfig {
  password: string
  sessionSecret: string
  port: number
  dataDir: string
  /** 生产环境给会话 Cookie 加 Secure，由 NODE_ENV 推导 */
  secureCookies: boolean
}

const MIN_SECRET_BYTES = 32
const DEFAULT_PORT = 3000
const DEFAULT_DATA_DIR = './data'

export function loadConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing: string[] = []
  // 密码按原样使用（不做 trim），但全空白视为未配置
  const password = source.PASSWORD ?? ''
  if (password.trim() === '') missing.push('PASSWORD')

  const sessionSecret = source.SESSION_SECRET ?? ''
  if (sessionSecret === '') missing.push('SESSION_SECRET')

  if (missing.length > 0) {
    throw new Error(
      `缺少必需的环境变量：${missing.join('、')}。参照 .env.example 配置后重启`,
    )
  }
  if (Buffer.byteLength(sessionSecret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `SESSION_SECRET 至少需要 ${MIN_SECRET_BYTES} 字节，可用 openssl rand -hex 32 生成`,
    )
  }

  return {
    password,
    sessionSecret,
    port: parsePort(source.PORT),
    dataDir: (source.DATA_DIR ?? '').trim() || DEFAULT_DATA_DIR,
    secureCookies: source.NODE_ENV === 'production',
  }
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必须是 1-65535 的整数，当前为「${raw}」`)
  }
  return port
}
