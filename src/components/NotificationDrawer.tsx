'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

type Notification = {
  id: string
  type: 'urgent' | 'accessibility' | 'exp'
  title: string
  body: string
  dday?: number
}

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

export default function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { member } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && member) loadNotifications()
  }, [open, member])

  async function loadNotifications() {
    setLoading(true)
    const nots: Notification[] = []

    const [{ data: tasks }, { data: accList }] = await Promise.all([
      supabase.from('tasks').select('*').eq('member', member).neq('status', '완료'),
      supabase.from('accessibility').select('*').eq('member', member).neq('inspection_status', '신청불필요'),
    ])

    // 마감 임박 업무 (D-7 이내)
    const urgentTasks = (tasks || []).filter(t => {
      const d = getDiff(t.end_date)
      return d !== null && d <= 7
    }).sort((a, b) => (getDiff(a.end_date) ?? 99) - (getDiff(b.end_date) ?? 99))

    if (urgentTasks.length > 0) {
      urgentTasks.forEach(t => {
        const diff = getDiff(t.end_date)
        nots.push({
          id    : `task-${t.id}`,
          type  : 'urgent',
          title : '마감 임박',
          body  : t.proj,
          dday  : diff ?? undefined,
        })
      })
    }

    // 접근성 만료 임박 (45일 이내)
    const urgentAcc = (accList || []).filter(a => {
      const d = getDiff(a.end_date)
      return d !== null && d <= 45
    }).sort((a, b) => (getDiff(a.end_date) ?? 99) - (getDiff(b.end_date) ?? 99))

    if (urgentAcc.length > 0) {
      urgentAcc.forEach(a => {
        const diff = getDiff(a.end_date)
        nots.push({
          id    : `acc-${a.id}`,
          type  : 'accessibility',
          title : '접근성 만료 임박',
          body  : a.proj,
          dday  : diff ?? undefined,
        })
      })
    }

    setNotifications(nots)
    setLoading(false)
  }

  if (!open) return null

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* 드로어 */}
      <div
        ref={ref}
        className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <h2 className="text-sm font-bold text-stone-800">알림</h2>
            {notifications.length > 0 && (
              <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                {notifications.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 text-xl leading-none"
          >×</button>
        </div>

        {/* 알림 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-stone-400 text-sm">불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-sm text-stone-400">새 알림이 없어요</p>
              <p className="text-xs text-stone-300 mt-1">마감 임박 업무나 접근성 만료가 있으면 여기에 표시돼요</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {/* 마감 임박 섹션 */}
              {notifications.filter(n => n.type === 'urgent').length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                    마감 임박 업무
                  </p>
                  {notifications.filter(n => n.type === 'urgent').map(n => (
                    <div key={n.id} className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 mb-2
                      ${n.dday !== undefined && n.dday <= 3 ? 'border-red-200 bg-red-50' : 'border-stone-200'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm
                        ${n.dday !== undefined && n.dday <= 3 ? 'bg-red-100' : 'bg-amber-100'}`}>
                        ⚠️
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{n.body}</p>
                        <p className="text-xs text-stone-400">{n.title}</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0
                        ${n.dday !== undefined && n.dday <= 3 ? 'text-red-500' : 'text-amber-600'}`}>
                        {n.dday !== undefined && n.dday < 0
                          ? `D+${Math.abs(n.dday)}`
                          : `D-${n.dday}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 접근성 만료 섹션 */}
              {notifications.filter(n => n.type === 'accessibility').length > 0 && (
                <div>
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
                    접근성 만료 임박
                  </p>
                  {notifications.filter(n => n.type === 'accessibility').map(n => (
                    <div key={n.id} className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 mb-2
                      ${n.dday !== undefined && n.dday <= 14 ? 'border-orange-200 bg-orange-50' : 'border-stone-200'}`}>
                      <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0 text-sm">
                        🌐
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{n.body}</p>
                        <p className="text-xs text-stone-400">{n.title}</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0
                        ${n.dday !== undefined && n.dday <= 14 ? 'text-orange-500' : 'text-sky-600'}`}>
                        {n.dday}일 남음
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}