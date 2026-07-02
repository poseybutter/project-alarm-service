'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { rpcSetQuestDone } from '@/lib/maple'
import Tooltip from '@/components/Tooltip'
import Select from 'react-select'
import { modalFormSelectStyles } from '@/lib/reactSelectStyles'
import { TEAM_ID } from '@/lib/constants'

const MEMBERS = ['TEAM_MEMBER_1', 'TEAM_MEMBER_2', 'TEAM_MEMBER_3', 'TEAM_MEMBER_4']
const MEMBER_COLORS: Record<string, string> = {
  'TEAM_MEMBER_1': 'bg-purple-100 text-purple-700',
  'TEAM_MEMBER_2': 'bg-green-100 text-green-700',
  'TEAM_MEMBER_3': 'bg-amber-100 text-amber-700',
  'TEAM_MEMBER_4': 'bg-orange-100 text-orange-700',
}

type Quest = {
  id: number
  member: string
  proj: string | null
  content: string
  status: string
  end_date: string | null
  created_at: string
}

function getDiff(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const n = new Date()
  d.setHours(0,0,0,0); n.setHours(0,0,0,0)
  return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}

export default function QuestsPage() {
  const [quests, setQuests]     = useState<Quest[]>([])
  const [filter, setFilter]     = useState('TEAM_MEMBER_4')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState('')
  const [form, setForm]         = useState({
    member: 'TEAM_MEMBER_4', proj: '', content: '', end_date: ''
  })

  useEffect(() => { loadQuests() }, [])

  async function loadQuests() {
    setLoading(true)
    const { data } = await supabase
      .from('quests')
      .select('*')
      .eq('team_id', TEAM_ID)
      .order('created_at', { ascending: false })
    setQuests(data || [])
    setLoading(false)
  }

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function addQuest() {
    if (!form.content) return alert('할 일 내용은 필수예요')
    await supabase.from('quests').insert([{
      member  : form.member,
      proj    : form.proj || null,
      content : form.content,
      status  : '대기',
      end_date: form.end_date || null,
      team_id : TEAM_ID,
    }])
    setShowModal(false)
    setForm({ member: filter, proj: '', content: '', end_date: '' })
    loadQuests()
  }

  async function updateQuestStatus(quest: Quest, status: string) {
    const done = status === '완료'
    // 상태 변경 + 점수는 서버 RPC 가 처리. 권한 없으면 throw → 토스트.
    const result = await rpcSetQuestDone(quest.id, done, quest.member).catch(
      () => null,
    )
    if (!result) {
      showToastMsg('권한이 없어요')
      return
    }
    if (done && result.scored) {
      showToastMsg(`📝 퀘스트 완료! +${result.amount} EXP`)
    }
    loadQuests()
  }

  async function deleteQuest(id: number) {
    if (!confirm('삭제할까요?')) return
    await supabase.from('quests').delete().eq('id', id)
    loadQuests()
  }

  const filtered = quests.filter(q => q.member === filter)
  const pending  = filtered.filter(q => q.status !== '완료').length
  const done     = filtered.filter(q => q.status === '완료').length

  return (
    <div className="min-h-screen bg-stone-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold text-stone-800">오늘의 퀘스트</h1>
            <p className="text-xs text-stone-400 mt-0.5">완료하면 EXP +10</p>
          </div>
          <button
            onClick={() => { setForm({...form, member: filter}); setShowModal(true) }}
            className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> 추가
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* 팀원 선택 */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide bg-white border-b border-stone-200">
          {MEMBERS.map(m => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all
                ${filter === m
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-stone-50 text-stone-500 border-stone-200'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
            <div className="text-xl font-bold text-stone-800">{pending}</div>
            <div className="text-xs text-stone-400 mt-0.5">미완료</div>
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
            <div className="text-xl font-bold text-green-600">{done}</div>
            <div className="text-xs text-stone-400 mt-0.5">완료</div>
          </div>
        </div>

        {/* 퀘스트 목록 */}
        <div className="px-4 pb-24">
          {loading ? (
            <div className="text-center py-16 text-stone-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              퀘스트가 없어요<br />
              <span className="text-xs">+ 버튼으로 추가해보세요!</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {filtered.map((q, i) => {
                const diff    = getDiff(q.end_date)
                const isUrgent = diff !== null && diff <= 3 && q.status !== '완료'
                const isWarn   = diff !== null && diff <= 7 && diff > 3 && q.status !== '완료'
                const isDone   = q.status === '완료'
                return (
                  <div
                    key={q.id}
                    className={`flex items-start gap-3 px-4 py-3
                      ${i < filtered.length-1 ? 'border-b border-stone-100' : ''}
                      ${isDone ? 'opacity-50' : ''}`}
                  >
                    {/* 체크 버튼 */}
                    <button
                      onClick={() => updateQuestStatus(q, isDone ? '대기' : '완료')}
                      className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all
                        ${isDone
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-stone-300'}`}
                    >
                      {isDone && <span className="text-xs">✓</span>}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDone ? 'line-through text-stone-400' : 'text-stone-800'}`}>
                        {q.content}
                      </p>
                      {q.proj && (
                        <p className="text-xs text-stone-400 mt-0.5">{q.proj}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {q.end_date && (
                        <span className={`text-xs font-medium
                          ${isUrgent ? 'text-red-500' : isWarn ? 'text-amber-500' : 'text-stone-400'}`}>
                          {isUrgent && '🚨 '}
                          {isWarn && '❗ '}
                          {q.end_date.slice(5).replace('-','/')}
                          {diff !== null && diff >= 0 && diff <= 7 && ` D-${diff}`}
                        </span>
                      )}
                      <Tooltip label="삭제">
                        <button
                          onClick={() => deleteQuest(q.id)}
                          aria-label="삭제"
                          className="text-base text-stone-300 hover:text-red-400 transition-colors"
                        ><i className="ri-delete-bin-line" aria-hidden /></button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-bold">퀘스트 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-2xl text-stone-400 leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">담당자</label>
                <Select
                  options={MEMBERS.map(m => ({ value: m, label: m }))}
                  value={form.member ? { value: form.member, label: form.member } : null}
                  onChange={opt => setForm({ ...form, member: opt?.value ?? '' })}
                  placeholder="담당자 선택"
                  isSearchable={false}
                  isClearable={false}
                  styles={modalFormSelectStyles}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">할 일</label>
                <input
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="예) 주간 보고서 작성"
                  value={form.content}
                  onChange={e => setForm({...form, content: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">관련 프로젝트 (선택)</label>
                <input
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="예) 사이버견본주택"
                  value={form.proj}
                  onChange={e => setForm({...form, proj: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">마감일 (선택)</label>
                <input
                  type="date"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"
                  value={form.end_date}
                  onChange={e => setForm({...form, end_date: e.target.value})}
                />
              </div>
              <button
                onClick={addQuest}
                className="w-full bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
