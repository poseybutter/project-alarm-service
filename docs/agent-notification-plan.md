# Daily Notification Agent Plan

## Why this agent should exist

The daily agent should not be a louder cron job. It should reduce the morning
coordination cost for each team member.

The useful job is:

- show what needs attention today
- explain why it matters now
- combine work, accessibility deadlines, and calendar context
- avoid duplicate noise
- make the next action obvious

## Product shape

### 1. Morning digest

One personal Google Chat card per member on workdays.

Contents:

- today's calendar events
- overdue tasks
- tasks due today
- tasks due within 3 days
- accessibility deadlines within 45 days
- one short next-action line

### 2. Escalation suggestions

The agent should create suggestions, not immediately send every alert.

Examples:

- "This task is 5 days overdue and still in progress."
- "This accessibility renewal is D-14 and still request-needed."
- "This member has 6 urgent items today."

Admins can approve and send from `/agents`.

### 3. Personal webhook management

Members manage their own DM webhook in a settings modal.

Admins can additionally manage all member webhooks from the same modal.

## Google Calendar integration

There are two reasonable implementation paths.

### Preferred short-term path: Apps Script bridge

Keep Google Calendar access in GAS because it already has CalendarApp access.
Have GAS call a Next.js API with each member's daily calendar snapshot.

Pros:

- fastest
- no new Google OAuth flow in the app
- aligns with the existing GAS automation

Cons:

- calendar data sync depends on GAS trigger health

### Longer-term path: Google OAuth in app

Each member connects Google Calendar from the web app.

Pros:

- cleaner product ownership
- direct app-driven calendar sync

Cons:

- OAuth consent, token storage, refresh, and domain permissions are extra work

## Recommended next build

1. Replace task-only notification cards with a unified daily digest card.
2. Add a `calendar_events` table for daily snapshots.
3. Add a GAS function that posts each member's calendar events to the app.
4. Make `/agents` generate one digest suggestion per member.
5. Add scheduled generation later, after manual generation is trusted.
