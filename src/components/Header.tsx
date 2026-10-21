'use client'

import UserMenu from './UserMenu'
import NotificationButton from './NotificationButton'
import TeamSwitcher from './TeamSwitcher'

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto lg:max-w-none flex justify-between items-center">
        <div>
          <h1 className="text-base font-bold text-stone-900">{title}</h1>
          {subtitle && <p className="hidden sm:block text-xs text-stone-400 mt-0.5">{subtitle}</p>}
        </div>
        {/* 모바일에서만 표시 — PC에서는 좌측 사이드바에 배치 */}
        <div className="flex items-center gap-2 lg:hidden">
          <TeamSwitcher />
          <NotificationButton />
          <UserMenu />
        </div>
      </div>
    </div>
  )
}
