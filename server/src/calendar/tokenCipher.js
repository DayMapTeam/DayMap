import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export function createTokenCipher(encodedKey) {
  const key = Buffer.from(encodedKey ?? '', 'base64')
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  }
  return {
    encrypt(value) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`
    },
    decrypt(value) {
      const [version, iv, tag, data, extra] = value.split('.')
      if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Invalid encrypted token')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      decipher.setAuthTag(Buffer.from(tag, 'base64url'))
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
    },
  }
}
