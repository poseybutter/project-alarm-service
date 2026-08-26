/**
 * 업무 ↔ 팀 캘린더 일정 동기화.
 * TasksPage.tsx 에서 분리 — addTask/updateStatus/deleteTask 가 공통으로 쓴다.
 */

/** 업무 ID 기준으로 팀 캘린더에 일정을 POST 동기화한다. */
export async function syncTaskToTeamCalendar(taskId: number) {
    const res = await fetch(`/api/agents/team-calendar/tasks/${taskId}`, {
        method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.message || "팀 캘린더 동기화 실패");
    }
    return json;
}

/** 업무 ID 기준으로 팀 캘린더에서 일정을 DELETE 삭제한다. */
export async function deleteTaskFromTeamCalendar(taskId: number) {
    const res = await fetch(`/api/agents/team-calendar/tasks/${taskId}`, {
        method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.message || "팀 캘린더 일정 삭제 실패");
    }
    return json;
}
