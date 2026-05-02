'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MEMBER_COLORS: Record<string, { bg: string; text: string }> = {
  'TEAM_MEMBER_1': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'TEAM_MEMBER_2': { bg: 'bg-green-100',  text: 'text-green-700'  },
  'TEAM_MEMBER_3': { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  'TEAM_MEMBER_4': { bg: 'bg-orange-100', text: 'text-orange-700' },
}

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
  const [url, setUrl] = useState<string | null>(avatarCache[name] ?? null)
  const c = MEMBER_COLORS[name] || { bg: 'bg-stone-100', text: 'text-stone-600' }

  useEffect(() => {
    if (avatarCache[name] !== undefined) {
      setUrl(avatarCache[name])
      return
    }
    supabase.from('players').select('avatar_url').eq('name', name).single()
      .then(({ data }) => {
        const u = data?.avatar_url || null
        avatarCache[name] = u
        setUrl(u)
      })
  }, [name])

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