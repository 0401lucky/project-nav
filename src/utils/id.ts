const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function nanoid(size = 8): string {
  let id = ''
  const arr = new Uint8Array(size)
  crypto.getRandomValues(arr)
  for (let i = 0; i < size; i++) id += ALPHABET[arr[i] % ALPHABET.length]
  return id
}
