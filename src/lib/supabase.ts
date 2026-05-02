import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
})

export type Task = {
  id: number
  member: string
  type: string
  proj: string
  content: string
  status: string
  progress: number
  workload: number
  start_date: string | null
  end_date: string | null
  priority: string | null
  issue: string | null
  created_at: string
}

export type Quest = {
  id: number
  member: string
  proj: string | null
  content: string
  status: string
  end_date: string | null
  created_at: string
}