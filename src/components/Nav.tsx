'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/',        icon: '🏠', label: '홈'    },
  { href: '/tasks',   icon: '📋', label: '업무'  },
  { href: '/report',  icon: '✏️', label: '리포트' },
  { href: '/profile', icon: '🍄', label: '프로필' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-50">
      <div className="max-w-2xl mx-auto flex">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors
              ${pathname === item.href || (item.href === '/tasks' && pathname === '/')
                ? 'text-amber-600'
                : 'text-stone-400'}`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}