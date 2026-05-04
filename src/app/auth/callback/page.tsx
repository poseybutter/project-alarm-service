'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getMemberName } from '@/lib/auth'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/login')
        return
      }

      // 허가된 이메일인지 확인
      const member = getMemberName(session.user.email)
      if (!member) {
        // 허가되지 않은 이메일 → 로그아웃 후 에러 페이지
        await supabase.auth.signOut()
        router.push('/login?error=unauthorized')
        return
      }

      router.push('/')
    })
  }, [])

  return (
    <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
      <div className="text-stone-400 text-sm">로그인 처리 중...</div>
    </div>
  )
}