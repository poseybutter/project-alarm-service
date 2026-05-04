export function getDiff(dateStr: string | null) {
    if (!dateStr) return null
    const d = new Date(dateStr)
    const n = new Date()
    d.setHours(0,0,0,0); n.setHours(0,0,0,0)
    return Math.round((d.getTime() - n.getTime()) / (1000*60*60*24))
  }
  
  export function formatWorkload(min: number) {
    if (!min) return ''
    if (min >= 480) return `${(min/480).toFixed(1).replace('.0','')}일`
    if (min >= 60)  return `${(min/60).toFixed(1).replace('.0','')}h`
    return `${min}분`
  }
  
  export function formatDate(dateStr: string) {
    return dateStr.slice(5).replace('-','/')
  }