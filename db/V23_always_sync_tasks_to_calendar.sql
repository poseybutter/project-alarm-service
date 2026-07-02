-- V23: tasks are always eligible for member calendar sync

alter table public.tasks
    alter column show_on_team_calendar set default true;

update public.tasks
set show_on_team_calendar = true
where show_on_team_calendar is distinct from true;
