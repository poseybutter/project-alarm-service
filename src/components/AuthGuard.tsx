'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { member, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !member) {
      router.push('/login')
    }
  }, [loading, member])

  if (loading) return (
    <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
      <div className="text-stone-400 text-sm">로딩 중...</div>
    </div>
  )

  if (!member) return null

  return <>{children}</>
}