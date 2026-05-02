'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { signOut } from '@/lib/auth'

export default function UserMenu() {
  const { member, avatarUrl } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!member) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full overflow-hidden border-2 border-amber-200"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={member} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700">
            {member.slice(1)}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 bg-white rounded-xl border border-stone-200 shadow-lg z-50 w-44 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={member} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">
                  {member.slice(1)}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-stone-800">{member}</p>
              <p className="text-xs text-stone-400">퍼블리셔</p>
            </div>
          </div>
          <button
            onClick={() => { router.push('/profile'); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <span>🍄</span> 프로필 보기
          </button>
          <button
            onClick={() => { router.push('/'); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <span>🏠</span> 홈으로
          </button>
          <div className="border-t border-stone-100" />
          <button
            onClick={async () => {
              setOpen(false)
              await signOut()
              window.location.href = '/login'
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <span>🚪</span> 로그아웃
          </button>
        </div>
      )}
    </div>
  )
}