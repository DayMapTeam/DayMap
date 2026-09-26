import client from './client/eslint.config.js'
import globals from 'globals'

export default [
  ...client,
  { files: ['server/**/*.js'], languageOptions: { globals: globals.node } },
]
