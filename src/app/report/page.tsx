'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import UserMenu from '@/components/UserMenu'
import Avatar from '@/components/Avatar'
import { supabase } from '@/lib/supabase'
import AuthGuard from '@/components/AuthGuard'
import NotificationButton from '@/components/NotificationButton'
import { useAuth } from '@/components/AuthProvider'
import type { Task } from '@/lib/types'
import { MEMBERS, LEADER, MEMBER_COLORS, STATUS_COLORS } from '@/lib/constants'

type BriefSection = 'project' | 'maintenance' | 'etc'

/** 주간 브리핑 자동문 (섹션별 textarea에 맞춤: [프로젝트]/[유지보수] 태그 생략, 업무 줄은 ⇒) */
function formatBriefingSection(tasks: Task[], section: BriefSection): string {
  if (!tasks.length) return ''

  const groupKey = (t: Task) =>
    section === 'etc' ? `${t.type || '기타'}::${t.proj}` : t.proj

  const groups = new Map<string, Task[]>()
  for (const t of tasks) {
    const k = groupKey(t)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(t)
  }

  const orderedKeys = [...groups.keys()].sort((a, b) => {
    const ta = groups.get(a)![0]
    const tb = groups.get(b)![0]
    const pa = `${ta.type || ''} ${ta.proj}`
    const pb = `${tb.type || ''} ${tb.proj}`
    return pa.localeCompare(pb, 'ko')
  })

  const blocks: string[] = []

  for (const key of orderedKeys) {
    const groupTasks = [...groups.get(key)!].sort((a, b) => a.id - b.id)
    const first = groupTasks[0]

    const typePrefix =
      section === 'etc' && first.type
        ? `[${first.type}] `
        : section === 'etc'
          ? '[기타] '
          : ''

    const highlight = groupTasks.some(
      t => t.priority === '긴급' || t.status === '이슈 및 대기'
    )
    const members = [...new Set(groupTasks.map(t => t.member))]
      .map(m => `@${m}`)
      .join(' ')
    const statuses = [...new Set(groupTasks.map(t => t.status))].join(', ')
    const titleInner = `${typePrefix}${first.proj} (${statuses}) ${members}`.trim()
    const titleLine = `**${highlight ? '⭐ ' : ''}${titleInner}**`

    const bodyLines: string[] = []
    for (const t of groupTasks) {
      const raw = (t.content || '').trim()
      if (raw) {
        for (const line of raw.split('\n')) {
          const s = line.trim()
          if (s) bodyLines.push(`⇒ ${s}`)
        }
      }
      if (t.issue && String(t.issue).trim()) {
        bodyLines.push(`이슈: ${String(t.issue).trim()}`)
      }
    }

    const blockParts = [titleLine, '', ...bodyLines]
    const block = blockParts.join('\n').replace(/\n+$/, '')
    blocks.push(block)
  }

  return blocks.join('\n\n').trimEnd()
}

function canEdit(): boolean {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  if (day === 3 && hour >= 10) return true
  if (day === 4 || day === 5 || day === 6) return true
  if (day === 0 || day === 1 || day === 2) return true
  return false
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

type BriefingRow = {
  project: string
  maintenance: string
  etc: string
  edited_by: string | null
  updated_at: string | null
}

type Assignment = {
  id: number
  type: string
  name: string
  members: string[]
  url: string | null
  period_note: string | null
  status: string
  sort_order: number
}

function formatAssignments(list: Assignment[]): string {
  const active = list.filter(a => a.status === '진행중')
  const waiting = list.filter(a => a.status === '배정대기')
  const lines: string[] = []

  if (active.length > 0) {
    lines.push('[배정현황]')
    active.forEach(a => {
      const memberStr = (a.members || []).join(', ')
      const urlStr = a.url ? ` (${a.url})` : ''
      lines.push(`⇒ [${a.type}] ${a.name} : ${memberStr}${urlStr}`)
    })
  }

  if (waiting.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('[배정대기]')
    waiting.forEach(a => {
      lines.push(`⇒ [배정대기] ${a.name}`)
      if (a.period_note) {
        a.period_note.split('\n').forEach(l => {
          if (l.trim()) lines.push(`  ${l.trim()}`)
        })
      }
    })
  }

  return lines.join('\n')
}

const EMPTY_ASSIGN_FORM: {
  type: string
  name: string
  members: string[]
  url: string
  period_note: string
  status: '진행중' | '배정대기'
} = {
  type: '프로젝트',
  name: '',
  members: [],
  url: '',
  period_note: '',
  status: '진행중',
}

export default function ReportPage() {
  const { member: currentMember } = useAuth()
  const [mode, setMode]       = useState<'weekly' | 'monthly'>('weekly')
  const [wOff, setWOff]       = useState(0)
  const [mOff, setMOff]       = useState(0)
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [briefing, setBriefing] = useState<BriefingRow | null>(null)
  const [editing, setEditing] = useState(false)
  const [editProject, setEditProject] = useState('')
  const [editMaintenance, setEditMaintenance] = useState('')
  const [editEtc, setEditEtc] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedProject, setCopiedProject] = useState(false)
  const [copiedMaintenance, setCopiedMaintenance] = useState(false)
  const [copiedEtc, setCopiedEtc] = useState(false)

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null)
  const [assignForm, setAssignForm] = useState(() => ({ ...EMPTY_ASSIGN_FORM, members: [] as string[] }))
  const [copiedAssign, setCopiedAssign] = useState(false)

  const wk = getWeekWin(wOff)
  const mn = getMonthWin(mOff)

  const loadBriefing = useCallback(async () => {
    const weekStart = getWeekWin(wOff).from
    const { data } = await supabase
      .from('briefings')
      .select('project, maintenance, etc, edited_by, updated_at')
      .eq('week_start', weekStart)
      .maybeSingle()
    if (data) {
      setBriefing({
        project: data.project ?? '',
        maintenance: data.maintenance ?? '',
        etc: data.etc ?? '',
        edited_by: data.edited_by ?? null,
        updated_at: data.updated_at ?? null,
      })
    } else {
      setBriefing(null)
    }
  }, [wOff])

  const loadAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('assignments')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setAssignments((data as Assignment[]) || [])
  }, [])

  useEffect(() => {
    void loadAssignments()
  }, [loadAssignments])

  useEffect(() => {
    const channel = supabase
      .channel('assignments-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments' },
        () => {
          void loadAssignments()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel).catch(console.error)
    }
  }, [loadAssignments])

  useEffect(() => {
    async function loadTasks() {
      setLoading(true)
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
      setTasks(data || [])
      setLoading(false)
    }
    void loadTasks()
  }, [])

  useEffect(() => {
    setEditing(false)
  }, [wOff, mode])

  useEffect(() => {
    if (mode !== 'weekly') return
    void loadBriefing()
  }, [mode, wOff, loadBriefing])

  useEffect(() => {
    const channel = supabase
      .channel('briefings-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'briefings' },
        () => {
          void loadBriefing()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel).catch(console.error)
    }
  }, [loadBriefing])

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

  const autoProject = useMemo(
    () => formatBriefingSection(wTasks.filter(t => t.type === '프로젝트'), 'project'),
    [wTasks]
  )
  const autoMaintenance = useMemo(
    () => formatBriefingSection(wTasks.filter(t => t.type === '유지보수'), 'maintenance'),
    [wTasks]
  )
  const autoEtc = useMemo(
    () =>
      formatBriefingSection(
        wTasks.filter(t => ['접근성', '고도화', '업무지원', '기타'].includes(t.type || '')),
        'etc'
      ),
    [wTasks]
  )

  const displayProject = briefing !== null ? briefing.project : autoProject
  const displayMaintenance = briefing !== null ? briefing.maintenance : autoMaintenance
  const displayEtc = briefing !== null ? briefing.etc : autoEtc

  const editAllowed = canEdit()

  function startEditing() {
    setEditProject(briefing !== null ? briefing.project : autoProject)
    setEditMaintenance(briefing !== null ? briefing.maintenance : autoMaintenance)
    setEditEtc(briefing !== null ? briefing.etc : autoEtc)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
  }

  function restoreAutoToEdits() {
    setEditProject(autoProject)
    setEditMaintenance(autoMaintenance)
    setEditEtc(autoEtc)
  }

  async function saveBriefing() {
    setSaving(true)
    const weekStart = wk.from
    const { error } = await supabase.from('briefings').upsert(
      {
        week_start: weekStart,
        project: editProject,
        maintenance: editMaintenance,
        etc: editEtc,
        edited_by: currentMember ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'week_start' }
    )
    setSaving(false)
    if (error) {
      console.error(error)
      alert('저장에 실패했어요: ' + error.message)
      return
    }
    setEditing(false)
    await loadBriefing()
  }

  function copySection(
    text: string,
    setCopied: (v: boolean) => void
  ) {
    void navigator.clipboard.writeText(text).then(() => {
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

  const assignActive = useMemo(
    () => assignments.filter(a => a.status === '진행중'),
    [assignments]
  )
  const assignWaiting = useMemo(
    () => assignments.filter(a => a.status === '배정대기'),
    [assignments]
  )
  const assignCopyText = useMemo(() => formatAssignments(assignments), [assignments])

  function openAddAssignment() {
    setEditAssignment(null)
    setAssignForm({ ...EMPTY_ASSIGN_FORM, members: [] })
    setShowAssignModal(true)
  }

  function openEditAssignment(a: Assignment) {
    setEditAssignment(a)
    setAssignForm({
      type: a.type || '프로젝트',
      name: a.name || '',
      members: Array.isArray(a.members) ? [...a.members] : [],
      url: a.url || '',
      period_note: a.period_note || '',
      status: a.status === '배정대기' ? '배정대기' : '진행중',
    })
    setShowAssignModal(true)
  }

  function closeAssignModal() {
    setShowAssignModal(false)
    setEditAssignment(null)
    setAssignForm({ ...EMPTY_ASSIGN_FORM, members: [] })
  }

  function toggleAssignMember(name: string) {
    setAssignForm(f => ({
      ...f,
      members: f.members.includes(name)
        ? f.members.filter(m => m !== name)
        : [...f.members, name],
    }))
  }

  async function saveAssignment() {
    if (!assignForm.name.trim()) {
      alert('프로젝트명을 입력해주세요')
      return
    }
    const payload = {
      type: assignForm.type,
      name: assignForm.name.trim(),
      members: assignForm.members,
      url: assignForm.url.trim() || null,
      period_note: assignForm.period_note.trim() || null,
      status: assignForm.status,
    }
    if (editAssignment) {
      const { error } = await supabase.from('assignments').update(payload).eq('id', editAssignment.id)
      if (error) {
        alert('수정 실패: ' + error.message)
        return
      }
    } else {
      const maxSort = assignments.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0)
      const { error } = await supabase.from('assignments').insert({
        ...payload,
        sort_order: maxSort + 1,
      })
      if (error) {
        alert('추가 실패: ' + error.message)
        return
      }
    }
    closeAssignModal()
    await loadAssignments()
  }

  async function deleteAssignment(id: number) {
    if (!confirm('삭제할까요?')) return
    const { error } = await supabase.from('assignments').delete().eq('id', id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    await loadAssignments()
  }

  function copyAssignmentsBlock() {
    void navigator.clipboard.writeText(assignCopyText).then(() => {
      setCopiedAssign(true)
      setTimeout(() => setCopiedAssign(false), 2000)
    })
  }

  const { member: currentMember, role } = useAuth()
  const isLeader = role === 'admin'

  return (
    <AuthGuard>
        <div className="min-h-screen bg-[#f7f6f3]">
        {/* 헤더 */}
        <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
            <div className="max-w-2xl mx-auto flex justify-between items-center">
                <h1 className="text-base font-bold text-stone-900">리포트</h1>
                <div className="flex items-center gap-2">
                  <NotificationButton />
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
                            <Avatar name={m} size={24} showName />
                            <div className="flex-1 relative h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div className="absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${(mWL / maxWL) * 100}%`, background: c.bar, opacity: 0.25 }} />
                                <div className="absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${(mDone / maxWL) * 100}%`, background: c.bar }} />
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
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">주간 브리핑</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {!editAllowed && (
                          <span className="text-xs text-stone-400">✏️ 수요일 오전 10시 이후 편집 가능해요</span>
                        )}
                        {editAllowed && !editing && (
                          <button
                            type="button"
                            onClick={startEditing}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                          >
                            편집
                          </button>
                        )}
                        {editAllowed && editing && (
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 text-stone-600 hover:bg-stone-50"
                          >
                            취소
                          </button>
                        )}
                      </div>
                    </div>
                    {briefing !== null && (
                      <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/80">
                        <p className="text-xs text-stone-500">
                          마지막 저장: {briefing.edited_by ?? '—'} ·{' '}
                          {briefing.updated_at
                            ? new Date(briefing.updated_at).toLocaleString('ko-KR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </p>
                      </div>
                    )}
                    <div className="p-4 space-y-5">
                      {/* 프로젝트 */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-bold text-stone-600">[ 프로젝트 ]</p>
                          <button
                            type="button"
                            onClick={() =>
                              copySection(editing ? editProject : displayProject, setCopiedProject)
                            }
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0
                              ${copiedProject ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}
                          >
                            {copiedProject ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        {editing ? (
                          <textarea
                            className="w-full text-xs text-stone-700 bg-stone-50 rounded-lg p-3 min-h-[120px] resize-y font-mono border border-stone-200"
                            value={editProject}
                            onChange={e => setEditProject(e.target.value)}
                            spellCheck={false}
                          />
                        ) : (
                          <pre className="text-xs text-stone-700 bg-stone-50 rounded-lg p-3 whitespace-pre-wrap font-mono overflow-x-auto min-h-[2.5rem]">
                            {displayProject || ' '}
                          </pre>
                        )}
                      </div>
                      {/* 유지보수 */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-bold text-stone-600">[ 유지보수 ]</p>
                          <button
                            type="button"
                            onClick={() =>
                              copySection(
                                editing ? editMaintenance : displayMaintenance,
                                setCopiedMaintenance
                              )
                            }
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0
                              ${copiedMaintenance ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}
                          >
                            {copiedMaintenance ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        {editing ? (
                          <textarea
                            className="w-full text-xs text-stone-700 bg-stone-50 rounded-lg p-3 min-h-[120px] resize-y font-mono border border-stone-200"
                            value={editMaintenance}
                            onChange={e => setEditMaintenance(e.target.value)}
                            spellCheck={false}
                          />
                        ) : (
                          <pre className="text-xs text-stone-700 bg-stone-50 rounded-lg p-3 whitespace-pre-wrap font-mono overflow-x-auto min-h-[2.5rem]">
                            {displayMaintenance || ' '}
                          </pre>
                        )}
                      </div>
                      {/* 기타 */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-bold text-stone-600">[ 기타 ]</p>
                          <button
                            type="button"
                            onClick={() => copySection(editing ? editEtc : displayEtc, setCopiedEtc)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0
                              ${copiedEtc ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}
                          >
                            {copiedEtc ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        {editing ? (
                          <textarea
                            className="w-full text-xs text-stone-700 bg-stone-50 rounded-lg p-3 min-h-[120px] resize-y font-mono border border-stone-200"
                            value={editEtc}
                            onChange={e => setEditEtc(e.target.value)}
                            spellCheck={false}
                          />
                        ) : (
                          <pre className="text-xs text-stone-700 bg-stone-50 rounded-lg p-3 whitespace-pre-wrap font-mono overflow-x-auto min-h-[2.5rem]">
                            {displayEtc || ' '}
                          </pre>
                        )}
                      </div>
                      {editAllowed && editing && (
                        <div className="flex flex-col gap-2 pt-1">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void saveBriefing()}
                            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                          >
                            {saving ? '저장 중…' : '저장하기'}
                          </button>
                          <button
                            type="button"
                            onClick={restoreAutoToEdits}
                            className="w-full rounded-xl border border-stone-200 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                          >
                            자동 생성으로 복원
                          </button>
                        </div>
                      )}
                    </div>
                </div>
                )}

                {/* 배정현황 / 배정대기 */}
                {mode === 'weekly' && (
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">배정현황</p>
                    <button
                      type="button"
                      onClick={copyAssignmentsBlock}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0
                        ${copiedAssign ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}
                    >
                      {copiedAssign ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <p className="text-xs font-bold text-stone-500 mb-2">[진행중 목록]</p>
                      {assignActive.length === 0 ? (
                        <p className="text-xs text-stone-400">등록된 항목이 없어요</p>
                      ) : (
                        <ul className="space-y-2">
                          {assignActive.map(a => (
                            <li key={a.id} className="flex items-start gap-2 text-xs text-stone-800">
                              <span className="flex-1 min-w-0 leading-relaxed">
                                ⇒ [{a.type}] {a.name} : {(a.members || []).join(', ')}
                                {a.url ? (
                                  <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-1 inline-block text-amber-600 hover:underline"
                                    aria-label="링크"
                                  >
                                    🔗
                                  </a>
                                ) : null}
                              </span>
                              {isLeader && (
                                <span className="flex shrink-0 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditAssignment(a)}
                                    className="text-[11px] text-stone-400 hover:text-amber-600"
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteAssignment(a.id)}
                                    className="text-[11px] text-stone-400 hover:text-red-500"
                                  >
                                    삭제
                                  </button>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-500 mb-2">[배정대기 목록]</p>
                      {assignWaiting.length === 0 ? (
                        <p className="text-xs text-stone-400">등록된 항목이 없어요</p>
                      ) : (
                        <ul className="space-y-3">
                          {assignWaiting.map(a => (
                            <li key={a.id} className="text-xs text-stone-800">
                              <div className="flex items-start gap-2">
                                <span className="flex-1 min-w-0 leading-relaxed">
                                  ⇒ [배정대기] {a.name}
                                </span>
                                {isLeader && (
                                  <span className="flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openEditAssignment(a)}
                                      className="text-[11px] text-stone-400 hover:text-amber-600"
                                    >
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void deleteAssignment(a.id)}
                                      className="text-[11px] text-stone-400 hover:text-red-500"
                                    >
                                      삭제
                                    </button>
                                  </span>
                                )}
                              </div>
                              {a.period_note
                                ? a.period_note.split('\n').map((line, i) =>
                                    line.trim() ? (
                                      <p key={i} className="mt-1 pl-3 text-[11px] text-stone-500">
                                        * {line.trim()}
                                      </p>
                                    ) : null
                                  )
                                : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {isLeader && (
                      <button
                        type="button"
                        onClick={openAddAssignment}
                        className="w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-xs font-medium text-stone-500 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50/50"
                      >
                        + 항목 추가
                      </button>
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
                    return (
                    <div key={m} className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-2">
                        {/* 헤더 */}
                        <button
                          onClick={() => toggleExpand(m)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <div className="relative shrink-0">
                            <Avatar name={m} size={28} />
                            {m === LEADER && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs">👑</div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-stone-800">{m}</span>
                              {m === LEADER && (
                                <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium border border-yellow-200">
                                  리더
                                </span>
                              )}
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

        {showAssignModal && (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40"
            onClick={closeAssignModal}
            role="presentation"
          >
            <div
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-stone-900">
                  {editAssignment ? '배정 항목 수정' : '배정 항목 추가'}
                </h2>
                <button
                  type="button"
                  onClick={closeAssignModal}
                  className="text-2xl leading-none text-stone-400"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-500">구분</label>
                  <select
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm"
                    value={assignForm.type}
                    onChange={e => setAssignForm(f => ({ ...f, type: e.target.value }))}
                  >
                    {['프로젝트', '개편', '고도화', '유지보수', '기타'].map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-500">상태</label>
                  <select
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm"
                    value={assignForm.status}
                    onChange={e =>
                      setAssignForm(f => ({
                        ...f,
                        status: e.target.value as '진행중' | '배정대기',
                      }))
                    }
                  >
                    <option value="진행중">진행중</option>
                    <option value="배정대기">배정대기</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-500">프로젝트명</label>
                  <input
                    className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                    value={assignForm.name}
                    onChange={e => setAssignForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="예) LH사이버견본주택"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-stone-500">담당자</label>
                  <div className="grid grid-cols-4 gap-2">
                    {MEMBERS.map(name => {
                      const on = assignForm.members.includes(name)
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleAssignMember(name)}
                          className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-all
                            ${on ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-stone-50'}`}
                        >
                          <Avatar name={name} size={32} />
                          <span className="text-[10px] font-medium text-stone-600">{name.slice(1)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-500">URL (선택)</label>
                  <input
                    className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                    value={assignForm.url}
                    onChange={e => setAssignForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                {assignForm.status === '배정대기' && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-stone-500">사업기간 메모 (선택)</label>
                    <textarea
                      className="min-h-[88px] w-full resize-y rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                      value={assignForm.period_note}
                      onChange={e => setAssignForm(f => ({ ...f, period_note: e.target.value }))}
                      placeholder="예) 사업기간: 2026년 5월~12월"
                      spellCheck={false}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void saveAssignment()}
                  className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600"
                >
                  {editAssignment ? '저장하기' : '추가하기'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
    </AuthGuard>
  )
}