'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push('/')
      } else {
        router.push('/login')
      }
    })
  }, [])

  return (
    <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
      <div className="text-stone-400 text-sm">로그인 처리 중...</div>
    </div>
  )
}