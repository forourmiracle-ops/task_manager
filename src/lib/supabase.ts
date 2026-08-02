import { createClient } from '@supabase/supabase-js'

// 默认 Supabase 配置（anon key 是公开密钥，可安全放在前端代码中）
// 可通过 Vercel 环境变量覆盖，无需修改则开箱即用
const DEFAULT_SUPABASE_URL = 'https://tynhqwexdfdtobkmmzdo.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5bmhxd2V4ZGZkdG9ia21temRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NzcxMTEsImV4cCI6MjA5ODA1MzExMX0.eRum4wrDYvCDVwIAuS5JICpGYXLnP1ncIzVI_s1XJHY'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)