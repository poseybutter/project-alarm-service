'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import { getDiff } from '@/lib/utils'

type Notification = {
  id: string
  type: 'urgent' | 'accessibility'
  title: string
  body: string
  dday?: number
}

export default function NotificationDrawer({ onClose }: { onClose: () => void }) {
  const { member } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (member) loadNotifications()
  }, [member])

  async function loadNotifications() {
    setLoading(true)
    const nots: Notification[] = []

    const [{ data: tasks }, { data: accList }] = await Promise.all([
      supabase.from('tasks').select('*').eq('member', member).neq('status', '완료'),
      supabase.from('accessibility').select('*').eq('member', member).neq('inspection_status', '신청불필요'),
    ])

    ;(tasks || [])
      .filter(t => { const d = getDiff(t.end_date); return d !== null && d <= 7 })
      .sort((a, b) => (getDiff(a.end_date) ?? 99) - (getDiff(b.end_date) ?? 99))
      .forEach(t => {
        const diff = getDiff(t.end_date)
        nots.push({ id: `task-${t.id}`, type: 'urgent', title: '마감 임박', body: t.proj, dday: diff ?? undefined })
      })

    ;(accList || [])
      .filter(a => { const d = getDiff(a.end_date); return d !== null && d <= 45 })
      .sort((a, b) => (getDiff(a.end_date) ?? 99) - (getDiff(b.end_date) ?? 99))
      .forEach(a => {
        const diff = getDiff(a.end_date)
        nots.push({ id: `acc-${a.id}`, type: 'accessibility', title: '접근성 만료 임박', body: a.proj, dday: diff ?? undefined })
      })

    setNotifications(nots)
    setLoading(false)
  }

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🔔</span>
          <h2 className="text-sm font-bold text-stone-800">알림</h2>
          {notifications.length > 0 && (
            <span className="text-xs bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {notifications.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-xl text-stone-400 leading-none">×</button>
      </div>

      {/* 내용 */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="text-center py-8 text-stone-400 text-sm">불러오는 중...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-sm text-stone-500 font-medium">새 알림이 없어요</p>
            <p className="text-xs text-stone-300 mt-1">마감 임박이나 접근성 만료가 있으면 표시돼요</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* 마감 임박 */}
            {notifications.filter(n => n.type === 'urgent').length > 0 && (
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1.5">마감 임박</p>
                <div className="space-y-1.5">
                  {notifications.filter(n => n.type === 'urgent').map(n => (
                    <div key={n.id}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border
                        ${n.dday !== undefined && n.dday <= 3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <span className="text-base shrink-0">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-800 truncate">{n.body}</p>
                        <p className="text-xs text-stone-400">마감 임박</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${n.dday !== undefined && n.dday <= 3 ? 'text-red-500' : 'text-amber-600'}`}>
                        {n.dday !== undefined && n.dday < 0 ? `D+${Math.abs(n.dday)}` : `D-${n.dday}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 접근성 만료 */}
            {notifications.filter(n => n.type === 'accessibility').length > 0 && (
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1.5">접근성 만료 임박</p>
                <div className="space-y-1.5">
                  {notifications.filter(n => n.type === 'accessibility').map(n => (
                    <div key={n.id}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border
                        ${n.dday !== undefined && n.dday <= 14 ? 'bg-orange-50 border-orange-200' : 'bg-sky-50 border-sky-200'}`}>
                      <span className="text-base shrink-0">🌐</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-800 truncate">{n.body}</p>
                        <p className="text-xs text-stone-400">접근성 만료 임박</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${n.dday !== undefined && n.dday <= 14 ? 'text-orange-500' : 'text-sky-600'}`}>
                        {n.dday}일 남음
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}