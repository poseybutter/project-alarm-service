'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getMemberName } from '@/lib/auth'

type AuthContextType = {
  user      : User | null
  member    : string | null
  avatarUrl : string | null
  loading   : boolean
  refreshAvatar: () => void
}

const AuthContext = createContext<AuthContextType>({
  user      : null,
  member    : null,
  avatarUrl : null,
  loading   : true,
  refreshAvatar: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null)
  const [loading, setLoading]     = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const member = getMemberName(user?.email || '')

  // 아바타 URL 로드
  async function loadAvatar(memberName: string) {
    const { data } = await supabase
      .from('players')
      .select('avatar_url')
      .eq('name', memberName)
      .single()
    setAvatarUrl(data?.avatar_url || null)
  }

  useEffect(() => {
    if (member) loadAvatar(member)
  }, [member])

  function refreshAvatar() {
    if (member) loadAvatar(member)
  }

  return (
    <AuthContext.Provider value={{ user, member, avatarUrl, loading, refreshAvatar }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}