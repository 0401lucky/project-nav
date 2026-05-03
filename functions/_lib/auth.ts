function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4
  const fixed = (s + (pad ? '='.repeat(4 - pad) : ''))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bin = atob(fixed)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(secret: string, msg: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
}

export async function signToken(secret: string, ttlMs: number) {
  const payload = JSON.stringify({ exp: Date.now() + ttlMs })
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payload))
  const sig = await hmac(secret, payloadB64)
  return {
    token: `${payloadB64}.${base64UrlEncode(sig)}`,
    expiresAt: Date.now() + ttlMs,
  }
}

export async function verifyToken(
  secret: string | null | undefined,
  token: string | null | undefined,
): Promise<boolean> {
  if (!secret) return false
  if (!token) return false
  const [payloadB64, sigB64] = token.split('.')
  if (!payloadB64 || !sigB64) return false

  let exp = 0
  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64))
    exp = JSON.parse(payloadJson).exp
  } catch {
    return false
  }
  if (typeof exp !== 'number' || exp <= Date.now()) return false

  const expected = await hmac(secret, payloadB64)
  const got = base64UrlDecode(sigB64)
  const expBytes = new Uint8Array(expected)
  if (got.length !== expBytes.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expBytes[i]
  return diff === 0
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

export function getBearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}
