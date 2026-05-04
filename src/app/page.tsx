'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import UserMenu from '@/components/UserMenu'
import { supabase } from '@/lib/supabase'
import { calcLevel, getNextLevel, expBar, attendanceCheck, LEVELS } from '@/lib/maple'
import { awardExp } from '@/lib/maple'
import { useAuth } from '@/components/AuthProvider'
import Header from '@/components/Header'

type Task = {
  id: number
  member: string
  type: string
  proj: string
  content: string
  status: string
  priority: string | null
  end_date: string | null
  workload: number
}

type Player = {
  id: number
  name: string
  exp: number
  month_exp: number
  level: number
  icons: string[]
  attend_last: string | null
  attend_streak: number
}

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

const TYPE_COLORS: Record<string, string> = {
  '프로젝트': 'bg-violet-100 text-violet-700',
  '유지보수': 'bg-red-100 text-red-700',
  '고도화':   'bg-green-100 text-green-700',
  '접근성':   'bg-sky-100 text-sky-700',
  '업무지원': 'bg-blue-100 text-blue-700',
}

const BAR_COLORS = ['#4CAF50','#2196F3','#9C27B0','#FF5722','#FF9800','#F44336','#FFD700','#FF69B4']

export default function HomePage() {
  const { member, loading: authLoading } = useAuth()
  const router = useRouter()

  const [player, setPlayer]   = useState<Player | null>(null)
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState('')

  useEffect(() => {
    if (!authLoading && !member) {
      router.push('/login')
    }
  }, [authLoading, member])

  useEffect(() => {
    if (member) loadData()
  }, [member])

  if (authLoading || !member) return null

  async function loadData() {
    setLoading(true)
    const [{ data: players }, { data: taskData }] = await Promise.all([
      supabase.from('players').select('*').eq('name', member).single(),
      supabase.from('tasks').select('*').eq('member', member).neq('status', '완료'),
    ])
    setPlayer(players)
    setTasks(taskData || [])
    setLoading(false)
  }

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleAttend() {
    if (!player || !member) return
    const today = new Date().toISOString().slice(0, 10)
    if (player.attend_last === today) {
      showToastMsg('오늘은 이미 출석했어요!')
      return
    }
    const result = await attendanceCheck(member)
    if (!result.success) { showToastMsg(result.message || '오류'); return }
    showToastMsg(
      result.levelUp
        ? `🎊 레벨업! ${result.newLv?.name}`
        : `☀️ 출석 완료! +${result.exp} EXP · ${result.streak}일 연속`
    )
    loadData()
  }

  async function completeTask(task: Task) {
    await supabase.from('tasks').update({ status: '완료' }).eq('id', task.id)
    const type = task.priority === '긴급' ? 'URGENT' : 'COMPLETE'
    const result = await awardExp(task.member, type)
    showToastMsg(
      result?.levelUp
        ? `🎊 레벨업! ${result.newLv?.name}`
        : `⚔️ 완료! +${result?.amount} EXP`
    )
    loadData()
  }

  const lv       = player ? calcLevel(player.exp) : LEVELS[0]
  const next     = player ? getNextLevel(player.exp) : null
  const pct      = player ? expBar(player.exp) : 0
  const today    = new Date().toISOString().slice(0, 10)
  const attended = player?.attend_last === today
  const barColor = BAR_COLORS[Math.min((lv.level || 1) - 1, BAR_COLORS.length - 1)]

  const todayTasks = tasks
    .filter(t => { const d = getDiff(t.end_date); return d !== null && d <= 7 })
    .sort((a, b) => (getDiff(a.end_date) ?? 99) - (getDiff(b.end_date) ?? 99))

  const urgentTasks = tasks.filter(t => {
    const d = getDiff(t.end_date)
    return d !== null && d <= 3
  })

  const stats = {
    doing: tasks.filter(t => t.status === '진행중').length,
    done : 0,
    exp  : player?.month_exp || 0,
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3]">
      {/* 헤더 */}
      <Header title="UD2팀 업무" />

      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700 shrink-0">
              {member.slice(1)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-stone-900">{member}</span>
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                  {lv.name}
                </span>
              </div>
              <button
                onClick={handleAttend}
                disabled={attended}
                className={`text-xs mt-1 px-2 py-0.5 rounded-full font-medium transition-all
                  ${attended ? 'bg-green-100 text-green-700' : 'bg-amber-500 text-white'}`}
              >
                {attended ? '✅ 출석완료' : '☀️ 출석 체크'}
              </button>
            </div>
            <div className="text-right text-xs text-stone-400">
              <div>🔥 {player?.attend_streak || 0}일 연속</div>
              <div>이달 {stats.exp.toLocaleString()} EXP</div>
            </div>
          </div>

          {/* EXP 바 */}
          <div>
            <div className="flex justify-between text-xs text-stone-400 mb-1">
              <span>{player?.exp.toLocaleString() || 0} EXP</span>
              <span>다음 레벨까지 {next ? (next.exp - (player?.exp || 0)).toLocaleString() : 0} EXP</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: barColor }}
              />
            </div>
          </div>
        </div>

        {/* 스탯 */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { icon: '☀️', label: '출석체크', value: attended ? '완료' : '미완료', onClick: handleAttend, highlight: !attended },
            { icon: '⚡', label: '진행 중',  value: stats.doing, onClick: null, highlight: false },
            { icon: '✅', label: '완료',     value: stats.done,  onClick: null, highlight: false },
            { icon: '📊', label: '월 EXP',   value: stats.exp,   onClick: null, highlight: false },
          ].map(s => (
            <button
              key={s.label}
              onClick={s.onClick || undefined}
              className={`rounded-xl border p-2.5 text-center transition-all
                ${s.highlight
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-white border-stone-200 text-stone-800'}`}
            >
              <div className="text-lg">{s.icon}</div>
              <div className="text-sm font-bold mt-0.5">{s.value}</div>
              <div className={`text-xs mt-0.5 ${s.highlight ? 'text-amber-100' : 'text-stone-400'}`}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* 오늘의 할일 */}
        {todayTasks.length > 0 && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">오늘의 할일</span>
              <span className="text-xs text-amber-600">완료 시 EXP 지급</span>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {todayTasks.map((t, i) => {
                const diff = getDiff(t.end_date)
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-4 py-3
                      ${i < todayTasks.length-1 ? 'border-b border-stone-100' : ''}`}
                  >
                    <button
                      onClick={() => completeTask(t)}
                      className="w-5 h-5 rounded-full border-2 border-stone-300 shrink-0 hover:border-amber-500 transition-colors"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {t.type && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[t.type] || 'bg-gray-100 text-gray-600'}`}>
                            {t.type}
                          </span>
                        )}
                        <span className="text-sm font-medium text-stone-800 truncate">{t.proj}</span>
                      </div>
                      {t.content && <p className="text-xs text-stone-400 truncate">{t.content}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-green-600 font-medium">+10 EXP</div>
                      {t.end_date && (
                        <div className={`text-xs ${diff !== null && diff <= 3 ? 'text-red-500 font-medium' : 'text-stone-400'}`}>
                          {t.end_date.slice(5).replace('-','/')} {diff !== null && diff < 0 ? `D+${Math.abs(diff)}` : `D-${diff}`}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 마감 임박 */}
        {urgentTasks.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">마감 임박</span>
              <span className="text-xs text-red-500 font-medium">{urgentTasks.length}건</span>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {urgentTasks.map((t, i) => {
                const diff = getDiff(t.end_date)
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-4 py-3
                      ${i < urgentTasks.length-1 ? 'border-b border-stone-100' : ''}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{t.proj}</p>
                      {t.content && <p className="text-xs text-stone-400 truncate">{t.content}</p>}
                    </div>
                    <span className="text-xs text-red-500 font-medium shrink-0">
                      {diff !== null && diff < 0 ? `D+${Math.abs(diff)}` : `D-${diff}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 데이터 없을 때 */}
        {!loading && todayTasks.length === 0 && urgentTasks.length === 0 && (
          <div className="text-center py-16 text-stone-400 text-sm">
            🎉 오늘 마감 업무가 없어요!
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}