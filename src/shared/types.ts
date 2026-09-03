export type ContentItem = {
    text: string;
    workload: number;
};

export type Task = {
    id: number;
    team_id?: string;
    player_id?: number | null;
    project_id?: number | null;
    member: string;
    type: string;
    proj: string;
    content: string;
    content_items?: ContentItem[] | null;
    status: string;
    progress: number;
    workload: number;
    start_date: string | null;
    end_date: string | null;
    priority: string | null;
    issue: string | null;
    is_plan?: boolean | null;
    is_starred?: boolean | null;
    is_excluded_today?: boolean | null;
    show_on_team_calendar?: boolean | null;
    team_calendar_event_id?: string | null;
    team_calendar_id?: string | null;
    team_calendar_synced_at?: string | null;
    team_calendar_sync_error?: string | null;
    created_at: string;
};

export type Player = {
    id: number;
    team_id?: string;
    name: string;
    exp: number;
    month_exp: number;
    week_exp?: number;
    level: number;
    role?: string | null;
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
    team_id?: string;
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
    team_id?: string;
    player_id?: number | null;
    project_id?: number | null;
    proj: string;
    member: string;
    start_date: string | null;
    end_date: string | null;
    inspection_status: string;
    previous_inspection_status?: string | null;
    status_updated_at?: string | null;
    status_updated_by?: string | null;
    note: string | null;
    is_new?: boolean | null;
};

export type Quest = {
    id: number;
    team_id?: string;
    player_id?: number | null;
    project_id?: number | null;
    member: string;
    proj: string | null;
    content: string;
    status: string;
    end_date: string | null;
    task_id?: number | null;
    order_index?: number | null;
    created_at: string;
};

export type Season = {
    id: number;
    team_id: string;
    label: string;
    sub_label: string | null;
    range_start: string;
    range_end: string;
    status: "active" | "ended";
    mvp_member: string | null;
    created_at: string;
};

export type SeasonRecord = {
    id: number;
    season_id: number;
    team_id: string;
    player_id: number | null;
    member: string;
    rank: number;
    exp: number;
    level: number;
    level_name: string;
    created_at: string;
};

export type SeasonAward = {
    id: number;
    season_id: number;
    team_id: string;
    player_id: number | null;
    icon: string;
    title: string;
    member: string;
    metric: string;
    created_at: string;
};
