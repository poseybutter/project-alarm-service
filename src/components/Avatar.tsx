'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    let cancelled = false
    if (!teamId) {
      setUrl(null)
      return () => { cancelled = true }
    }
    setUrl(avatarCache[cacheKey] ?? null)
    if (avatarCache[cacheKey] !== undefined) {
      setUrl(avatarCache[cacheKey])
      return () => { cancelled = true }
    }
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
          <img src={url} alt={name} className="w-full h-full object-cover" />
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
