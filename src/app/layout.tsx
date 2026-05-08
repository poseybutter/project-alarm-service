import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import { AuthProvider } from '@/components/AuthProvider'

export const metadata: Metadata = {
  title: 'UD2팀 업무 관리',
  description: 'UD2팀 전용 업무 툴',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@4.0.0/fonts/remixicon.css"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#f7f6f3]">
        <AuthProvider>
          {children}
          <Nav />
        </AuthProvider>
      </body>
    </html>
  )
}