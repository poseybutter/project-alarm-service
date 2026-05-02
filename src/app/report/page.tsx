'use client'

import { useEffect, useMemo, useState } from 'react'
import UserMenu from '@/components/UserMenu'
import { supabase } from '@/lib/supabase'
import AuthGuard from '@/components/AuthGuard'


const MEMBERS = ['TEAM_MEMBER_1', 'TEAM_MEMBER_2', 'TEAM_MEMBER_3', 'TEAM_MEMBER_4']
const LEADER  = 'TEAM_MEMBER_1'

const MEMBER_COLORS: Record<string, { bar: string; bg: string; text: string }> = {
  'TEAM_MEMBER_1': { bar: '#7C3AED', bg: 'bg-purple-100', text: 'text-purple-700' },
  'TEAM_MEMBER_2': { bar: '#059669', bg: 'bg-green-100',  text: 'text-green-700'  },
  'TEAM_MEMBER_3': { bar: '#D97706', bg: 'bg-amber-100',  text: 'text-amber-700'  },
  'TEAM_MEMBER_4': { bar: '#EA580C', bg: 'bg-orange-100', text: 'text-orange-700' },
}

const BRIEF_GROUPS: Record<string, string[]> = {
  '프로젝트': ['프로젝트'],
  '유지보수': ['유지보수'],
  '고도화':   ['고도화'],
  '접근성':   ['접근성'],
  '기타':     ['업무지원', '기타'],
}

const STATUS_COLORS: Record<string, string> = {
  '완료':         'bg-green-100 text-green-700',
  '진행중':       'bg-blue-100 text-blue-700',
  '대기':         'bg-gray-100 text-gray-600',
  '시작 전':      'bg-gray-100 text-gray-600',
  '이슈 및 대기': 'bg-red-100 text-red-700',
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

function getWeekWin(offset: number) {
  const now = new Date()
  const day = now.getDay()
  // 수요일 기준
  const wed = new Date(now)
  wed.setDate(now.getDate() - ((day + 4) % 7) + offset * 7)
  wed.setHours(0,0,0,0)
  const nextWed = new Date(wed)
  nextWed.setDate(wed.getDate() + 7)
  nextWed.setHours(23,59,59,999)

  const fmt = (d: Date) => `${d.getMonth()+1}/${d.getDate()}(${['일','월','화','수','목','금','토'][d.getDay()]})`
  return {
    from  : wed.toISOString().slice(0,10),
    to    : nextWed.toISOString().slice(0,10),
    label : `${fmt(wed)} ~ ${fmt(nextWed)}`,
  }
}

function getMonthWin(offset: number) {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + offset
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  return {
    first: first.toISOString().slice(0,10),
    last : last.toISOString().slice(0,10),
    label: `${first.getFullYear()}년 ${first.getMonth()+1}월`,
  }
}

function fmtMin(min: number) {
  if (!min) return '-'
  if (min >= 480) return `${(min / 480).toFixed(1).replace('.0','')}일`
  if (min >= 60)  return `${(min / 60).toFixed(1).replace('.0','')}h`
  return `${min}분`
}

export default function ReportPage() {
  const [mode, setMode]       = useState<'weekly' | 'monthly'>('weekly')
  const [wOff, setWOff]       = useState(0)
  const [mOff, setMOff]       = useState(0)
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTxt, setEditTxt] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const wk = getWeekWin(wOff)
  const mn = getMonthWin(mOff)

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  const wTasks = useMemo(() => tasks.filter(t => {
    const s = t.start_date || t.end_date
    const e = t.end_date   || t.start_date
    if (!s || !e) return false
    return s <= wk.to && e >= wk.from
  }), [tasks, wOff])

  const mTasks = useMemo(() => tasks.filter(t => {
    const s = t.start_date || t.end_date
    const e = t.end_date   || t.start_date
    if (!s || !e) return false
    return s <= mn.last && e >= mn.first
  }), [tasks, mOff])

  const curTasks = mode === 'weekly' ? wTasks : mTasks

  const maxWL = Math.max(
    ...MEMBERS.map(m => curTasks.filter(t => t.member === m).reduce((s, t) => s + (t.workload || 0), 0)),
    1
  )

  const autoTxt = useMemo(() => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${today.getMonth()+1}.${today.getDate()}`
    const lines = [
      'UD2팀 주간 업무 브리핑',
      `기간: ${wk.label}   |   작성일: ${dateStr}`,
      '─'.repeat(40), '',
    ]
    Object.entries(BRIEF_GROUPS).forEach(([g, types]) => {
      const gt = wTasks.filter(t => types.includes(t.type || '기타'))
      if (!gt.length) return
      lines.push(`[ ${g} ]`, '')
      const projs = [...new Set(gt.map(t => t.proj))]
      projs.forEach(proj => {
        const pt  = gt.filter(t => t.proj === proj)
        const ms  = [...new Set(pt.map(t => t.member))].map(m => `@${m}`).join(', ')
        const sts = [...new Set(pt.map(t => t.status))].join(', ')
        const hl  = pt.some(t => t.priority === '긴급' || t.status === '이슈 및 대기')
        lines.push(`${hl ? '⭐ ' : ''}${proj}   (${sts})   ${ms}`)
        pt.forEach(t => {
          if (t.content) lines.push(`  - ${t.content}`)
          if (t.issue)   lines.push(`    * 이슈: ${t.issue}`)
        })
        lines.push('')
      })
    })
    return lines.join('\n').trimEnd()
  }, [wTasks, wOff])

  function doCopy() {
    const txt = editing ? editTxt : autoTxt
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const stats = {
    total   : curTasks.length,
    done    : curTasks.filter(t => t.status === '완료').length,
    workload: curTasks.reduce((s, t) => s + (t.workload || 0), 0),
  }

  function toggleExpand(member: string) {
    setExpanded(e => ({ ...e, [member]: !e[member] }))
  }

  return (
    <AuthGuard>
        <div className="min-h-screen bg-[#f7f6f3]">
        {/* 헤더 */}
        <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
            <div className="max-w-2xl mx-auto flex justify-between items-center">
                <h1 className="text-base font-bold text-stone-900">리포트</h1>
                <div className="flex items-center gap-2">
                    <button className="text-stone-400 text-xl relative">
                        🔔
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        1
                        </span>
                    </button>
                    <UserMenu />
                </div>
            </div>
        </div>

        {/* 주간/월간 탭 */}
        <div className="bg-white border-b border-stone-200 px-4 pt-3 pb-0">
            <div className="max-w-2xl mx-auto flex">
            {[
                { key: 'weekly',  label: '주간 리포트' },
                { key: 'monthly', label: '월간 리포트' },
            ].map(t => (
                <button
                key={t.key}
                onClick={() => setMode(t.key as 'weekly' | 'monthly')}
                className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-all
                    ${mode === t.key
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-stone-400'}`}
                >
                {t.label}
                </button>
            ))}
            </div>
        </div>

        {/* 기간 네비 */}
        <div className="bg-white border-b border-stone-200 px-4 py-2">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button
                onClick={() => mode === 'weekly' ? setWOff(w => w - 1) : setMOff(m => m - 1)}
                className="text-sm text-stone-400 px-2 py-1"
            >
                ‹ 이전
            </button>
            <div className="text-center">
                <p className="text-sm font-bold text-stone-800">{mode === 'weekly' ? wk.label : mn.label}</p>
                {mode === 'weekly' && <p className="text-xs text-stone-400 mt-0.5">매주 수요일 자동 취합</p>}
            </div>
            <button
                onClick={() => mode === 'weekly' ? setWOff(w => Math.min(w + 1, 0)) : setMOff(m => Math.min(m + 1, 0))}
                disabled={mode === 'weekly' ? wOff >= 0 : mOff >= 0}
                className={`text-sm px-2 py-1 ${(mode === 'weekly' ? wOff : mOff) >= 0 ? 'text-stone-200' : 'text-stone-400'}`}
            >
                다음 ›
            </button>
            </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
            {loading ? (
            <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
            ) : (
            <>
                {/* 통계 */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                    { n: stats.total,                l: '업무 수',  color: 'text-stone-800' },
                    { n: stats.done,                 l: '완료',     color: 'text-green-600' },
                    { n: fmtMin(stats.workload),     l: '총 공수',  color: 'text-amber-600' },
                ].map(s => (
                    <div key={s.l} className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                    <div className={`text-xl font-bold ${s.color}`}>{s.n}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{s.l}</div>
                    </div>
                ))}
                </div>

                {/* 팀원별 공수 바 */}
                <div className="bg-white rounded-xl border border-stone-200 p-4 mb-3">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">팀원별 공수</p>
                <div className="space-y-3">
                    {MEMBERS.map(m => {
                    const mWL   = curTasks.filter(t => t.member === m).reduce((s, t) => s + (t.workload || 0), 0)
                    const mDone = curTasks.filter(t => t.member === m && t.status === '완료').reduce((s, t) => s + (t.workload || 0), 0)
                    const c     = MEMBER_COLORS[m]
                    return (
                        <div key={m} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${c.bg} ${c.text}`}>
                            {m.slice(1)}
                        </div>
                        <div className="flex-1 relative h-2 bg-stone-100 rounded-full overflow-hidden">
                            {/* 전체 공수 (연한색) */}
                            <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${(mWL / maxWL) * 100}%`, background: c.bar, opacity: 0.25 }}
                            />
                            {/* 완료 공수 (진한색) */}
                            <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${(mDone / maxWL) * 100}%`, background: c.bar }}
                            />
                        </div>
                        <span className="text-xs text-stone-500 w-10 text-right font-medium shrink-0">
                            {fmtMin(mWL)}
                        </span>
                        </div>
                    )
                    })}
                </div>
                </div>

                {/* 주간 브리핑 */}
                {mode === 'weekly' && (
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">주간 브리핑</p>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-300">Notion 복붙용</span>
                        <button
                        onClick={() => { if (!editing) setEditTxt(autoTxt); setEditing(e => !e) }}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all
                            ${editing ? 'bg-amber-500 text-white border-amber-500' : 'bg-stone-100 text-stone-600 border-stone-200'}`}
                        >
                        {editing ? '복원' : '편집'}
                        </button>
                        <button
                        onClick={doCopy}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all
                            ${copied ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}
                        >
                        {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    </div>
                    <div className="p-4">
                    <p className="text-xs text-stone-300 mb-2">markdown</p>
                    {editing ? (
                        <textarea
                        className="w-full text-xs text-stone-700 bg-stone-50 rounded-lg p-3 h-64 resize-none font-mono border border-stone-200"
                        value={editTxt}
                        onChange={e => setEditTxt(e.target.value)}
                        spellCheck={false}
                        />
                    ) : (
                        <pre className="text-xs text-stone-700 bg-stone-50 rounded-lg p-3 whitespace-pre-wrap font-mono overflow-x-auto">
                        {autoTxt}
                        </pre>
                    )}
                    </div>
                </div>
                )}

                {/* 팀원별 상세 (아코디언) */}
                <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">팀원별 상세</p>
                {MEMBERS.map(m => {
                    const mt = curTasks.filter(t => t.member === m)
                    if (!mt.length) return null
                    const isExp = expanded[m]
                    const c     = MEMBER_COLORS[m]
                    return (
                    <div key={m} className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-2">
                        {/* 헤더 */}
                        <button
                        onClick={() => toggleExpand(m)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${c.bg} ${c.text}`}>
                            {m.slice(1)}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-stone-800">{m}</span>
                            {m === LEADER && <span className="text-xs">👑</span>}
                            </div>
                            <p className="text-xs text-stone-400">{mt.length}건 · {mt.filter(t => t.status === '완료').length}건 완료</p>
                        </div>
                        <span className="text-stone-400 text-xs">{isExp ? '▲' : '▽'}</span>
                        </button>

                        {/* 상세 */}
                        {isExp && mt.map(t => (
                        <div
                            key={t.id}
                            className={`flex items-start gap-2 px-4 py-2.5 border-t border-stone-100
                            ${t.priority === '긴급' || t.status === '이슈 및 대기' ? 'bg-amber-50' : ''}`}
                        >
                            {(t.priority === '긴급' || t.status === '이슈 및 대기') && (
                            <span className="text-xs shrink-0 mt-1">⭐</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 mt-0.5 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                            {t.status}
                            </span>
                            <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-stone-800">{t.proj}</p>
                            {t.content && <p className="text-xs text-stone-400 truncate">{t.content}</p>}
                            {t.issue && (
                                <div className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded mt-1">
                                이슈: {t.issue}
                                </div>
                            )}
                            </div>
                            <span className="text-xs font-bold text-amber-600 shrink-0">{fmtMin(t.workload)}</span>
                        </div>
                        ))}
                    </div>
                    )
                })}
                </div>
            </>
            )}
        </div>
        </div>
    </AuthGuard>
  )
}