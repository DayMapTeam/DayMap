import assert from 'node:assert/strict'
import test from 'node:test'
import { nodeIsSupported, parseEnv, updateEnvText, validEncryptionKey } from './lib.mjs'

test('env files are read as KEY=value, skipping comments and removing quotes', () => {
  assert.deepEqual(parseEnv('# comment\nA=1\n\nB = "two words"\nexport C=\'3\'\nD=\nnot a setting\n'),
    { A: '1', B: 'two words', C: '3', D: '' })
  assert.deepEqual(parseEnv('A=x=y\r\nB=2\r\n'), { A: 'x=y', B: '2' })
})

test('updating an env file keeps comments and other settings, and adds new keys at the end', () => {
  const before = '# Maps\nVITE_GOOGLE_MAPS_API_KEY=\nVITE_TRAVEL_PROVIDER=google\n'
  assert.equal(updateEnvText(before, { VITE_GOOGLE_MAPS_API_KEY: 'abc', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }),
    '# Maps\nVITE_GOOGLE_MAPS_API_KEY=abc\nVITE_TRAVEL_PROVIDER=google\nVITE_SUPABASE_URL=http://127.0.0.1:54321\n')
  assert.equal(updateEnvText('', { A: '1' }), 'A=1\n')
  assert.equal(updateEnvText('A=1\n', { A: '1' }), 'A=1\n', 'unchanged text stays identical')
})

test('Node 22.9 or newer is required', () => {
  assert.equal(nodeIsSupported('22.9.0'), true)
  assert.equal(nodeIsSupported('24.0.0'), true)
  assert.equal(nodeIsSupported('22.8.1'), false)
  assert.equal(nodeIsSupported('20.18.0'), false)
})

test('the Calendar token key must be base64 of exactly 32 bytes', () => {
  assert.equal(validEncryptionKey(Buffer.alloc(32, 7).toString('base64')), true)
  assert.equal(validEncryptionKey(Buffer.alloc(16).toString('base64')), false)
  assert.equal(validEncryptionKey('not base64!'), false)
  assert.equal(validEncryptionKey(undefined), false)
})
