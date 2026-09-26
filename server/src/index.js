import app from './app.js'
import { describeConfiguration } from './config.js'

const port = Number(process.env.PORT ?? 3001)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const server = app.listen(port, () => {
  console.log(`DayMap server listening on port ${port}`)
  for (const line of describeConfiguration()) console.log(`  ${line}`)
  app.locals.calendar?.check().then(
    () => console.log('  Google Calendar database: ready'),
    (error) => console.warn(`  Google Calendar database: not ready. ${error.message}`),
  )
})

server.on('error', (error) => {
  console.error(`Unable to start DayMap server: ${error.message}`)
  process.exitCode = 1
})
