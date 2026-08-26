import { createBrowserClient } from '@supabase/ssr'
export * from '@/shared/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * 브라우저용 Supabase 클라이언트.
 * PKCE code_verifier 등 auth state를 쿠키에 저장하므로,
 * 서버 라우트 핸들러(@supabase/ssr createServerClient)와 세션 교환이 가능하다.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseKey)
