// 一条命令并行起前端与后端；Ctrl+C 一起退出。
// 不引 concurrently，避免为一个开发便利加依赖。
import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npm = isWindows ? 'npm.cmd' : 'npm'

const children = ['dev:api', 'dev:web'].map((script) =>
  spawn(npm, ['run', script], {
    stdio: 'inherit',
    // Windows 上 spawn .cmd 必须走 shell，否则 EINVAL
    shell: isWindows,
  }),
)

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill()
  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code) => shutdown(code ?? 0))
  child.on('error', (err) => {
    console.error(`[dev] 启动失败：${err.message}`)
    shutdown(1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
