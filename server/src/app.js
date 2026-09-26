import express from 'express'

// Configure middleware and mount route modules here; importing the app opens no port.
const app = express()

app.use(express.json())

export default app
