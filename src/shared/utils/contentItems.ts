import type { ContentItem, Task } from "@/shared/types";

/** Task에서 ContentItem 배열을 추출한다. content_items가 없으면 기존 content+workload에서 변환. */
export function getContentItems(
    task: Pick<Task, "content" | "workload" | "content_items">,
): ContentItem[] {
    if (task.content_items && task.content_items.length > 0) {
        return task.content_items;
    }
    const lines = (task.content || "").split("\n").filter((l) => l.trim());
    if (lines.length === 0) return [{ text: "", workload: task.workload || 0 }];
    return lines.map((text, i) => ({
        text,
        workload: i === 0 ? task.workload || 0 : 0,
    }));
}

/** ContentItem 배열 → Supabase 저장 페이로드 */
export function contentItemsPayload(items: ContentItem[]) {
    return {
        content_items: items,
        content: items.map((item) => item.text).join("\n"),
        workload: items.reduce((sum, item) => sum + (item.workload || 0), 0),
    };
}
