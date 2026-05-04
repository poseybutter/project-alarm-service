'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from './AuthProvider'
import NotificationDrawer from './NotificationDrawer'
import { supabase } from '@/lib/supabase'
import { useEffect } from 'react'

const NAV_ITEMS = [
  { href: '/',        icon: '🏠', label: '홈'    },
  { href: '/tasks',   icon: '📋', label: '업무'  },
  { href: '/report',  icon: '✏️', label: '리포트' },
  { href: '/profile', icon: '🍄', label: '프로필' },
]

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

export default function Nav() {
  const pathname = usePathname()
  const { member } = useAuth()
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifCount, setNotifCount] = useState(0)

  useEffect(() => {
    if (member) loadNotifCount()
  }, [member])

  async function loadNotifCount() {
    const [{ data: tasks }, { data: accList }] = await Promise.all([
      supabase.from('tasks').select('end_date').eq('member', member).neq('status', '완료'),
      supabase.from('accessibility').select('end_date').eq('member', member).neq('inspection_status', '신청불필요'),
    ])

    const urgentTasks = (tasks || []).filter(t => {
      const d = getDiff(t.end_date)
      return d !== null && d <= 7
    })
    const urgentAcc = (accList || []).filter(a => {
      const d = getDiff(a.end_date)
      return d !== null && d <= 45
    })

    setNotifCount(urgentTasks.length + urgentAcc.length)
  }

  if (pathname === '/login') return null

  return (
    <>
      {/* 상단 알림 버튼 */}
      <div className="fixed top-3 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => setShowNotifications(true)}
          className="text-stone-400 text-xl relative"
        >
          🔔
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
              {notifCount}
            </span>
          )}
        </button>
      </div>

      {/* 하단 네비 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-50">
        <div className="max-w-2xl mx-auto flex">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors
                ${pathname === item.href
                  ? 'text-amber-600'
                  : 'text-stone-400'}`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* 알림 드로어 */}
      <NotificationDrawer
        open={showNotifications}
        onClose={() => {
          setShowNotifications(false)
          loadNotifCount()
        }}
      />
    </>
  )
}