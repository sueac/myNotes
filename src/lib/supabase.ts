import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.')
}

export const supabase = createClient(url, anonKey)