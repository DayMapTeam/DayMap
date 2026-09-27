// npm run stop: stop the local database containers. Your data is kept.
import { supabase } from './lib.mjs'

process.exit(supabase(['stop']).ok ? 0 : 1)
