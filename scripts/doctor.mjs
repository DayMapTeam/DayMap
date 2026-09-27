// npm run doctor: check the local setup and say exactly what to fix.
// Never prints a key or secret.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALENDAR_KEYS, CALENDAR_REDIRECT, FILES, MIN_NODE, PORTS, ROOT, bold, dockerHelp, dockerIsRunning, googleClientId,
  green, nodeIsSupported, portInUse, readEnv, red, supabaseStatus, validEncryptionKey, yellow,
} from './lib.mjs'

let problems = 0
const ok = (text) => console.log(`${green('✓')} ${text}`)
const note = (text, fix) => console.log(`${yellow('!')} ${text}${fix ? `\n    ${fix}` : ''}`)
const bad = (text, fix) => {
  problems++
  console.log(`${red('✗')} ${text}${fix ? `\n    ${fix}` : ''}`)
}
const setupFix = `Run ${bold('npm run setup')}.`

if (nodeIsSupported()) ok(`Node ${process.versions.node}`)
else bad(`Node ${process.versions.node} is too old`, `Install Node ${MIN_NODE.join('.')} or newer from https://nodejs.org`)

for (const dir of ['client', 'server']) {
  if (existsSync(join(ROOT, dir, 'node_modules'))) ok(`${dir} packages installed`)
  else bad(`${dir} packages are not installed`, setupFix)
}

const docker = dockerIsRunning()
if (docker) ok('Docker is running')
else bad('Docker is not running', dockerHelp())

const status = docker ? supabaseStatus() : null
if (status) ok(`Local database (Supabase) is running at ${status.API_URL}`)
else if (docker) bad('Local database (Supabase) is not running', `Run ${bold('npm run dev')} (it starts it), or ${bold('npm run setup')}.`)

const client = readEnv(FILES.client)
const server = readEnv(FILES.server)
const auth = readEnv(FILES.supabase)
for (const [name, file] of Object.entries(FILES)) {
  if (!existsSync(file)) bad(`${name === 'client' ? 'client/.env.local' : `${name}/.env`} is missing`, setupFix)
}

// Sign-in: both apps must point at the running database with its key.
if (status) {
  const matches = client.VITE_SUPABASE_URL === status.API_URL && client.VITE_SUPABASE_PUBLISHABLE_KEY === status.PUBLISHABLE_KEY
    && server.SUPABASE_URL === status.API_URL && server.SUPABASE_PUBLISHABLE_KEY === status.PUBLISHABLE_KEY
  if (matches) ok('Sign-in settings match the local database')
  else bad('Sign-in settings don\'t match the local database', setupFix)
}

if (client.VITE_GOOGLE_MAPS_API_KEY) ok('Google Maps key is set')
else note('No Google Maps key: the map, place search and routes are off', `Get the key from the project owner, then ${bold('npm run setup')}.`)

// Calendar: all five settings, or none (the server refuses to start otherwise).
const calendarSet = CALENDAR_KEYS.filter((key) => server[key])
if (calendarSet.length === 0) {
  note('Google Calendar is off', `Get the OAuth client secret from the project owner, then ${bold('npm run setup')}.`)
} else if (calendarSet.length < CALENDAR_KEYS.length) {
  bad(`Only some Google Calendar settings are filled in server/.env (missing ${CALENDAR_KEYS.filter((key) => !server[key]).join(', ')}); the API won't start`, setupFix)
} else {
  const wrong = [
    !validEncryptionKey(server.TOKEN_ENCRYPTION_KEY) && 'TOKEN_ENCRYPTION_KEY is not a base64 32-byte key',
    server.GOOGLE_OAUTH_CLIENT_ID !== googleClientId() && 'GOOGLE_OAUTH_CLIENT_ID differs from supabase/config.toml',
    server.GOOGLE_OAUTH_REDIRECT_URI !== CALENDAR_REDIRECT && `GOOGLE_OAUTH_REDIRECT_URI should be ${CALENDAR_REDIRECT}`,
    status && server.DATABASE_URL !== status.DB_URL && 'DATABASE_URL does not point at the local database',
  ].filter(Boolean)
  if (wrong.length) for (const problem of wrong) bad(`Google Calendar: ${problem}`, setupFix)
  else ok('Google Calendar settings are complete')
}

if (!auth.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET) {
  note('Sign in with Google is off (email sign-in still works)', `Get the OAuth client secret from the project owner, then ${bold('npm run setup')}.`)
} else if (server.GOOGLE_OAUTH_CLIENT_SECRET && auth.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET !== server.GOOGLE_OAUTH_CLIENT_SECRET) {
  bad('The Google client secret differs between supabase/.env and server/.env', setupFix)
} else {
  ok('Sign in with Google is configured')
}

for (const [name, port] of Object.entries(PORTS)) {
  if (await portInUse(port)) note(`Port ${port} is in use: the ${name === 'api' ? 'API' : 'website'} is already running, or another app has the port`)
}

console.log(problems ? `\n${red(`${problems} problem${problems === 1 ? '' : 's'} found.`)}` : `\n${green('All good.')} Start DayMap with ${bold('npm run dev')}.`)
process.exit(problems ? 1 : 0)
