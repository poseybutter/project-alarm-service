'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithGoogle } from '@/lib/auth'
import { useAuth } from '@/components/AuthProvider'

export default function LoginPage() {
  const { member, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && member) {
      router.push('/')
    }
  }, [loading, member])

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🧩</div>
        <h1 className="text-xl font-bold text-stone-800 mb-1">UD2팀 업무 관리</h1>
        <p className="text-sm text-stone-400 mb-6">
          업무 입력 → 자동 취합 → 주간 브리핑<br />
          UD2팀 전용 업무 툴
        </p>
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-all shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Google 계정으로 로그인
        </button>
        <p className="text-xs text-stone-400 mt-4">허가된 UD2팀 계정만 접근 가능합니다.</p>
      </div>
    </div>
  )
}