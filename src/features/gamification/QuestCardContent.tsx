"use client";

import { questContentLooksLikeStoredHtml } from "@/features/gamification/questContentDisplay";
import { sanitizeHtml } from "@/shared/utils/sanitizeHtml";

/**
 * 퀘스트 본문 표시 — Tiptap 으로 저장된 HTML 은 정제 후 렌더하고, 평문은 그대로 보여준다.
 * (홈·퀘스트 화면이 같은 방식으로 표시하도록 공용화)
 */
export default function QuestCardContent({
    content,
    plainClassName,
    completing,
}: {
    content: string;
    plainClassName?: string;
    completing?: boolean;
}) {
    const isHtml = questContentLooksLikeStoredHtml(content);
    if (isHtml) {
        const inner = sanitizeHtml(content.trim() ? content.trim() : "<p></p>");
        return (
            <div className={`notice-editor min-w-0 ${completing ? "line-through text-stone-400" : ""}`}>
                <div
                    className={`ProseMirror tiptap break-words text-sm font-medium leading-snug [&_li]:mb-0 [&_ol]:mb-0 [&_p]:!text-sm [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:mb-0 ${completing ? "text-stone-400" : "text-stone-800"}`}
                    dangerouslySetInnerHTML={{ __html: inner }}
                />
            </div>
        );
    }
    return (
        <p
            className={
                completing
                    ? "whitespace-pre-wrap break-words text-sm font-medium text-stone-400 line-through"
                    : (plainClassName ??
                      "whitespace-pre-wrap break-words text-sm font-medium text-stone-800")
            }
        >
            {content}
        </p>
    );
}
