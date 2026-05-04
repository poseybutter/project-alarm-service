export async function sendToGoogleChat(text: string) {
    try {
      const res = await fetch('/api/notify', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ text }),
      })
      return res.ok
    } catch (e) {
      console.error('Google Chat 전송 실패:', e)
      return false
    }
  }
  
  export async function sendLevelUpMessage(memberName: string, levelName: string) {
    const text = `🎊 *${memberName}*님이 레벨업했어요!\n✨ *${levelName}* 달성을 팀 전체가 축하합니다! 🎉🎊`
    return sendToGoogleChat(text)
  }