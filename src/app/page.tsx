'use client'

import { useEffect, useState } from 'react'
import { supabase, Task } from '@/lib/supabase'

const MEMBERS = ['조현석', '조정연', '이헌희', '이지은']
const MEMBER_COLORS: Record<string, string> = {
  '조현석': 'bg-purple-100 text-purple-700',
  '조정연': 'bg-green-100 text-green-700',
  '이헌희': 'bg-amber-100 text-amber-700',
  '이지은': 'bg-orange-100 text-orange-700',
}
const TYPE_COLORS: Record<string, string> = {
  '프로젝트': 'bg-indigo-100 text-indigo-700',
  '유지보수': 'bg-red-100 text-red-700',
  '고도화': 'bg-green-100 text-green-700',
  '접근성': 'bg-amber-100 text-amber-700',
  '업무지원': 'bg-blue-100 text-blue-700',
}
const STATUS_COLORS: Record<string, string> = {
  '완료': 'bg-green-100 text-green-700',
  '진행중': 'bg-blue-100 text-blue-700',
  '대기': 'bg-gray-100 text-gray-600',
  '시작 전': 'bg-gray-100 text-gray-600',
  '이슈 및 대기': 'bg-red-100 text-red-700',
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

type Project = { id: number; name: string; member: string }

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    member: '', type: '', proj: '', content: '',
    priority: '', start_date: '', end_date: ''
  })

  useEffect(() => {
    loadTasks()
    loadProjects()
  }, [])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('name')
    setProjects(data || [])
  }

  const myProjects = projects.filter(p => p.member === form.member)

  async function addTask() {
    if (!form.member || !form.proj) return alert('담당자와 프로젝트명은 필수예요')
    await supabase.from('tasks').insert([{
      ...form,
      status: '대기',
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }])
    setShowModal(false)
    setForm({ member:'', type:'', proj:'', content:'', priority:'', start_date:'', end_date:'' })
    loadTasks()
  }

  async function updateStatus(id: number, status: string) {
    await supabase.from('tasks').update({ status }).eq('id', id)
    loadTasks()
  }

  async function deleteTask(id: number) {
    if (!confirm('삭제할까요?')) return
    await supabase.from('tasks').delete().eq('id', id)
    loadTasks()
  }

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'urgent') {
      const d = getDiff(t.end_date)
      return d !== null && d <= 7 && t.status !== '완료'
    }
    if (MEMBERS.includes(filter)) return t.member === filter
    return t.status === filter
  })

  const stats = {
    total: tasks.length,
    done: tasks.filter(t => t.status === '완료').length,
    doing: tasks.filter(t => t.status === '진행중').length,
    urgent: tasks.filter(t => {
      const d = getDiff(t.end_date)
      return d !== null && d <= 7 && t.status !== '완료'
    }).length
  }

  const grouped = (filter === 'all' || MEMBERS.includes(filter))
    ? MEMBERS.filter(m => filter === 'all' || m === filter)
        .reduce((acc, m) => {
          const mt = filtered.filter(t => t.member === m)
          if (mt.length > 0) acc[m] = mt
          return acc
        }, {} as Record<string, Task[]>)
    : { '_': filtered }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold text-stone-800">퍼블팀 업무 현황</h1>
            <p className="text-xs text-stone-400 mt-0.5">{getWeekLabel()}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> 업무 추가
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-white border-b border-stone-200">
          {['all','조현석','조정연','이헌희','이지은','진행중','완료','urgent'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all
                ${filter === f
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-stone-50 text-stone-500 border-stone-200'}`}
            >
              {f === 'all' ? '전체' : f === 'urgent' ? '마감임박' : f}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 px-4 py-3">
          {[
            { n: stats.total,  l: '전체' },
            { n: stats.done,   l: '완료' },
            { n: stats.doing,  l: '진행중' },
            { n: stats.urgent, l: '마감임박' },
          ].map(s => (
            <div key={s.l} className="bg-white rounded-xl border border-stone-200 p-3 text-center">
              <div className="text-xl font-bold text-stone-800">{s.n}</div>
              <div className="text-xs text-stone-400 mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-stone-400 text-sm">업무가 없어요</div>
        ) : (
          Object.entries(grouped).map(([member, memberTasks]) => (
            <div key={member} className="px-4 mb-4">
              {member !== '_' && (
                <div className="flex justify-between items-center py-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${MEMBER_COLORS[member]}`}>
                      {member.slice(1)}
                    </div>
                    <span className="text-sm font-bold text-stone-800">{member}</span>
                  </div>
                  <span className="text-xs text-stone-400">{memberTasks.length}건</span>
                </div>
              )}
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                {memberTasks.map((t, i) => {
                  const diff = getDiff(t.end_date)
                  const isUrgent = diff !== null && diff <= 7 && t.status !== '완료'
                  const isDone = t.status === '완료'
                  return (
                    <div
                      key={t.id}
                      className={`flex items-start gap-3 px-4 py-3
                        ${i < memberTasks.length-1 ? 'border-b border-stone-100' : ''}
                        ${isDone ? 'opacity-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {t.type && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[t.type] || 'bg-gray-100 text-gray-600'}`}>
                              {t.type}
                            </span>
                          )}
                          <span className={`text-sm font-medium truncate ${isDone ? 'line-through text-stone-400' : 'text-stone-800'}`}>
                            {t.proj}
                          </span>
                        </div>
                        {t.content && (
                          <p className="text-xs text-stone-400 truncate">{t.content}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <select
                          value={t.status}
                          onChange={e => updateStatus(t.id, e.target.value)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}
                        >
                          {['대기','시작 전','진행중','이슈 및 대기','완료'].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {t.end_date && (
                          <span className={`text-xs ${isUrgent ? 'text-red-500 font-medium' : 'text-stone-400'}`}>
                            {t.end_date.slice(5).replace('-','/')}
                            {isUrgent && diff !== null && diff >= 0 && ` D-${diff}`}
                            {diff !== null && diff < 0 && ` D+${Math.abs(diff)}`}
                          </span>
                        )}
                        <button
                          onClick={() => deleteTask(t.id)}
                          className="text-xs text-stone-300 hover:text-red-400 transition-colors"
                        >삭제</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-t-2xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-bold">업무 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-2xl text-stone-400 leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">담당자</label>
                <select
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                  value={form.member}
                  onChange={e => setForm({...form, member: e.target.value, proj: ''})}
                >
                  <option value="">선택</option>
                  {MEMBERS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">구분</label>
                  <select
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.type}
                    onChange={e => setForm({...form, type: e.target.value})}
                  >
                    <option value="">선택</option>
                    {['프로젝트','유지보수','고도화','접근성','업무지원'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">우선순위</label>
                  <select
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.priority}
                    onChange={e => setForm({...form, priority: e.target.value})}
                  >
                    <option value="">선택</option>
                    {['긴급','높음','보통','낮음'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">프로젝트명</label>
                <select
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                  value={form.proj}
                  onChange={e => setForm({...form, proj: e.target.value})}
                  disabled={!form.member}
                >
                  <option value="">{form.member ? '선택' : '담당자를 먼저 선택해주세요'}</option>
                  {myProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">업무 내용</label>
                <textarea
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                  placeholder="예) 메인 퍼블리싱 작업"
                  value={form.content}
                  onChange={e => setForm({...form, content: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">시작일</label>
                  <input
                    type="date"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                    value={form.start_date}
                    onChange={e => setForm({...form, start_date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1.5">종료일</label>
                  <input
                    type="date"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                    value={form.end_date}
                    onChange={e => setForm({...form, end_date: e.target.value})}
                  />
                </div>
              </div>
              <button
                onClick={addTask}
                className="w-full bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm mt-2"
              >
                등록하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}