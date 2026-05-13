/** DB에 저장된 퀘스트 content가 HTML(Tiptap 저장본)인지 — 선행 공백 제거 후 `<` 로 시작하면 HTML */
export function questContentLooksLikeStoredHtml(
    s: string | null | undefined,
): boolean {
    return (s ?? "").trimStart().startsWith("<");
}

/** Tiptap HTML이 비어 있거나 공백·빈 태그만 있는지 */
export function questRichTextIsEffectivelyEmpty(
    raw: string | null | undefined,
): boolean {
    if (!raw?.trim()) return true;
    const text = raw
        .replace(/<[^>]+>/g, "")
        .replace(/\u00a0/g, " ")
        .trim();
    return text.length === 0;
}

/** 레거시 플레인 텍스트를 에디터 초기 HTML로 (이미 HTML이면 그대로) */
export function toQuestEditorInitialHtml(
    stored: string | null | undefined,
): string {
    const s = stored ?? "";
    if (!s.trim()) return "<p></p>";
    if (questContentLooksLikeStoredHtml(s)) return s;
    const esc = s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return `<p>${esc.replace(/\r\n/g, "\n").replace(/\n/g, "<br>")}</p>`;
}
