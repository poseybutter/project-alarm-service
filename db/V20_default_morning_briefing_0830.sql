-- V20: Set all existing and future morning briefing times to 08:30 KST.

alter table public.agent_member_notification_settings
    alter column morning_send_time set default '08:30';

update public.agent_member_notification_settings
set morning_send_time = '08:30',
    morning_enabled = true,
    updated_at = now()
where team_id = 'ud2';
