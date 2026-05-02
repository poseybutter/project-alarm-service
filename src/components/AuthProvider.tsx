'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getMemberName } from '@/lib/auth'

type AuthContextType = {
  user   : User | null
  member : string | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user   : null,
  member : null,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 세션 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event, session?.user?.email)
      setUser(session?.user ?? null)
      setLoading(false)

      // 로그인 완료 시 홈으로 이동
      if (event === 'SIGNED_IN') {
        window.location.href = '/'
      }
      // 로그아웃 시 로그인 페이지로
      if (event === 'SIGNED_OUT') {
        window.location.href = '/login'
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const member = getMemberName(user?.email || '')

  return (
    <AuthContext.Provider value={{ user, member, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}