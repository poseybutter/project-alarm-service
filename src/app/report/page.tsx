'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MEMBERS = ['TEAM_MEMBER_1', 'TEAM_MEMBER_2', 'TEAM_MEMBER_3', 'TEAM_MEMBER_4']
const MEMBER_COLORS: Record<string, string> = {
  'TEAM_MEMBER_1': '#7C3AED',
  'TEAM_MEMBER_2': '#059669',
  'TEAM_MEMBER_3': '#D97706',
  'TEAM_MEMBER_4': '#EA580C',
}

type Task = {
  id: number
  member: string
  type: string
  proj: string
  content: string
  status: string
  priority: string | null
  end_date: string | null
  start_date: string | null
  workload: number
  issue: string | null
  created_at: string
}

function getWeekRange(offset: number = 0) {
  const now = new Date()
  // 수요일 기준 주간
  const day = now.getDay()
  const wed = new Date(now)
  wed.setDate(now.getDate() - ((day + 4) % 7))
  wed.setDate(wed.getDate() + offset * 7)

  const start = new Date(wed)
  const end   = new Date(wed)
  end.setDate(wed.getDate() + 7)

  return { start, end }
}

function formatDate(d: Date) {
  return `${d.getMonth()+1}/${d.getDate()}(${['일','월','화','수','목','금','토'][d.getDay()]})`
}

function formatWorkload(min: number) {
  if (!min) return '-'
  if (min >= 480) return `${(min / 480).toFixed(1)}일`
  if (min >= 60)  return `${(min / 60).toFixed(1)}h`
  return `${min}분`
}

const TYPE_ORDER = ['프로젝트', '유지보수', '고도화', '접근성', '업무지원', '기타']

export default function ReportPage() {
  const [tab, setTab]       = useState<'weekly' | 'monthly'>('weekly')
  const [offset, setOffset] = useState(0)
  const [tasks, setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [briefing, setBriefing] = useState('')
  const [copied, setCopied]   = useState(false)

  const { start, end } = getWeekRange(offset)

  useEffect(() => { loadTasks() }, [offset, tab])

  async function loadTasks() {
    setLoading(true)
    let query = supabase.from('tasks').select('*')

    if (tab === 'weekly') {
      query = query
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
    } else {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const monthEnd   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      query = query
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', monthEnd.toISOString())
    }

    const { data } = await query.order('created_at')
    setTasks(data || [])
    setBriefing(generateBriefing(data || []))
    setLoading(false)
  }

  function generateBriefing(taskList: Task[]) {
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${today.getMonth()+1}.${today.getDate()}`
    const period  = `${formatDate(start)} ~ ${formatDate(end)}`

    let text = `UD2팀 주간 업무 브리핑\n기간: ${period}   |   작성일: ${dateStr}\n\n`

    // 타입별 그룹핑
    TYPE_ORDER.forEach(type => {
      const typeTasks = taskList.filter(t => (t.type || '기타') === type)
      if (typeTasks.length === 0) return

      text += `[ ${type} ]\n\n`
      typeTasks.forEach(t => {
        const star = t.priority === '긴급' ? '⭐ ' : ''
        const wl   = t.workload ? `  ${formatWorkload(t.workload)}` : ''
        text += `${star}${t.proj}   (${t.status})   @${t.member}\n`
        if (t.content) text += `  - ${t.content}\n`
        if (t.issue)   text += `  * 이슈: ${t.issue}\n`
        text += '\n'
      })
    })

    return text
  }

  async function copyBriefing() {
    await navigator.clipboard.writeText(briefing)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 팀원별 공수 계산
  const memberWorkload = MEMBERS.map(m => ({
    name    : m,
    workload: tasks.filter(t => t.member === m).reduce((sum, t) => sum + (t.workload || 0), 0),
  }))
  const maxWorkload = Math.max(...memberWorkload.map(m => m.workload), 1)

  const stats = {
    total   : tasks.length,
    done    : tasks.filter(t => t.status === '완료').length,
    workload: tasks.reduce((sum, t) => sum + (t.workload || 0), 0),
  }

  // 팀원별 업무 그룹
  const grouped = MEMBERS.reduce((acc, m) => {
    const mt = tasks.filter(t => t.member === m)
    if (mt.length > 0) acc[m] = mt
    return acc
  }, {} as Record<string, Task[]>)

  return (
    <div className="min-h-screen bg-[#f7f6f3]">
      {/* 헤더 */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-base font-bold text-stone-900">리포트</h1>
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700">
            지은
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
        {/* 탭 */}
        <div className="flex bg-white rounded-xl border border-stone-200 p-1 mb-4">
          {[
            { key: 'weekly',  label: '주간 리포트' },
            { key: 'monthly', label: '월간 리포트' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key as 'weekly' | 'monthly'); setOffset(0) }}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all
                ${tab === t.key ? 'bg-amber-500 text-white' : 'text-stone-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 기간 네비게이션 */}
        {tab === 'weekly' && (
          <div className="flex items-center justify-between mb-4 bg-white rounded-xl border border-stone-200 px-4 py-3">
            <button onClick={() => setOffset(o => o - 1)} className="text-stone-400 text-sm px-2">‹ 이전</button>
            <div className="text-center">
              <p className="text-sm font-bold text-stone-800">{formatDate(start)} ~ {formatDate(end)}</p>
              <p className="text-xs text-stone-400 mt-0.5">매주 수요일 자동 취합</p>
            </div>
            <button
              onClick={() => setOffset(o => o + 1)}
              disabled={offset >= 0}
              className={`text-sm px-2 ${offset >= 0 ? 'text-stone-200' : 'text-stone-400'}`}
            >
              다음 ›
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
        ) : (
          <>
            {/* 통계 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { n: stats.total,               l: '업무 수' },
                { n: stats.done,                l: '완료',   green: true },
                { n: formatWorkload(stats.workload), l: '총 공수', amber: true },
              ].map(s => (
                <div key={s.l} className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                  <div className={`text-xl font-bold ${s.green ? 'text-green-600' : s.amber ? 'text-amber-600' : 'text-stone-800'}`}>
                    {s.n}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>

            {/* 팀원별 공수 바 */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">팀원별 공수</p>
              <div className="space-y-3">
                {memberWorkload.map(m => (
                  <div key={m.name} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: MEMBER_COLORS[m.name] + '20', color: MEMBER_COLORS[m.name] }}>
                      {m.name.slice(1)}
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(m.workload / maxWorkload) * 100}%`, background: MEMBER_COLORS[m.name] }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-stone-500 w-10 text-right font-medium">
                      {m.workload ? formatWorkload(m.workload) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 팀원별 상세 */}
            {Object.keys(grouped).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">팀원별 상세</p>
                {Object.entries(grouped).map(([member, memberTasks]) => {
                  const done    = memberTasks.filter(t => t.status === '완료').length
                  const wl      = memberTasks.reduce((sum, t) => sum + (t.workload || 0), 0)
                  return (
                    <div key={member} className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-2">
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-100">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: MEMBER_COLORS[member] + '20', color: MEMBER_COLORS[member] }}>
                          {member.slice(1)}
                        </div>
                        <span className="text-sm font-bold text-stone-800">{member}</span>
                        <span className="text-xs text-stone-400">{memberTasks.length}건 · {done}건 완료</span>
                        <span className="ml-auto text-xs text-amber-600 font-medium">{formatWorkload(wl)}</span>
                      </div>
                      {memberTasks.map((t, i) => (
                        <div key={t.id} className={`px-4 py-2.5 ${i < memberTasks.length-1 ? 'border-b border-stone-100' : ''}`}>
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {t.priority === '긴급' && <span className="text-xs">⭐</span>}
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium
                                  ${t.status === '완료' ? 'bg-green-100 text-green-700' :
                                    t.status === '이슈 및 대기' ? 'bg-red-100 text-red-700' :
                                    'bg-blue-100 text-blue-700'}`}>
                                  {t.status}
                                </span>
                                <span className={`text-sm font-medium truncate ${t.status === '완료' ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                                  {t.proj}
                                </span>
                              </div>
                              {t.content && <p className="text-xs text-stone-400 mt-0.5 truncate">{t.content}</p>}
                              {t.issue && (
                                <div className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded mt-1">
                                  이슈: {t.issue}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-stone-400 shrink-0">{formatWorkload(t.workload)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 주간 브리핑 */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">주간 브리핑</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400">Notion 복붙용</span>
                  <button
                    onClick={() => setEditing(e => !e)}
                    className="text-xs px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg font-medium"
                  >
                    {editing ? '완료' : '편집'}
                  </button>
                  <button
                    onClick={copyBriefing}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all
                      ${copied ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}
                  >
                    {copied ? '복사됨!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs text-stone-400 mb-2">markdown</p>
                {editing ? (
                  <textarea
                    className="w-full text-xs text-stone-700 bg-stone-50 rounded-lg p-3 h-64 resize-none font-mono border border-stone-200"
                    value={briefing}
                    onChange={e => setBriefing(e.target.value)}
                  />
                ) : (
                  <pre className="text-xs text-stone-700 bg-stone-50 rounded-lg p-3 whitespace-pre-wrap font-mono overflow-x-auto">
                    {briefing}
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}