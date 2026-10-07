'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/infrastructure/supabase/client'
import { getMemberColors } from '@/shared/constants'
import { useAuth } from '@/components/AuthProvider'

// 전역 캐시
const avatarCache: Record<string, string | null> = {}

export default function Avatar({
  name,
  size = 28,
  showName = false,
}: {
  name: string
  size?: number
  showName?: boolean
}) {
  const { teamId, member: currentMember, avatarUrl: authAvatarUrl } = useAuth()
  const cacheKey = `${teamId ?? 'none'}:${name}`
  const [url, setUrl] = useState<string | null>(avatarCache[cacheKey] ?? null)
  const c = getMemberColors(name)

  // 현재 사용자 본인 여부 — players 행 없는 팀에서 프로필 아바타로 fallback
  const isSelf = name === currentMember

  // 팀/이름이 바뀌면 렌더 중에 캐시값으로 재설정 — 이전 대상의 아바타가 잠깐 보이지 않도록
  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey)
  if (prevCacheKey !== cacheKey) {
    setPrevCacheKey(cacheKey)
    setUrl(avatarCache[cacheKey] ?? null)
  }

  useEffect(() => {
    if (!teamId) return
    // 본인 인증 아바타 변경 시 캐시 무효화 — DB에서 players.avatar_url 우선 재조회
    if (isSelf && authAvatarUrl) {
      delete avatarCache[cacheKey]
    }
    // 캐시 적중 — 렌더 시점 재설정에서 이미 반영됨
    if (avatarCache[cacheKey] !== undefined) return
    let cancelled = false
    supabase.from('players').select('avatar_url').eq('team_id', teamId).eq('name', name).single()
      .then(({ data }) => {
        // players 행이 없을 때 본인이면 프로필 아바타 사용
        const u = data?.avatar_url || (isSelf ? (authAvatarUrl ?? null) : null)
        avatarCache[cacheKey] = u
        if (!cancelled) setUrl(u)
      })
    return () => { cancelled = true }
  }, [cacheKey, name, teamId, isSelf, authAvatarUrl])

  const sz = `${size}px`

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold ${c.bg} ${c.text}`}
        style={{ width: sz, height: sz, fontSize: size * 0.4 }}
      >
        {url ? (
          <Image src={url} alt={name} width={size} height={size} className="w-full h-full object-cover" />
        ) : (
          name.slice(1)
        )}
      </div>
      {showName && (
        <span className="text-xs font-medium text-stone-700">{name}</span>
      )}
    </div>
  )
}
