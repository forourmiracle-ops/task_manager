import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Only create real client if properly configured
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http')
const isValidKey = supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key'

function createMockClient() {
  return {
    from: () => {
      throw new Error('Supabase not configured')
    },
  } as unknown as ReturnType<typeof createClient>
}

export const supabase =
  isValidUrl && isValidKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createMockClient()