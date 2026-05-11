export type Task = {
    id: number;
    member: string;
    type: string;
    proj: string;
    content: string;
    status: string;
    progress: number;
    workload: number;
    start_date: string | null;
    end_date: string | null;
    priority: string | null;
    issue: string | null;
    is_plan?: boolean | null;
    created_at: string;
};

export type Player = {
    id: number;
    name: string;
    exp: number;
    month_exp: number;
    week_exp?: number;
    level: number;
    icons: string[];
    attend_last: string | null;
    attend_streak: number;
    avatar_url: string | null;
    total_done: number;
    urgent_done: number;
    on_time_done: number;
};

export type Project = {
    id: number;
    name: string;
    client: string | null;
    type: string | null;
    member: string | null;
    members: string[];
    language: string | null;
    pm: string | null;
    developer: string | null;
    designer: string | null;
    prev_member: string | null;
    frequency: string | null;
    note: string | null;
    created_at: string;
    is_archived?: boolean | null;
};

export type Accessibility = {
    id: number;
    proj: string;
    member: string;
    start_date: string | null;
    end_date: string | null;
    inspection_status: string;
    note: string | null;
    is_new?: boolean | null;
};

export type Quest = {
    id: number;
    member: string;
    proj: string | null;
    content: string;
    status: string;
    end_date: string | null;
    task_id?: number | null;
    created_at: string;
};
