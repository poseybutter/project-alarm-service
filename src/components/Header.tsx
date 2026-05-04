'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './AuthProvider'
import UserMenu from './UserMenu'
import NotificationDrawer from './NotificationDrawer'
import { supabase } from '@/lib/supabase'

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { member } = useAuth()
  const [showNotif, setShowNotif]   = useState(false)
  const [notifCount, setNotifCount] = useState(0)

  useEffect(() => {
    if (member) loadNotifCount()
  }, [member])

  async function loadNotifCount() {
    const [{ data: tasks }, { data: accList }] = await Promise.all([
      supabase.from('tasks').select('end_date').eq('member', member).neq('status', '완료'),
      supabase.from('accessibility').select('end_date').eq('member', member).neq('inspection_status', '신청불필요'),
    ])
    const count =
      (tasks || []).filter(t => { const d = getDiff(t.end_date); return d !== null && d <= 7 }).length +
      (accList || []).filter(a => { const d = getDiff(a.end_date); return d !== null && d <= 45 }).length
    setNotifCount(count)
  }

  return (
    <>
      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold text-stone-900">{title}</h1>
            {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotif(true)}
              className="text-stone-400 text-xl relative"
            >
              🔔
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
                  {notifCount}
                </span>
              )}
            </button>
            <UserMenu />
          </div>
        </div>
      </div>

      <NotificationDrawer
        open={showNotif}
        onClose={() => { setShowNotif(false); loadNotifCount() }}
      />
    </>
  )
}