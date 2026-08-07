/**
 * 安全存储模块 — 使用 Web Crypto API (AES-GCM) 加密敏感数据。
 *
 * 加密密钥仅在当前 JavaScript 闭包中持有，不写入任何持久化存储。
 * 即使 XSS 攻击者读取了 sessionStorage，也只能获得加密后的密文。
 *
 * 注意：这不是绝对安全的方案（XSS 攻击者仍可在解密时通过 hook 截获明文），
 * 但相比明文存储，显著提高了攻击门槛。
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const ENCRYPTED_PREFIX = 'enc:v1:'

let cryptoKeyPromise: Promise<CryptoKey> | null = null

function getOrCreateKey(): Promise<CryptoKey> {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = crypto.subtle.generateKey(
      { name: ALGORITHM, length: KEY_LENGTH },
      false, // 不可导出
      ['encrypt', 'decrypt'],
    )
  }
  return cryptoKeyPromise
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * 加密字符串并返回 Base64 编码的密文（含 IV 前缀）。
 * 格式: enc:v1:<base64(iv)>:<base64(ciphertext)>
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return ''

  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  )

  const ivB64 = arrayBufferToBase64(iv.buffer)
  const ctB64 = arrayBufferToBase64(ciphertext)
  return `${ENCRYPTED_PREFIX}${ivB64}:${ctB64}`
}

/**
 * 解密字符串，返回原始明文。如果不是加密格式则直接返回。
 */
export async function decrypt(encrypted: string): Promise<string> {
  if (!encrypted) return ''
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
    // 兼容旧版明文存储：直接返回
    return encrypted
  }

  try {
    const payload = encrypted.slice(ENCRYPTED_PREFIX.length)
    const sepIndex = payload.indexOf(':')
    if (sepIndex === -1) return ''

    const ivB64 = payload.slice(0, sepIndex)
    const ctB64 = payload.slice(sepIndex + 1)

    const key = await getOrCreateKey()
    const iv = new Uint8Array(base64ToArrayBuffer(ivB64))
    const ciphertext = base64ToArrayBuffer(ctB64)

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext,
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    // 解密失败（密钥不匹配或数据损坏），返回空
    return ''
  }
}