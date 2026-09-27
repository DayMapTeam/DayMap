// npm run setup: everything needed to run DayMap locally, in one command.
// Safe to run again: existing settings are kept, only missing ones are filled.
import { randomBytes } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  CALENDAR_KEYS, CALENDAR_REDIRECT, FILES, MIN_NODE, PORTS, ROOT, bold, cyan, dim, dockerHelp, dockerIsRunning, googleClientId,
  green, nodeIsSupported, readEnv, red, run, supabase, supabaseStart, supabaseStatus, validEncryptionKey, writeEnv, yellow,
} from './lib.mjs'

const step = (text) => console.log(`\n${bold(cyan('▸'))} ${bold(text)}`)
const done = (text) => console.log(`  ${green('✓')} ${text}`)
const fail = (text, fix) => {
  console.log(`  ${red('✗')} ${text}`)
  if (fix) console.log(`    ${fix}`)
  process.exit(1)
}

/** Ask for a value without showing what is typed. Enter alone skips. */
function askSecret(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    const write = rl._writeToOutput?.bind(rl)
    rl._writeToOutput = (text) => { if (!muted || text.includes('\n')) write?.(muted ? '\n' : text) }
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) })
    muted = true
  })
}

// 1. Tools
step('Checking tools')
if (!nodeIsSupported()) {
  fail(`Node ${process.versions.node} is too old.`, `Install Node ${MIN_NODE.join('.')} or newer (LTS) from https://nodejs.org`)
}
done(`Node ${process.versions.node}`)
if (!dockerIsRunning()) fail('Docker is not running.', dockerHelp())
done('Docker is running')

// 2. Packages: installed when missing or when the lockfile changed (after a pull).
step('Installing packages')
for (const dir of ['client', 'server']) {
  const lock = join(ROOT, dir, 'package-lock.json')
  const installed = join(ROOT, dir, 'node_modules', '.package-lock.json')
  if (existsSync(installed) && statSync(installed).mtimeMs >= statSync(lock).mtimeMs) {
    done(`${dir}: up to date`)
    continue
  }
  console.log(dim(`  npm ci in ${dir}/ …`))
  if (!run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: join(ROOT, dir) }).ok) {
    fail(`Installing ${dir}/ packages failed.`, 'Read the npm error above, fix it, then run `npm run setup` again.')
  }
  done(`${dir}: installed`)
}

// 3. Keys from the project owner. Each is optional; without them the matching feature is off.
step('Keys from the project owner')
const client = readEnv(FILES.client)
const server = readEnv(FILES.server)
const auth = readEnv(FILES.supabase)
const interactive = process.stdin.isTTY && !process.argv.includes('--no-prompt')
async function secret(name, current, question) {
  const fromEnv = process.env[`DAYMAP_${name}`]?.trim()
  if (fromEnv) {
    done(`${name}: from DAYMAP_${name}`)
    return fromEnv
  }
  if (current) {
    done(`${name}: already set`)
    return current
  }
  const answer = interactive ? await askSecret(`  ${question} ${dim('(Enter to skip)')}: `) : ''
  if (!answer) console.log(`  ${yellow('–')} ${name}: skipped`)
  return answer
}
const mapsKey = await secret('GOOGLE_MAPS_API_KEY', client.VITE_GOOGLE_MAPS_API_KEY,
  'Google Maps API key')
const clientSecret = await secret('GOOGLE_OAUTH_CLIENT_SECRET', server.GOOGLE_OAUTH_CLIENT_SECRET || auth.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET,
  'Google OAuth client secret')

// Supabase reads supabase/.env only when it starts, so it is written first.
const authChanged = (auth.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET ?? '') !== clientSecret
writeEnv(FILES.supabase, { SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: clientSecret })

// 4. Local database and sign-in (Supabase in Docker)
step('Starting the local database (Supabase)')
console.log(dim('  The first time this downloads Docker images, which takes a few minutes.'))
let status = supabaseStatus()
if (status && authChanged) {
  console.log(dim('  Restarting it so it picks up the Google sign-in setting…'))
  if (!supabase(['stop']).ok) fail('Supabase did not stop.', `Run ${bold('npm run stop')}, then ${bold('npm run setup')} again.`)
  status = null
}
if (!status) {
  if (!supabaseStart().ok) {
    fail('Supabase did not start.', `If ports 54321–54324 are in use by another Supabase project, run ${bold('npx supabase stop --all')} and try again.`)
  }
  status = supabaseStatus()
}
if (!status) fail('Supabase started but its settings could not be read.', `Run ${bold('npx supabase status')} to see what is wrong.`)
done(`Supabase is running at ${status.API_URL}`)

// 5. Settings files
step('Writing settings files')
writeEnv(FILES.client, {
  VITE_GOOGLE_MAPS_API_KEY: mapsKey,
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
})
done('client/.env.local')
// The five Calendar settings go together: all set, or all empty (the server
// refuses to start with only some). An existing encryption key is kept, since
// changing it means reconnecting Google Calendar.
const calendar = clientSecret
  ? { DATABASE_URL: status.DB_URL, GOOGLE_OAUTH_CLIENT_ID: googleClientId(), GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
    GOOGLE_OAUTH_REDIRECT_URI: CALENDAR_REDIRECT,
    TOKEN_ENCRYPTION_KEY: validEncryptionKey(server.TOKEN_ENCRYPTION_KEY) ? server.TOKEN_ENCRYPTION_KEY : randomBytes(32).toString('base64') }
  : Object.fromEntries(CALENDAR_KEYS.map((key) => [key, '']))
writeEnv(FILES.server, {
  PORT: server.PORT || String(PORTS.api),
  CLIENT_ORIGIN: server.CLIENT_ORIGIN || `http://localhost:${PORTS.web}`,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  ...calendar,
})
done('server/.env')
done('supabase/.env')

// 6. Summary
const on = (value) => (value ? green('on') : yellow('off'))
console.log(`
${bold(green('DayMap is set up.'))}

  Email sign-in and saved days  ${on(true)}
  Map, places and routes        ${on(mapsKey)}${mapsKey ? '' : dim('  needs the Google Maps API key')}
  Sign in with Google           ${on(clientSecret)}${clientSecret ? '' : dim('  needs the OAuth client secret')}
  Google Calendar import        ${on(clientSecret)}${clientSecret ? '' : dim('  needs the OAuth client secret')}

Start it with ${bold('npm run dev')}, then open ${cyan(`http://localhost:${PORTS.web}`)}.
Got a key later? Run ${bold('npm run setup')} again and paste it in.`)
