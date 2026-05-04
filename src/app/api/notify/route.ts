import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { text } = await request.json()
  const webhook = process.env.GOOGLE_CHAT_WEBHOOK

  if (!webhook) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(webhook, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ text }),
    })

    if (!res.ok) throw new Error('webhook failed')
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}