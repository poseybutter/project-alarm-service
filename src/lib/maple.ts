import { supabase } from './supabase'

export const LEVELS = [
  { level:1, name:'🌱 풋내기 모험가',     exp:0     },
  { level:2, name:'🗡️ 수련 중인 검사',    exp:500   },
  { level:3, name:'🛡️ 던전 탐험가',       exp:1500  },
  { level:4, name:'✨ 이름난 용병',        exp:3000  },
  { level:5, name:'🔥 보스 사냥꾼',        exp:7000  },
  { level:6, name:'💎 아케인 리버 개척자', exp:15000 },
  { level:7, name:'🌟 메이플 월드의 전설', exp:35000 },
  { level:8, name:'👑 검은 마법사의 숙적', exp:70000 },
]

export const EXP_REWARDS = {
  COMPLETE : 50,
  URGENT   : 100,
  ATTEND   : 20,
  QUEST    : 10,
}

export function calcLevel(exp: number) {
  let lv = LEVELS[0]
  for (const l of LEVELS) { if (exp >= l.exp) lv = l; else break }
  return lv
}

export function getNextLevel(exp: number) {
  return LEVELS.find(l => l.exp > exp) || null
}

export function expBar(exp: number) {
  const lv   = calcLevel(exp)
  const next = getNextLevel(exp)
  if (!next) return 100
  return Math.round((exp - lv.exp) / (next.exp - lv.exp) * 100)
}

export async function awardExp(
  member: string,
  type: 'COMPLETE' | 'URGENT' | 'ATTEND' | 'QUEST',
  isAdding: boolean = true,
  isUrgent: boolean = false,
  isOnTime: boolean = false,
) {
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('name', member)
    .single()

  if (!player) return null

  const amount   = EXP_REWARDS[type]
  const change   = isAdding ? amount : -amount
  const prevLv   = calcLevel(player.exp)
  const newExp   = Math.max(0, player.exp + change)
  const newMonthExp = Math.max(0, player.month_exp + change)
  const newLv    = calcLevel(newExp)
  const levelUp  = isAdding && newLv.level > prevLv.level

  // 통계 업데이트
  const updates: Record<string, number> = {
    exp       : newExp,
    month_exp : newMonthExp,
    level     : newLv.level,
  }

  if (isAdding && (type === 'COMPLETE' || type === 'URGENT')) {
    updates.total_done  = Math.max(0, (player.total_done || 0) + 1)
    if (isUrgent) updates.urgent_done  = Math.max(0, (player.urgent_done || 0) + 1)
    if (isOnTime) updates.on_time_done = Math.max(0, (player.on_time_done || 0) + 1)
  }
  if (!isAdding && (type === 'COMPLETE' || type === 'URGENT')) {
    updates.total_done  = Math.max(0, (player.total_done || 0) - 1)
    if (isUrgent) updates.urgent_done  = Math.max(0, (player.urgent_done || 0) - 1)
  }

  await supabase.from('players').update(updates).eq('name', member)

  return { amount, newExp, levelUp, prevLv, newLv }
}

export async function attendanceCheck(member: string) {
  const today = new Date().toISOString().slice(0, 10)

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('name', member)
    .single()

  if (!player) return { success: false, message: '플레이어를 찾을 수 없어요.' }
  if (player.attend_last === today) return { success: false, message: '오늘은 이미 출석했어요!' }

  const now       = new Date()
  const dayOfWeek = now.getDay()
  const prevDate  = new Date(now)
  if (dayOfWeek === 1) {
    prevDate.setDate(now.getDate() - 3)
  } else {
    prevDate.setDate(now.getDate() - 1)
  }
  const prevStr = prevDate.toISOString().slice(0, 10)
  const streak  = player.attend_last === prevStr ? (player.attend_streak || 0) + 1 : 1

  await supabase.from('players').update({
    attend_last   : today,
    attend_streak : streak,
  }).eq('name', member)

  const result = await awardExp(member, 'ATTEND')

  return {
    success : true,
    streak,
    exp     : result?.amount || 0,
    levelUp : result?.levelUp || false,
    newLv   : result?.newLv,
    prevLv  : result?.prevLv,
  }
}