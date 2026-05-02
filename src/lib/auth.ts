import { supabase } from './supabase'

// 구글 로그인
export async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    if (error) console.error(error)
  }

// 로그아웃
export async function signOut() {
  await supabase.auth.signOut()
}

// 현재 유저
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 이메일 → 팀원명 매핑 (환경변수 기반)
export function getMemberName(email: string | undefined) {
  if (!email) return null
  const map = Object.fromEntries(
    (process.env.NEXT_PUBLIC_MEMBER_EMAILS || '')
      .split(',')
      .filter(Boolean)
      .map(pair => pair.split(':'))
  )
  return map[email] || null
}