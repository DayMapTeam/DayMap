// npm run dev: the local database (if it isn't running), the API and the
// website, in one terminal. Ctrl+C stops the API and website; the database
// keeps running (stop it with `npm run stop`).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  FILES, PORTS, ROOT, bold, cyan, dim, dockerHelp, dockerIsRunning, portInUse, readEnv, red, start, supabaseStart,
  supabaseStatus, yellow,
} from './lib.mjs'

const stop = (text, fix) => {
  console.log(`${red('✗')} ${text}`)
  if (fix) console.log(`  ${fix}`)
  process.exit(1)
}

const installed = ['client', 'server'].every((dir) => existsSync(join(ROOT, dir, 'node_modules')))
if (!installed || !existsSync(FILES.client) || !existsSync(FILES.server)) {
  stop('DayMap is not set up yet.', `Run ${bold('npm run setup')} first.`)
}

// Only a local database needs Docker; a hosted Supabase URL is used as it is.
const supabaseUrl = readEnv(FILES.server).SUPABASE_URL ?? ''
if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl) && !supabaseStatus()) {
  if (!dockerIsRunning()) stop('Docker is not running, so the local database can\'t start.', dockerHelp())
  console.log(dim('Starting the local database (Supabase)…'))
  if (!supabaseStart().ok) stop('Supabase did not start.', `Run ${bold('npm run doctor')} to find out why.`)
}

for (const [name, port] of Object.entries(PORTS)) {
  if (await portInUse(port)) {
    stop(`Port ${port} is already in use, so the ${name === 'api' ? 'API' : 'website'} can't start.`,
      'DayMap is probably already running in another terminal. Close it (Ctrl+C there), then try again.')
  }
}

// Each line is labelled with where it came from.
const children = []
function launch(label, color, dir) {
  const child = start('npm', ['run', 'dev'], { cwd: join(ROOT, dir), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } })
  for (const stream of [child.stdout, child.stderr]) {
    let rest = ''
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n')
      rest = lines.pop()
      for (const line of lines) console.log(`${color(label)} ${line}`)
    })
  }
  child.on('exit', (code) => {
    if (shuttingDown) return
    console.log(`${color(label)} ${red(`stopped (exit code ${code}).`)} Stopping the rest.`)
    shutdown(code || 1)
  })
  children.push(child)
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  console.log(dim('\nStopped the API and website. The database is still running; `npm run stop` stops it.'))
  setTimeout(() => process.exit(code), 500)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log(`${bold('DayMap')} → ${cyan(`http://localhost:${PORTS.web}`)}  ${dim('(Ctrl+C to stop)')}\n`)
launch('[api]', yellow, 'server')
launch('[web]', cyan, 'client')
