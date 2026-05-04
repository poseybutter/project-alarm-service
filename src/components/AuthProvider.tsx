'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getMemberName } from '@/lib/auth'

type AuthContextType = {
  user         : User | null
  member       : string | null
  avatarUrl    : string | null
  loading      : boolean
  role         : string
  refreshAvatar: () => void
}

const AuthContext = createContext<AuthContextType>({
  user         : null,
  member       : null,
  avatarUrl    : null,
  loading      : true,
  role         : 'member',
  refreshAvatar: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null)
  const [loading, setLoading]     = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [role, setRole]           = useState<string>('member')

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

  async function loadAvatar(memberName: string) {
    const { data } = await supabase
      .from('players')
      .select('avatar_url, role')
      .eq('name', memberName)
      .single()
    setAvatarUrl(data?.avatar_url || null)
    setRole(data?.role || 'member')
  }

  useEffect(() => {
    if (member) loadAvatar(member)
  }, [member])

  function refreshAvatar() {
    if (member) loadAvatar(member)
  }

  return (
    <AuthContext.Provider value={{ user, member, avatarUrl, loading, role, refreshAvatar }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}