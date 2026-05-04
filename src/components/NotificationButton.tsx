'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'
import NotificationDrawer from './NotificationDrawer'
import { supabase } from '@/lib/supabase'

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

export default function NotificationButton() {
  const { member } = useAuth()
  const [showNotif, setShowNotif]   = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (member) loadNotifCount()
  }, [member])

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowNotif(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
    <div className="relative" ref={ref}>
      {/* 벨 버튼 */}
      <button
        onClick={() => setShowNotif(o => !o)}
        className="relative w-8 h-8 flex items-center justify-center"
      >
        <span className="text-xl text-stone-400">🔔</span>
        {notifCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[16px] h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1 leading-none">
            {notifCount > 9 ? '9+' : notifCount}
          </span>
        )}
      </button>

      {/* 드롭다운 패널 */}
      {showNotif && (
        <div className="absolute right-0 top-10 w-80 max-h-[70vh] bg-white rounded-2xl border border-stone-200 shadow-xl z-50 flex flex-col overflow-hidden">
          <NotificationDrawer
            onClose={() => { setShowNotif(false); loadNotifCount() }}
          />
        </div>
      )}
    </div>
  )
}