'use client'

import { useEffect, useState } from 'react'
import { supabase, Task } from '@/lib/supabase'
import { awardExp } from '@/lib/maple'
import AuthGuard from '@/components/AuthGuard'
import Header from '@/components/Header'
import UserMenu from '@/components/UserMenu'
import Avatar from '@/components/Avatar'
import NotificationButton from '@/components/NotificationButton'

const MEMBERS = ['조현석', '조정연', '이헌희', '이지은']

const TYPE_COLORS: Record<string, string> = {
  '프로젝트': 'bg-violet-100 text-violet-700',
  '유지보수': 'bg-red-100 text-red-700',
  '고도화':   'bg-green-100 text-green-700',
  '접근성':   'bg-sky-100 text-sky-700',
  '업무지원': 'bg-blue-100 text-blue-700',
}

const STATUS_COLORS: Record<string, string> = {
  '완료':         'bg-green-100 text-green-700',
  '진행중':       'bg-blue-100 text-blue-700',
  '대기':         'bg-gray-100 text-gray-600',
  '시작 전':      'bg-gray-100 text-gray-600',
  '이슈 및 대기': 'bg-red-100 text-red-700',
}

const WORKLOAD_PRESETS = [
  { label: '30분', value: 30 },
  { label: '1h',   value: 60 },
  { label: '2h',   value: 120 },
  { label: '4h',   value: 240 },
  { label: '1일',  value: 480 },
  { label: '2일',  value: 960 },
]

const MEMBER_BORDER: Record<string, string> = {
  '조현석': 'border-purple-400 bg-purple-100 text-purple-700',
  '조정연': 'border-green-400 bg-green-100 text-green-700',
  '이헌희': 'border-amber-400 bg-amber-100 text-amber-700',
  '이지은': 'border-orange-400 bg-orange-100 text-orange-700',
}

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

function getWeekLabel() {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((day+6)%7))
  const fri = new Date(mon)
  fri.setDate(mon.getDate()+4)
  const fmt = (d: Date) => `${d.getMonth()+1}/${d.getDate()}`
  return `${now.getFullYear()}년 ${now.getMonth()+1}월 · ${fmt(mon)}~${fmt(fri)}`
}

function formatWorkload(min: number) {
  if (!min) return ''
  if (min >= 480) return `${(min/480).toFixed(1).replace('.0','')}일`
  if (min >= 60)  return `${(min/60).toFixed(1).replace('.0','')}h`
  return `${min}분`
}

type Project = { id: number; name: string; member: string }

const EMPTY_FORM = {
  member: '', type: '', proj: '', content: '',
  priority: '', start_date: '', end_date: '', workload: 0, issue: ''
}

const EMPTY_EDIT = {
  type: '', proj: '', content: '', priority: '',
  start_date: '', end_date: '', workload: 0, issue: '', status: ''
}

export default function TasksPage() {
  const [tasks, setTasks]       = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask]   = useState<Task | null>(null)
  const [showEdit, setShowEdit]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editForm, setEditForm]   = useState(EMPTY_EDIT)

  const [filterMember,   setFilterMember]   = useState('')
  const [filterProject,  setFilterProject]  = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  useEffect(() => {
    loadTasks()
    loadProjects()
  }, [])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks').select('*')
      .order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('name')
    setProjects(data || [])
  }

  const myProjects = projects.filter(p => p.member === form.member)

  async function addTask() {
    if (!form.member || !form.proj) return alert('담당자와 프로젝트명은 필수예요')
    await supabase.from('tasks').insert([{
      member    : form.member,
      type      : form.type,
      proj      : form.proj,
      content   : form.content,
      priority  : form.priority || null,
      start_date: form.start_date || null,
      end_date  : form.end_date || null,
      workload  : form.workload || 0,
      issue     : form.issue || null,
      status    : '대기',
    }])
    setShowModal(false)
    setForm(EMPTY_FORM)
    loadTasks()
  }

  function openEdit(task: Task) {
    setEditTask(task)
    setEditForm({
      type      : task.type || '',
      proj      : task.proj || '',
      content   : task.content || '',
      priority  : task.priority || '',
      start_date: task.start_date || '',
      end_date  : task.end_date || '',
      workload  : task.workload || 0,
      issue     : task.issue || '',
      status    : task.status || '대기',
    })
    setShowEdit(true)
  }

  async function saveEdit() {
    if (!editTask) return
    await supabase.from('tasks').update({
      type      : editForm.type,
      proj      : editForm.proj,
      content   : editForm.content,
      priority  : editForm.priority || null,
      start_date: editForm.start_date || null,
      end_date  : editForm.end_date || null,
      workload  : editForm.workload || 0,
      issue     : editForm.issue || null,
      status    : editForm.status,
    }).eq('id', editTask.id)
    setShowEdit(false)
    setEditTask(null)
    loadTasks()
  }

  async function updateStatus(id: number, status: string, task: Task) {
    const prev = task.status
    await supabase.from('tasks').update({ status }).eq('id', id)
    if (status === '완료' && prev !== '완료') {
      const type     = task.priority === '긴급' ? 'URGENT' : 'COMPLETE'
      const isUrgent = task.priority === '긴급'
      // 마감일 전에 완료했으면 onTime
      const diff     = getDiff(task.end_date)
      const isOnTime = diff !== null && diff >= 0
      const result   = await awardExp(task.member, type, true, isUrgent, isOnTime)
      if (result?.levelUp) alert(`🎊 ${task.member}님 레벨업! ${result.newLv?.name}`)
    }
    if (prev === '완료' && status !== '완료') {
      const isUrgent = task.priority === '긴급'
      await awardExp(task.member, task.priority === '긴급' ? 'URGENT' : 'COMPLETE', false, isUrgent)
    }
    loadTasks()
  }

  async function deleteTask(id: number) {
    if (!confirm('삭제할까요?')) return
    await supabase.from('tasks').delete().eq('id', id)
    loadTasks()
  }

  const filtered = tasks.filter(t => {
    if (filterMember   && t.member   !== filterMember)  return false
    if (filterProject  && t.proj     !== filterProject)  return false
    if (filterPriority && t.priority !== filterPriority) return false
    return true
  })

  const stats = {
    total : tasks.length,
    doing : tasks.filter(t => t.status === '진행중').length,
    done  : tasks.filter(t => t.status === '완료').length,
    urgent: tasks.filter(t => { const d = getDiff(t.end_date); return d !== null && d <= 7 && t.status !== '완료' }).length,
  }

  const grouped = MEMBERS.reduce((acc, m) => {
    const mt = filtered.filter(t => t.member === m)
    if (mt.length > 0) acc[m] = mt
    return acc
  }, {} as Record<string, Task[]>)

  const allProjects = [...new Set(tasks.map(t => t.proj).filter(Boolean))]

  // 공통 모달 폼 컴포넌트
  function WorkloadInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-medium text-stone-500">공수</label>
          {value > 0 && <span className="text-xs text-amber-600 font-medium">{formatWorkload(value)}</span>}
        </div>
        <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm mb-2"
          placeholder="분 직접 입력"
          value={value || ''}
          onChange={e => onChange(parseInt(e.target.value) || 0)} />
        <div className="flex gap-1.5 flex-wrap">
          {WORKLOAD_PRESETS.map(p => (
            <button key={p.label}
              onClick={() => onChange(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${value === p.value ? 'bg-amber-500 text-white border-amber-500' : 'bg-stone-50 text-stone-600 border-stone-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f7f6f3]">
        {/* 헤더 */}
        <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-base font-bold text-stone-900">업무 관리</h1>
              <p className="text-xs text-stone-400 mt-0.5">{getWeekLabel()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
              >
                + 업무
              </button>
              {/* 알림 + 유저메뉴는 Header 컴포넌트 없이 직접 */}
              <NotificationButton />
              <UserMenu />
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* 통계 */}
          <div className="grid grid-cols-4 gap-2 px-4 py-3">
            {[
              { n: stats.total,  l: '전체' },
              { n: stats.doing,  l: '진행중' },
              { n: stats.done,   l: '완료' },
              { n: stats.urgent, l: '임박', red: true },
            ].map(s => (
              <div key={s.l} className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                <div className={`text-xl font-bold ${s.red && s.n > 0 ? 'text-red-500' : 'text-stone-800'}`}>{s.n}</div>
                <div className="text-xs text-stone-400 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          {/* 필터 */}
          <div className="flex gap-2 px-4 pb-3">
            <select className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white text-stone-600"
              value={filterMember} onChange={e => setFilterMember(e.target.value)}>
              <option value="">전체 담당자</option>
              {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white text-stone-600"
              value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">전체 프로젝트</option>
              {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white text-stone-600"
              value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">전체 우선순위</option>
              {['긴급','높음','보통','낮음'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* 업무 목록 */}
          {loading ? (
            <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">업무가 없어요</div>
          ) : (
            Object.entries(grouped).map(([member, memberTasks]) => (
              <div key={member} className="px-4 mb-4">
                <div className="flex justify-between items-center py-2">
                  <Avatar name={member} size={26} showName />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400">{memberTasks.length}건</span>
                    <span className="text-xs text-amber-600 font-medium">
                      {formatWorkload(memberTasks.reduce((s, t) => s + (t.workload || 0), 0))}
                    </span>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  {memberTasks.map((t, i) => {
                    const diff     = getDiff(t.end_date)
                    const isUrgent = diff !== null && diff <= 7 && t.status !== '완료'
                    const isDone   = t.status === '완료'
                    return (
                      <div
                        key={t.id}
                        className={`px-4 py-3
                          ${i < memberTasks.length-1 ? 'border-b border-stone-100' : ''}
                          ${isDone ? 'opacity-50' : ''}
                          ${t.priority === '긴급' || t.status === '이슈 및 대기' ? 'bg-amber-50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {t.priority === '긴급' && <span className="text-xs">⭐</span>}
                              {t.type && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[t.type] || 'bg-gray-100 text-gray-600'}`}>
                                  {t.type}
                                </span>
                              )}
                              <span className={`text-sm font-medium truncate ${isDone ? 'line-through text-stone-400' : 'text-stone-800'}`}>
                                {t.proj}
                              </span>
                            </div>
                            {t.content && <p className="text-xs text-stone-400 truncate mb-1">{t.content}</p>}
                            {t.issue && (
                              <div className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg mb-1 border border-amber-100">
                                이슈: {t.issue}
                              </div>
                            )}
                            {/* 기간 + 공수 */}
                            <div className="flex items-center gap-2 text-xs text-stone-400">
                              {t.workload > 0 && <span>{formatWorkload(t.workload)}</span>}
                              {t.start_date && t.end_date && (
                                <span className={isUrgent ? 'text-red-500 font-medium' : ''}>
                                  {t.start_date.slice(5).replace('-','/')} ~ {t.end_date.slice(5).replace('-','/')}
                                  {diff !== null && ` D${diff < 0 ? '+'+Math.abs(diff) : '-'+diff}`}
                                </span>
                              )}
                              {!t.start_date && t.end_date && (
                                <span className={isUrgent ? 'text-red-500 font-medium' : ''}>
                                  ~{t.end_date.slice(5).replace('-','/')}
                                  {diff !== null && ` D${diff < 0 ? '+'+Math.abs(diff) : '-'+diff}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <select
                              value={t.status}
                              onChange={e => updateStatus(t.id, e.target.value, t)}
                              className={`text-xs px-2 py-1 rounded-lg font-medium border-0 cursor-pointer ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}
                            >
                              {['대기','시작 전','진행중','이슈 및 대기','완료'].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <button onClick={() => openEdit(t)}
                              className="text-xs text-stone-300 hover:text-amber-500 transition-colors">수정</button>
                            <button onClick={() => deleteTask(t.id)}
                              className="text-xs text-stone-300 hover:text-red-400 transition-colors">삭제</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          <div className="h-24" />
        </div>

        {/* 업무 추가 모달 */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-base font-bold">업무 추가</h2>
                <button onClick={() => setShowModal(false)} className="text-2xl text-stone-400 leading-none">×</button>
              </div>
              <div className="space-y-4">
                {/* 담당자 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-2">담당자</label>
                  <div className="grid grid-cols-4 gap-2">
                    {MEMBERS.map(m => (
                      <button key={m}
                        onClick={() => setForm({...form, member: m, proj: ''})}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all
                          ${form.member === m ? MEMBER_BORDER[m] : 'bg-stone-50 border-stone-200 text-stone-400'}`}>
                        <Avatar name={m} size={36} />
                        <span className="text-xs font-medium">{m.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* 구분 + 우선순위 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">구분</label>
                    <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                      value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                      <option value="">선택</option>
                      {['프로젝트','유지보수','고도화','접근성','업무지원'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">우선순위</label>
                    <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                      value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                      <option value="">선택</option>
                      {['긴급','높음','보통','낮음'].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                {/* 프로젝트 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">프로젝트</label>
                  <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.proj} onChange={e => setForm({...form, proj: e.target.value})}
                    disabled={!form.member}>
                    <option value="">{form.member ? '선택' : '담당자를 먼저 선택해주세요'}</option>
                    {myProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                {/* 업무 내용 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">업무 내용</label>
                  <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                    placeholder="예) 메인 슬라이드 퍼블리싱"
                    value={form.content} onChange={e => setForm({...form, content: e.target.value})} />
                </div>
                {/* 공수 */}
                <WorkloadInput value={form.workload} onChange={v => setForm({...form, workload: v})} />
                {/* 날짜 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">시작일</label>
                    <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                      value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">마감일</label>
                    <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                      value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
                  </div>
                </div>
                {/* 이슈/비고 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">이슈 / 비고 (선택)</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                    placeholder="예) 클라이언트 피드백 대기..."
                    value={form.issue} onChange={e => setForm({...form, issue: e.target.value})} />
                </div>
                <button onClick={addTask}
                  className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm">
                  등록하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 업무 수정 모달 */}
        {showEdit && editTask && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setShowEdit(false)}>
            <div className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-base font-bold">업무 수정</h2>
                <button onClick={() => setShowEdit(false)} className="text-2xl text-stone-400 leading-none">×</button>
              </div>
              <div className="space-y-4">
                {/* 상태 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">상태</label>
                  <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                    {['대기','시작 전','진행중','이슈 및 대기','완료'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                {/* 구분 + 우선순위 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">구분</label>
                    <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                      value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})}>
                      <option value="">선택</option>
                      {['프로젝트','유지보수','고도화','접근성','업무지원'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">우선순위</label>
                    <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                      value={editForm.priority} onChange={e => setEditForm({...editForm, priority: e.target.value})}>
                      <option value="">선택</option>
                      {['긴급','높음','보통','낮음'].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                {/* 프로젝트 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">프로젝트</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                    value={editForm.proj} onChange={e => setEditForm({...editForm, proj: e.target.value})} />
                </div>
                {/* 업무 내용 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">업무 내용</label>
                  <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                    value={editForm.content} onChange={e => setEditForm({...editForm, content: e.target.value})} />
                </div>
                {/* 공수 */}
                <WorkloadInput value={editForm.workload} onChange={v => setEditForm({...editForm, workload: v})} />
                {/* 날짜 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">시작일</label>
                    <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                      value={editForm.start_date} onChange={e => setEditForm({...editForm, start_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1.5">마감일</label>
                    <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                      value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} />
                  </div>
                </div>
                {/* 이슈/비고 */}
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">이슈 / 비고 (선택)</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                    placeholder="예) 클라이언트 피드백 대기..."
                    value={editForm.issue} onChange={e => setEditForm({...editForm, issue: e.target.value})} />
                </div>
                <button onClick={saveEdit}
                  className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm">
                  저장하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
