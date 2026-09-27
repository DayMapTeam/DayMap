// Shared helpers for `npm run setup`, `dev`, `doctor` and `stop`. Node
// built-ins only, so they work before any package is installed.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const FILES = {
  client: join(ROOT, 'client', '.env.local'),
  server: join(ROOT, 'server', '.env'),
  supabase: join(ROOT, 'supabase', '.env'),
}
export const MIN_NODE = [22, 9]
export const PORTS = { api: 3001, web: 5173 }
export const CALENDAR_KEYS = ['DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY']
export const CALENDAR_REDIRECT = `http://localhost:${PORTS.api}/api/calendar/callback`

// The services DayMap doesn't use; skipping them saves memory and start time.
const SKIPPED_SERVICES = 'realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor'
const SUPABASE_CLI = 'supabase@^2'
const windows = process.platform === 'win32'

const paint = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text)
export const bold = paint('1')
export const dim = paint('2')
export const green = paint('32')
export const red = paint('31')
export const yellow = paint('33')
export const cyan = paint('36')

/** `KEY=value` lines to an object. Comments and blank lines are skipped; quotes are removed. */
export function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const [, key, raw] = match
    values[key] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw
  }
  return values
}

export function readEnv(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
}

/**
 * Set keys in an env file's text, keeping every other line (comments, other
 * settings) as it is. Keys that aren't there yet are added at the end.
 */
export function updateEnvText(text, updates) {
  const pending = new Map(Object.entries(updates))
  const lines = text === '' ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/)
  const out = lines.map((line) => {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]
    if (!key || !pending.has(key)) return line
    const value = pending.get(key)
    pending.delete(key)
    return `${key}=${value}`
  })
  for (const [key, value] of pending) out.push(`${key}=${value}`)
  return `${out.join('\n')}\n`
}

/** Write settings to an env file (readable by you only). Returns true when the file changed. */
export function writeEnv(file, updates) {
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const after = updateEnvText(before, updates)
  if (after === before) return false
  writeFileSync(file, after, { mode: 0o600 })
  return true
}

/** Whether Node is at least MIN_NODE. */
export function nodeIsSupported(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number)
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1])
}

/** Run a command and wait. Output goes to the terminal unless `quiet`. */
export function run(command, args, { cwd = ROOT, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', shell: windows, stdio: quiet ? 'pipe' : 'inherit',
  })
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** Start a long-running command. */
export function start(command, args, options = {}) {
  return spawn(command, args, { cwd: ROOT, shell: windows, ...options })
}

export function dockerIsRunning() {
  return run('docker', ['info'], { quiet: true }).ok
}

export function dockerHelp() {
  if (process.platform === 'linux') {
    return 'Start Docker with `sudo systemctl start docker`. If it says "permission denied", run '
      + '`sudo usermod -aG docker $USER`, then log out and back in.'
  }
  return 'Open Docker Desktop and wait until it says it is running. Get it from https://docs.docker.com/get-docker/'
}

export function supabase(args, options) {
  return run('npx', ['--yes', SUPABASE_CLI, ...args], options)
}

export function supabaseStart(options) {
  return supabase(['start', '-x', SKIPPED_SERVICES], options)
}

/** The running local Supabase's settings (API_URL, PUBLISHABLE_KEY, DB_URL…), or null when it's stopped. */
export function supabaseStatus() {
  const result = supabase(['status', '-o', 'env'], { quiet: true })
  if (!result.ok) return null
  const status = parseEnv(result.stdout)
  return status.API_URL && status.PUBLISHABLE_KEY ? status : null
}

/** The public Google OAuth client ID that local Supabase signs in with. */
export function googleClientId() {
  const config = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8')
  return config.match(/\[auth\.external\.google\][^[]*?client_id\s*=\s*"([^"]*)"/)?.[1] ?? ''
}

/** True when something is listening on the port. */
export function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: 'localhost' })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false) })
  })
}

/** A valid TOKEN_ENCRYPTION_KEY: base64 of exactly 32 bytes. */
export function validEncryptionKey(value) {
  const key = Buffer.from(value ?? '', 'base64')
  return key.length === 32 && key.toString('base64') === value
}
