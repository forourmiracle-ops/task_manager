import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Only create real client if properly configured
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http')
const isValidKey = supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key'

function createMockClient() {
  const mockError = new Error('Supabase 未配置，请在 .env 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
  const authError = () => Promise.resolve({ data: {}, error: mockError })
  const authNoop = () => Promise.resolve({ data: {}, error: null })
  return {
    from: () => {
      throw mockError
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signOut: authNoop,
      signInWithPassword: authError,
      signUp: authError,
      signInWithOtp: authError,
      signInWithOAuth: authError,
      resetPasswordForEmail: authError,
      updateUser: authError,
      verifyOtp: authError,
    },
  } as unknown as ReturnType<typeof createClient>
}

export const supabase =
  isValidUrl && isValidKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createMockClient()