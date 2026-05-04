export type Task = {
    id: number
    member: string
    type: string
    proj: string
    content: string
    status: string
    progress: number
    workload: number
    start_date: string | null
    end_date: string | null
    priority: string | null
    issue: string | null
    created_at: string
  }
  
  export type Player = {
    id: number
    name: string
    exp: number
    month_exp: number
    level: number
    icons: string[]
    attend_last: string | null
    attend_streak: number
    avatar_url: string | null
    total_done: number
    urgent_done: number
    on_time_done: number
  }
  
  export type Project = {
    id: number
    name: string
    member: string
    client: string | null
  }
  
  export type Accessibility = {
    id: number
    proj: string
    member: string
    start_date: string | null
    end_date: string | null
    inspection_status: string
    note: string | null
  }
  
  export type Quest = {
    id: number
    member: string
    proj: string | null
    content: string
    status: string
    end_date: string | null
    created_at: string
  }