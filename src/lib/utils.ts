export function getDiff(dateStr: string | null) {
    if (!dateStr) return null
    const d = new Date(dateStr)
    const n = new Date()
    d.setHours(0,0,0,0); n.setHours(0,0,0,0)
    return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
}
  
export function formatWorkload(min: number) {
    if (!min) return ''
    if (min < 60) return `${min}분`
    if (min < 480) return `${(min / 60).toFixed(1).replace('.0', '')}h`
    
    const days = Math.floor(min / 480)
    const remaining = min % 480
    
    if (remaining === 0) return `${days}일`
    if (remaining < 60) return `${days}일 ${remaining}분`
    return `${days}일 ${(remaining / 60).toFixed(1).replace('.0', '')}h`
}