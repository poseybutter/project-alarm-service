'use client'

import { useState } from 'react'
import Tooltip from '@/components/Tooltip'
import Select from 'react-select'
import { modalFormSelectStyles } from '@/shared/styles/reactSelectStyles'
import { useAuth } from '@/components/AuthProvider'
import { findProjectId, findTeamMemberId, getDiff } from '@/shared/utils/utils'
import type { Quest } from '@/features/quests/api/questsApi'
import {
  useAddQuestMutation,
  useDeleteQuestMutation,
  useQuestProjectsQuery,
  useQuestsQuery,
  useSetQuestDoneMutation,
} from '@/features/quests/hooks/useQuests'

export default function QuestsPage() {
  const { member, members, memberOptions, teamId } = useAuth()
  const memberOptionNames = memberOptions.map(o => o.name)
  const [filter, setFilter]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast]       = useState('')
  const [form, setForm]         = useState({
    member: '', proj: '', content: '', end_date: ''
  })

  // 서버 상태 — 로딩·캐싱·팀 전환은 queryKey 가 담당
  const { data: quests = [], isLoading } = useQuestsQuery(teamId)
  const { data: projects = [] } = useQuestProjectsQuery(teamId)
  const addQuestMutation = useAddQuestMutation(teamId)
  const deleteQuestMutation = useDeleteQuestMutation(teamId)
  const setQuestDoneMutation = useSetQuestDoneMutation(teamId)

  // 멤버/팀 변경 시 렌더 중에 필터·폼 기본값 재설정 (마운트 시에도 1회 수행)
  const defaultsKey = `${member ?? ''}|${teamId ?? ''}`
  const [prevDefaultsKey, setPrevDefaultsKey] = useState('')
  if (prevDefaultsKey !== defaultsKey) {
    setPrevDefaultsKey(defaultsKey)
    if (teamId) {
      const nextMember = member ?? members[0] ?? ''
      if (nextMember) {
        setFilter(nextMember)
        // 퀘스트 추가 폼의 기본 담당자는 memberOptions에 있는 경우만 설정
        const assignable = memberOptions.some(o => o.name === nextMember)
        setForm(current => ({ ...current, member: assignable ? nextMember : '' }))
      }
    }
  }

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function addQuest() {
    if (!teamId) return
    // 더블 클릭 중복 등록 방지
    if (addQuestMutation.isPending) return
    if (!form.content) return alert('할 일 내용은 필수예요')
    const selectedPlayerId = findTeamMemberId(memberOptions, form.member)
    const selectedProjectId = findProjectId(projects, form.proj)
    if (selectedPlayerId === null) {
      showToastMsg('현재 팀의 담당자를 다시 선택해주세요')
      return
    }
    if (form.proj && selectedProjectId === null) {
      showToastMsg('현재 팀의 프로젝트를 다시 선택해주세요')
      return
    }
    try {
      await addQuestMutation.mutateAsync({
        member: form.member,
        playerId: selectedPlayerId,
        proj: form.proj || null,
        projectId: selectedProjectId,
        content: form.content,
        endDate: form.end_date || null,
        teamId,
      })
    } catch {
      showToastMsg('퀘스트 등록에 실패했어요')
      return
    }
    setShowModal(false)
    setForm({ member: filter, proj: '', content: '', end_date: '' })
  }

  async function updateQuestStatus(quest: Quest, status: string) {
    const done = status === '완료'
    // 상태 변경 + 점수는 서버 RPC 가 처리. 권한 없으면 throw → 토스트.
    const result = await setQuestDoneMutation
      .mutateAsync({ id: quest.id, done, member: quest.member })
      .catch(() => null)
    if (!result) {
      showToastMsg('권한이 없어요')
      return
    }
    if (done && result.scored) {
      showToastMsg(`📝 퀘스트 완료! +${result.amount} EXP`)
    }
  }

  async function deleteQuest(id: number) {
    if (!confirm('삭제할까요?')) return
    try {
      await deleteQuestMutation.mutateAsync(id)
    } catch {
      showToastMsg('삭제에 실패했어요')
    }
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
          {members.map(m => (
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
          {isLoading ? (
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
                  options={memberOptionNames.map(m => ({ value: m, label: m }))}
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
                <Select
                  options={projects.map(project => ({
                    value: project.name,
                    label: project.name,
                  }))}
                  value={form.proj ? { value: form.proj, label: form.proj } : null}
                  onChange={opt => setForm({...form, proj: opt?.value ?? ''})}
                  placeholder="프로젝트 검색"
                  isClearable
                  isSearchable
                  styles={modalFormSelectStyles}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                  noOptionsMessage={() => '검색 결과가 없어요'}
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
                disabled={addQuestMutation.isPending}
                className="w-full bg-amber-600 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50"
              >
                {addQuestMutation.isPending ? '추가 중...' : '추가하기'}
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
