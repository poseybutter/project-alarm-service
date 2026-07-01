import { NextRequest, NextResponse } from 'next/server'
import { sendGoogleChatMessage } from '@/lib/server/googleChat'

export async function POST(request: NextRequest) {
  const { text } = await request.json()

  try {
    await sendGoogleChatMessage({ text, channel: 'team_room' })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
