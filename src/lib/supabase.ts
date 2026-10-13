import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const missingVariables = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabasePublishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean)

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required Supabase environment variable(s): ${missingVariables.join(', ')}. Set them in .env.local and restart the development server.`,
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
