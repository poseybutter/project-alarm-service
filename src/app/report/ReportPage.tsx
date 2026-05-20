"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import UserMenu from "@/components/UserMenu";
import Avatar from "@/components/Avatar";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import NotificationButton from "@/components/NotificationButton";
import { useAuth } from "@/components/AuthProvider";
import { PageSpinner } from "@/components/Spinner";
import type { Task } from "@/lib/types";
import { MEMBERS, LEADER, STATUS_COLORS } from "@/lib/constants";
import { toLocalYmd } from "@/lib/toLocalYmd";
import TiptapSectionEditor from "@/components/TiptapSectionEditor";
import Select from "react-select";
import { modalFormSelectStyles } from "@/lib/reactSelectStyles";

/** 전달사항 HTML이 사용자에게 보일 내용이 있는지 (빈 에디터·공백 태그 제외) */
function noticeHtmlHasText(html: string | null | undefined): boolean {
    if (!html?.trim()) return false;
    const text = html
        .replace(/<[^>]+>/g, "")
        .replace(/\u00a0/g, " ")
        .trim();
    return text.length > 0;
}

/** 자동 브리핑 플레인을 문단 단위로 분리 (빈 줄 / 줄바꿈+** / 공백+** 경계) */
function splitBriefingPlainIntoChunks(raw: string): string[] {
    const t = (raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!t) return [];
    let chunks = t
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    chunks = chunks.flatMap((chunk) => {
        const aster = chunk.match(/\*\*/g)?.length ?? 0;
        if (aster < 4) return [chunk];
        const parts = chunk
            .split(/\s+(?=\*\*)|\n(?=\*\*)/)
            .map((s) => s.trim())
            .filter(Boolean);
        return parts.length > 1 ? parts : [chunk];
    });
    return chunks;
}

/** 이스케이프된 브리핑 조각에서 `**굵게**` → `<strong>` (자동문만 사용) */
function briefingEscapedToHtmlWithBold(escapedWithBr: string): string {
    return escapedWithBr.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
}

/** 자동 생성 브리핑(플레인) → Tiptap·미리보기용 HTML (`**` → 굵게) */
function plainBriefingToInitialHtml(plain: string): string {
    const chunks = splitBriefingPlainIntoChunks(plain);
    if (!chunks.length) return "<p></p>";
    return chunks
        .map((block) => {
            const esc = block
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            const withBr = esc.replace(/\n/g, "<br>");
            const inner = briefingEscapedToHtmlWithBold(withBr);
            return `<p>${inner}</p>`;
        })
        .join("");
}

/** 보기 모드: DB에 저장된 브리핑 HTML (Tiptap 저장본) */
function BriefingSavedHtmlPreview({ html }: { html: string }) {
    const inner = html?.trim() ? html : "<p></p>";
    return (
        <div className="notice-editor overflow-x-auto rounded-lg border border-stone-200 bg-stone-50">
            <div
                className="ProseMirror tiptap px-3 py-3 text-stone-700"
                dangerouslySetInnerHTML={{ __html: inner }}
            />
        </div>
    );
}

const PROSE_CLASSES =
    "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 " +
    "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-1.5 " +
    "[&_p]:mb-1.5 [&_p:last-child]:mb-0 " +
    "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1.5 " +
    "[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-1.5 " +
    "[&_li]:mb-0.5 " +
    "[&_strong]:font-semibold";

const SECTION_THEME = {
    checklist: "bg-red-50 border-l-4 border-red-400",
    okr: "bg-blue-50 border-l-4 border-blue-400",
    notice: "bg-amber-50 border-l-4 border-amber-400",
} as const;

type SectionTheme = keyof typeof SECTION_THEME;

/** 확인해주세요 / OKR / 주간 전달사항 읽기 모드 렌더러 */
function SectionHtmlReadView({
    html,
    theme,
}: {
    html: string;
    theme: SectionTheme;
}) {
    const inner = html?.trim() ? html : "";
    return (
        <div
            className={`rounded-lg px-4 py-3 text-sm text-stone-700 ${SECTION_THEME[theme]} ${PROSE_CLASSES}`}
            dangerouslySetInnerHTML={{ __html: inner }}
        />
    );
}

/** 복사용: HTML → 줄바꿈 유지한 플레인 텍스트 */
function htmlToPlainText(html: string): string {
    if (!html?.trim()) return "";
    return html
        .replace(/<\/p>\s*<p>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\u00a0/g, " ")
        .trim();
}

/** 노션 등: 굵게 유지하려면 text/html + text/plain 동시 제공 */
function wrapClipboardBriefingDocument(bodyHtml: string): string {
    const body = bodyHtml.trim() ? bodyHtml : "<p></p>";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

/** HTML → 마크다운 변환 (Copy 버튼용) */
function htmlToMarkdown(html: string): string {
    if (!html?.trim()) return "";
    return html
        .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
        .replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p>/gi, "\n\n")
        .replace(/<\/li>\s*<li>/gi, "\n")
        .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) =>
            inner
                .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1")
                .trim(),
        )
        .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
            let i = 0;
            return inner
                .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, c: string) => `${++i}. ${c}`)
                .trim();
        })
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\u00a0/g, " ")
        .replace(/\n{3,}/g, "\n\n") // 3줄 이상 연속 줄바꿈 → 2줄로 축약
        .trim();
}

async function copyBriefingRichToClipboard(
    bodyHtml: string,
    plainText: string,
    setCopied: (v: boolean) => void,
): Promise<void> {
    const html = wrapClipboardBriefingDocument(bodyHtml);
    const plain =
        plainText.trim() || htmlToPlainText(bodyHtml).trim() || "(내용 없음)";
    try {
        if (
            typeof ClipboardItem !== "undefined" &&
            navigator.clipboard?.write
        ) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([plain], { type: "text/plain" }),
                }),
            ]);
        } else {
            await navigator.clipboard.writeText(plain);
        }
    } catch {
        try {
            await navigator.clipboard.writeText(plain);
        } catch {
            /* ignore */
        }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
}

async function copyBriefingMarkdown(
    bodyHtml: string,
    setCopied: (v: boolean) => void,
): Promise<void> {
    const markdown = htmlToMarkdown(bodyHtml) || "(내용 없음)";
    try {
        await navigator.clipboard.writeText(markdown);
    } catch {
        /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
}

type TiptapNoticeEditorProps = {
    content: string;
    onChange: (html: string) => void;
    editable: boolean;
    showToolbar: boolean;
};

/** 주간 전달사항 Tiptap (HTML 저장) */
function TiptapNoticeEditor({
    content,
    onChange,
    editable,
    showToolbar,
}: TiptapNoticeEditorProps) {
    const [, setUiTick] = useState(0);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2] },
            }),
            Placeholder.configure({
                placeholder: "전달사항을 입력하세요...",
            }),
            Typography,
        ],
        content: content || "",
        editable,
        editorProps: {
            attributes: {
                class: "tiptap notice-editor-prose min-h-[120px] px-2 py-2 focus:outline-none",
            },
        },
        onUpdate: ({ editor: ed }) => {
            onChange(ed.getHTML());
        },
    });

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        editor.setEditable(editable);
    }, [editable, editor]);

    /** 읽기 모드: 부모 briefing 갱신(loadBriefing 등) 시 에디터 본문 즉시 반영 */
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        if (editable) return;
        const next = content || "";
        const cur = editor.getHTML();
        if (cur === next) return;
        editor.commands.setContent(next, { emitUpdate: false });
    }, [content, editor, editable]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const bump = () => setUiTick((t) => t + 1);
        editor.on("selectionUpdate", bump);
        editor.on("transaction", bump);
        return () => {
            editor.off("selectionUpdate", bump);
            editor.off("transaction", bump);
        };
    }, [editor]);

    /** 저장 버튼 포커스 이동 직전에 마지막 HTML이 부모 state에 반영되도록 */
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const flush = () => {
            onChange(editor.getHTML());
        };
        editor.on("blur", flush);
        return () => {
            editor.off("blur", flush);
        };
    }, [editor, onChange]);

    const btn = (active: boolean) =>
        `rounded px-2 py-1 text-xs font-medium border transition-colors ${
            active
                ? "bg-amber-100 border-amber-200 text-amber-900"
                : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
        }`;

    if (!editor) {
        return (
            <div className="notice-editor min-h-[120px] rounded-lg border border-stone-200 bg-stone-50 animate-pulse" />
        );
    }

    return (
        <div className="notice-editor rounded-lg border border-stone-200 bg-stone-50 overflow-hidden">
            {showToolbar && (
                <div className="flex flex-wrap gap-1 border-b border-stone-200 bg-white px-2 py-1.5">
                    <button
                        type="button"
                        className={btn(editor.isActive("bold"))}
                        onClick={() =>
                            editor.chain().focus().toggleBold().run()
                        }
                    >
                        B
                    </button>
                    <button
                        type="button"
                        className={btn(editor.isActive("italic"))}
                        onClick={() =>
                            editor.chain().focus().toggleItalic().run()
                        }
                    >
                        I
                    </button>
                    <button
                        type="button"
                        className={btn(
                            editor.isActive("heading", { level: 1 }),
                        )}
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 1 })
                                .run()
                        }
                    >
                        H1
                    </button>
                    <button
                        type="button"
                        className={btn(
                            editor.isActive("heading", { level: 2 }),
                        )}
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 2 })
                                .run()
                        }
                    >
                        H2
                    </button>
                    <button
                        type="button"
                        className={btn(editor.isActive("bulletList"))}
                        onClick={() =>
                            editor.chain().focus().toggleBulletList().run()
                        }
                    >
                        • 목록
                    </button>
                    <button
                        type="button"
                        className={btn(editor.isActive("orderedList"))}
                        onClick={() =>
                            editor.chain().focus().toggleOrderedList().run()
                        }
                    >
                        1. 순서목록
                    </button>
                </div>
            )}
            <EditorContent editor={editor} />
        </div>
    );
}

type BriefSection = "project" | "maintenance" | "etc";

/** 주간 브리핑 자동문: proj 그룹, 제목에 담당(@), 업무는 ⇒ … — 상태, 이슈는 ⚠️ 이슈: … — 상태 (⇒와 구분) */
function formatBriefingSection(tasks: Task[], section: BriefSection): string {
    if (!tasks.length) return "";

    const groupKey = (t: Task) =>
        section === "etc" ? `${t.type || "기타"}::${t.proj}` : t.proj;

    const groups = new Map<string, Task[]>();
    for (const t of tasks) {
        const k = groupKey(t);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(t);
    }

    const orderedKeys = [...groups.keys()].sort((a, b) => {
        const ta = groups.get(a)![0];
        const tb = groups.get(b)![0];
        const pa = `${ta.type || ""} ${ta.proj}`;
        const pb = `${tb.type || ""} ${tb.proj}`;
        return pa.localeCompare(pb, "ko");
    });

    const blocks: string[] = [];

    for (const key of orderedKeys) {
        const groupTasks = [...groups.get(key)!].sort((a, b) => a.id - b.id);
        const first = groupTasks[0];

        const typePrefix =
            section === "etc" && first.type
                ? `[${first.type}] `
                : section === "etc"
                  ? "[기타] "
                  : "";

        const highlight = groupTasks.some((t) => t.is_starred);
        const titleProj = `${typePrefix}${first.proj}`.trim();
        const uniqMembers = [...new Set(groupTasks.map((t) => t.member))];
        const memberPart =
            uniqMembers.length === 0
                ? ""
                : uniqMembers.length === 1
                  ? ` @${uniqMembers[0]}`
                  : ` (${uniqMembers.map((m) => `@${m}`).join(" · ")})`;
        const titleLine = `**${highlight ? "⭐ " : ""}${titleProj}${memberPart}**`;

        const multiMember = uniqMembers.length > 1;

        const bodyLines: string[] = [];
        const normalTasks = groupTasks.filter((t) => !t.is_plan);
        for (const t of normalTasks) {
            const raw = (t.content || "").trim();
            if (raw) {
                for (const line of raw.split("\n")) {
                    const s = line.trim();
                    if (s) {
                        bodyLines.push(
                            multiMember
                                ? `⇒ @${t.member} ${s} — ${t.status}`
                                : `⇒ ${s} — ${t.status}`,
                        );
                    }
                }
            }
            if (t.issue && String(t.issue).trim()) {
                const issueText = String(t.issue).trim();
                bodyLines.push(
                    multiMember
                        ? `⚠️ @${t.member} · ${issueText}`
                        : `⚠️ ${issueText}`,
                );
            }
        }

        const planTasks = groupTasks.filter(
            (t) => t.is_plan && t.status !== "완료",
        );
        for (const t of planTasks) {
            const startStr = t.start_date
                ? t.start_date.slice(5).replace("-", "/")
                : "";
            const endStr = t.end_date
                ? t.end_date.slice(5).replace("-", "/")
                : "";
            const dateStr =
                startStr && endStr
                    ? `${startStr}~${endStr} `
                    : endStr
                      ? `~${endStr} `
                      : "";
            const raw = (t.content || "").replace(/\n{2,}/g, "\n").trim();
            if (raw) {
                bodyLines.push(`⇒ ${dateStr}${raw}`);
            }
        }

        // 제목·본문을 \n으로 연결해 한 <p> 안에 <br>로 묶이도록 함
        // (빈 줄 없이 → splitBriefingPlainIntoChunks가 하나의 청크로 유지)
        const blockParts = [titleLine, ...bodyLines];
        const block = blockParts.join("\n").replace(/\n+$/, "");
        blocks.push(block);
    }

    return blocks.join("\n\n").trimEnd();
}

/** 브리핑 편집 허용 윈도우: 목요일 00:00 ~ 18:00 (KST 가정). */
function isEditableWindow(now: Date = new Date()): boolean {
    const day = now.getDay();
    const hour = now.getHours();
    if (day === 4 && hour < 18) return true; // 목 00:00~17:59
    return false;
}

function getWeekWin(offset: number) {
    const now = new Date();
    // 수(3)~화(2) 한 주: 주 시작은 수요일. 목~화는 직전 수요일.
    const y = now.getFullYear();
    const mon = now.getMonth();
    const dom = now.getDate();
    const dow = now.getDay();
    const daysFromWeekStart = (dow - 3 + 7) % 7;
    const wed = new Date(y, mon, dom - daysFromWeekStart + offset * 7);
    wed.setHours(0, 0, 0, 0);
    const nextWed = new Date(
        wed.getFullYear(),
        wed.getMonth(),
        wed.getDate() + 7,
        23,
        59,
        59,
        999,
    );

    const fmt = (d: Date) =>
        `${d.getMonth() + 1}/${d.getDate()}(${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})`;
    return {
        from: toLocalYmd(wed),
        to: toLocalYmd(nextWed),
        label: `${fmt(wed)} ~ ${fmt(nextWed)}`,
    };
}

function getMonthWin(offset: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + offset;
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return {
        first: toLocalYmd(first),
        last: toLocalYmd(last),
        label: `${first.getFullYear()}년 ${first.getMonth() + 1}월`,
    };
}

function fmtMin(min: number) {
    if (!min) return "-";
    if (min >= 480) return `${(min / 480).toFixed(1).replace(".0", "")}일`;
    if (min >= 60) return `${(min / 60).toFixed(1).replace(".0", "")}h`;
    return `${min}분`;
}

type BriefingRow = {
    project: string;
    maintenance: string;
    etc: string;
    /** Tiptap 저장 HTML */
    notice: string | null;
    checklist: string | null;
    okr: string | null;
    is_locked: boolean;
    edited_by: string | null;
    updated_at: string | null;
};

type Assignment = {
    id: number;
    type: string;
    name: string;
    members: string[];
    url: string | null;
    period_note: string | null;
    status: string;
    sort_order: number;
};

function formatAssignments(list: Assignment[]): string {
    const active = list.filter((a) => a.status === "진행중");
    const waiting = list.filter((a) => a.status === "배정대기");
    const lines: string[] = [];

    if (active.length > 0) {
        lines.push("**[배정현황]**");
        active.forEach((a) => {
            const memberStr = (a.members || []).join(", ");
            // Notion 등에 붙일 때 프로젝트명이 하이퍼링크로 인식되도록 Markdown 링크 사용
            const namePart = a.url ? `[${a.name}](${a.url})` : a.name;
            lines.push(`⇒ **[${a.type}]** ${namePart} : ${memberStr}`);
        });
    }

    if (waiting.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push("**[배정대기]**");
        waiting.forEach((a) => {
            const namePart = a.url ? `[${a.name}](${a.url})` : a.name;
            lines.push(`⇒ **[배정대기]** ${namePart}`);
            if (a.period_note) {
                a.period_note.split("\n").forEach((l) => {
                    if (l.trim()) lines.push(`  • ${l.trim()}`);
                });
            }
        });
    }

    return lines.join("\n");
}

const EMPTY_ASSIGN_FORM: {
    type: string;
    name: string;
    members: string[];
    url: string;
    period_note: string;
    status: "진행중" | "배정대기";
} = {
    type: "프로젝트",
    name: "",
    members: [],
    url: "",
    period_note: "",
    status: "진행중",
};

export default function ReportPage() {
    const { member: currentMember, role } = useAuth();
    const isGuest = currentMember === "GUEST" || role === "guest";
    const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
    const [wOff, setWOff] = useState(0);
    const wOffRef = useRef(wOff);
    useEffect(() => {
        wOffRef.current = wOff;
    }, [wOff]);
    const [mOff, setMOff] = useState(0);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const [briefing, setBriefing] = useState<BriefingRow | null>(null);
    const [editing, setEditing] = useState(false);
    const [editProject, setEditProject] = useState("");
    const [editMaintenance, setEditMaintenance] = useState("");
    const [editEtc, setEditEtc] = useState("");
    const [briefingEditorKey, setBriefingEditorKey] = useState(0);
    const [saving, setSaving] = useState(false);
    const savingBriefingRef = useRef(false);
    const [editNotice, setEditNotice] = useState("");
    /** 저장 클릭 시점에 state 배치보다 앞선 값이 쓰이지 않도록 최신 HTML 유지 */
    const editNoticeDraftRef = useRef("");
    const onNoticeHtmlChange = useCallback((html: string) => {
        editNoticeDraftRef.current = html;
        setEditNotice(html);
    }, []);
    const [editingNotice, setEditingNotice] = useState(false);
    const [savingNotice, setSavingNotice] = useState(false);
    const savingNoticeRef = useRef(false);
    const [noticeEditorNonce, setNoticeEditorNonce] = useState(0);
    const [editChecklist, setEditChecklist] = useState("");
    const editChecklistDraftRef = useRef("");
    const onChecklistHtmlChange = useCallback((html: string) => {
        editChecklistDraftRef.current = html;
        setEditChecklist(html);
    }, []);
    const [editingChecklist, setEditingChecklist] = useState(false);
    const [savingChecklist, setSavingChecklist] = useState(false);
    const savingChecklistRef = useRef(false);
    const [checklistEditorNonce, setChecklistEditorNonce] = useState(0);
    const [editOkr, setEditOkr] = useState("");
    const editOkrDraftRef = useRef("");
    const onOkrHtmlChange = useCallback((html: string) => {
        editOkrDraftRef.current = html;
        setEditOkr(html);
    }, []);
    const [editingOkr, setEditingOkr] = useState(false);
    const [savingOkr, setSavingOkr] = useState(false);
    const savingOkrRef = useRef(false);
    const [okrEditorNonce, setOkrEditorNonce] = useState(0);
    const [okrExpanded, setOkrExpanded] = useState(false);
    const [copiedProject, setCopiedProject] = useState(false);
    const [copiedMaintenance, setCopiedMaintenance] = useState(false);
    const [copiedEtc, setCopiedEtc] = useState(false);

    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [editAssignment, setEditAssignment] = useState<Assignment | null>(
        null,
    );
    const [assignForm, setAssignForm] = useState(() => ({
        ...EMPTY_ASSIGN_FORM,
        members: [] as string[],
    }));
    const [otherMember, setOtherMember] = useState("");
    const [showOtherInput, setShowOtherInput] = useState(false);
    const [copiedAssign, setCopiedAssign] = useState(false);

    savingBriefingRef.current = saving;
    savingNoticeRef.current = savingNotice;
    savingChecklistRef.current = savingChecklist;
    savingOkrRef.current = savingOkr;

    const wk = getWeekWin(wOff);
    const mn = getMonthWin(mOff);

    const loadBriefing = useCallback(async () => {
        const offsetAtStart = wOffRef.current;
        const weekStart = getWeekWin(offsetAtStart).from;
        const { data, error } = await supabase
            .from("briefings")
            .select(
                "project, maintenance, etc, notice, checklist, okr, is_locked, edited_by, updated_at",
            )
            .eq("week_start", weekStart)
            .maybeSingle();

        if (error) {
            console.error("[loadBriefing]", error.message);
            return;
        }

        if (wOffRef.current !== offsetAtStart) {
            return;
        }

        if (data && noticeHtmlHasText(data.notice)) {
            setBriefing({
                project: data.project ?? "",
                maintenance: data.maintenance ?? "",
                etc: data.etc ?? "",
                notice: data.notice ?? null,
                checklist: data.checklist ?? null,
                okr: data.okr ?? null,
                is_locked: data.is_locked ?? false,
                edited_by: data.edited_by ?? null,
                updated_at: data.updated_at ?? null,
            });
            return;
        }

        const prevWeekStart = getWeekWin(offsetAtStart - 1).from;
        const { data: prevData } = await supabase
            .from("briefings")
            .select("notice, checklist")
            .eq("week_start", prevWeekStart)
            .maybeSingle();

        if (wOffRef.current !== offsetAtStart) {
            return;
        }

        const rawPrev = prevData?.notice ?? null;
        const carriedNotice = noticeHtmlHasText(rawPrev) ? rawPrev : null;
        const rawPrevChecklist = prevData?.checklist ?? null;
        const carriedChecklist = noticeHtmlHasText(rawPrevChecklist) ? rawPrevChecklist : null;

        if (data) {
            setBriefing({
                project: data.project ?? "",
                maintenance: data.maintenance ?? "",
                etc: data.etc ?? "",
                notice: carriedNotice,
                checklist: data.checklist ?? carriedChecklist,
                okr: data.okr ?? null,
                is_locked: data.is_locked ?? false,
                edited_by: data.edited_by ?? null,
                updated_at: data.updated_at ?? null,
            });
            return;
        }

        setBriefing({
            project: "",
            maintenance: "",
            etc: "",
            notice: carriedNotice,
            checklist: carriedChecklist,
            okr: null,
            is_locked: false,
            edited_by: null,
            updated_at: null,
        });
    }, []);

    const loadAssignments = useCallback(async () => {
        const { data } = await supabase
            .from("assignments")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
        setAssignments((data as Assignment[]) || []);
    }, []);

    useEffect(() => {
        void loadAssignments();
    }, [loadAssignments]);

    useEffect(() => {
        const channel = supabase
            .channel("assignments-rt")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "assignments" },
                () => {
                    void loadAssignments();
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [loadAssignments]);

    const loadTasks = useCallback(async () => {
        const { data } = await supabase
            .from("tasks")
            .select("*")
            .order("created_at", { ascending: false });
        setTasks(data || []);
    }, []);

    useEffect(() => {
        setLoading(true);
        void loadTasks().finally(() => setLoading(false));
    }, [loadTasks]);

    useEffect(() => {
        const channel = supabase
            .channel("tasks-rt-report")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "tasks" },
                () => {
                    void loadTasks();
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [loadTasks]);

    useEffect(() => {
        setEditing(false);
        setEditingNotice(false);
        setNoticeEditorNonce((n) => n + 1);
        setBriefingEditorKey((k) => k + 1);
        setEditingChecklist(false);
        setChecklistEditorNonce((n) => n + 1);
        setEditingOkr(false);
        setOkrEditorNonce((n) => n + 1);
    }, [wOff, mode]);

    useEffect(() => {
        if (mode !== "weekly") return;
        void loadBriefing();
    }, [mode, wOff, loadBriefing]);

    useEffect(() => {
        const channel = supabase
            .channel("briefings-rt")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "briefings" },
                () => {
                    if (savingBriefingRef.current || savingNoticeRef.current || savingChecklistRef.current || savingOkrRef.current) {
                        return;
                    }
                    void loadBriefing();
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel).catch(console.error);
        };
    }, [loadBriefing]);

    const wTasks = useMemo(
        () =>
            tasks.filter((t) => {
                if (t.is_plan && t.status !== "완료") return true;
                const s = t.start_date || t.end_date;
                const e = t.end_date || t.start_date;
                if (!s || !e) return false;
                return s <= wk.to && e >= wk.from;
            }),
        [tasks, wk.from, wk.to],
    );

    const mTasks = useMemo(
        () =>
            tasks.filter((t) => {
                const s = t.start_date || t.end_date;
                const e = t.end_date || t.start_date;
                if (!s || !e) return false;
                return s <= mn.last && e >= mn.first;
            }),
        [tasks, mOff],
    );

    const curTasks = mode === "weekly" ? wTasks : mTasks;

    const autoProject = useMemo(
        () =>
            formatBriefingSection(
                wTasks.filter((t) => t.type === "프로젝트"),
                "project",
            ),
        [wTasks],
    );
    const autoMaintenance = useMemo(
        () =>
            formatBriefingSection(
                wTasks.filter((t) => t.type === "유지보수"),
                "maintenance",
            ),
        [wTasks],
    );
    const autoEtc = useMemo(
        () =>
            formatBriefingSection(
                wTasks.filter((t) =>
                    ["접근성", "고도화", "업무지원", "기타"].includes(
                        t.type || "",
                    ),
                ),
                "etc",
            ),
        [wTasks],
    );

    const editAllowed = !isGuest && isEditableWindow();

    const isEditedBriefing =
        noticeHtmlHasText(briefing?.project) ||
        noticeHtmlHasText(briefing?.maintenance) ||
        noticeHtmlHasText(briefing?.etc);

    const displayProjectHtml = noticeHtmlHasText(briefing?.project)
        ? briefing?.project ?? ""
        : plainBriefingToInitialHtml(autoProject);
    const displayMaintenanceHtml = noticeHtmlHasText(briefing?.maintenance)
        ? briefing?.maintenance ?? ""
        : plainBriefingToInitialHtml(autoMaintenance);
    const displayEtcHtml = noticeHtmlHasText(briefing?.etc)
        ? briefing?.etc ?? ""
        : plainBriefingToInitialHtml(autoEtc);

    function startEditing() {
        setEditProject(displayProjectHtml);
        setEditMaintenance(displayMaintenanceHtml);
        setEditEtc(displayEtcHtml);
        setBriefingEditorKey((k) => k + 1);
        setEditing(true);
    }

    function cancelEditing() {
        setEditing(false);
        setBriefingEditorKey((k) => k + 1);
    }

    function restoreBriefingSection(which: "project" | "maintenance" | "etc") {
        const html = plainBriefingToInitialHtml(
            which === "project"
                ? autoProject
                : which === "maintenance"
                  ? autoMaintenance
                  : autoEtc,
        );
        if (which === "project") setEditProject(html);
        else if (which === "maintenance") setEditMaintenance(html);
        else setEditEtc(html);
        setBriefingEditorKey((k) => k + 1);
    }

    async function restoreAutoBriefing() {
        if (
            !confirm(
                "편집된 내용을 지우고 업무 데이터로부터 자동 취합을 다시 시작할까요?",
            )
        )
            return;
        setSaving(true);
        try {
            const weekStart = wk.from;
            const { error } = await supabase.from("briefings").upsert(
                {
                    week_start: weekStart,
                    project: null,
                    maintenance: null,
                    etc: null,
                    notice: briefing?.notice ?? null,
                    checklist: briefing?.checklist ?? null,
                    okr: briefing?.okr ?? null,
                    is_locked: briefing?.is_locked ?? false,
                    edited_by: currentMember ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "week_start" },
            );
            if (error) {
                console.error(error);
                alert("복원에 실패했어요: " + error.message);
                return;
            }
            setEditing(false);
            await loadBriefing();
        } finally {
            setSaving(false);
        }
    }

    async function saveBriefing() {
        setSaving(true);
        try {
            const weekStart = wk.from;
            console.log("[saveBriefing] weekStart:", weekStart);
            const { error } = await supabase.from("briefings").upsert(
                {
                    week_start: weekStart,
                    project: editProject,
                    maintenance: editMaintenance,
                    etc: editEtc,
                    notice: briefing?.notice ?? null,
                    checklist: briefing?.checklist ?? null,
                    okr: briefing?.okr ?? null,
                    is_locked: briefing?.is_locked ?? false,
                    edited_by: currentMember ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "week_start" },
            );
            console.log("[saveBriefing] error:", error);
            if (error) {
                console.error(error);
                alert("저장에 실패했어요: " + error.message);
                return;
            }
            setEditing(false);
            await loadBriefing();
        } finally {
            setSaving(false);
        }
    }

    async function saveNotice() {
        setSavingNotice(true);
        try {
            const noticeHtml = editNoticeDraftRef.current;
            const weekStart = wk.from;
            const { error } = await supabase.from("briefings").upsert(
                {
                    week_start: weekStart,
                    project: briefing?.project ?? "",
                    maintenance: briefing?.maintenance ?? "",
                    etc: briefing?.etc ?? "",
                    notice: noticeHtmlHasText(noticeHtml)
                        ? noticeHtml.trim()
                        : null,
                    checklist: briefing?.checklist ?? null,
                    okr: briefing?.okr ?? null,
                    is_locked: briefing?.is_locked ?? false,
                    edited_by: currentMember ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "week_start" },
            );
            if (error) {
                console.error(error);
                alert("저장에 실패했어요: " + error.message);
                return;
            }
            await loadBriefing();
            setEditingNotice(false);
            setNoticeEditorNonce((n) => n + 1);
        } finally {
            setSavingNotice(false);
        }
    }

    async function saveChecklist() {
        setSavingChecklist(true);
        try {
            const checklistHtml = editChecklistDraftRef.current;
            const weekStart = wk.from;
            const { error } = await supabase.from("briefings").upsert(
                {
                    week_start: weekStart,
                    project: briefing?.project ?? "",
                    maintenance: briefing?.maintenance ?? "",
                    etc: briefing?.etc ?? "",
                    notice: briefing?.notice ?? null,
                    checklist: noticeHtmlHasText(checklistHtml)
                        ? checklistHtml.trim()
                        : null,
                    okr: briefing?.okr ?? null,
                    is_locked: briefing?.is_locked ?? false,
                    edited_by: currentMember ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "week_start" },
            );
            if (error) {
                console.error(error);
                alert("저장에 실패했어요: " + error.message);
                return;
            }
            await loadBriefing();
            setEditingChecklist(false);
            setChecklistEditorNonce((n) => n + 1);
        } finally {
            setSavingChecklist(false);
        }
    }

    async function saveOkr() {
        setSavingOkr(true);
        try {
            const okrHtml = editOkrDraftRef.current;
            const weekStart = wk.from;
            const { error } = await supabase.from("briefings").upsert(
                {
                    week_start: weekStart,
                    project: briefing?.project ?? "",
                    maintenance: briefing?.maintenance ?? "",
                    etc: briefing?.etc ?? "",
                    notice: briefing?.notice ?? null,
                    checklist: briefing?.checklist ?? null,
                    okr: noticeHtmlHasText(okrHtml) ? okrHtml.trim() : null,
                    is_locked: briefing?.is_locked ?? false,
                    edited_by: currentMember ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "week_start" },
            );
            if (error) {
                console.error(error);
                alert("저장에 실패했어요: " + error.message);
                return;
            }
            await loadBriefing();
            setEditingOkr(false);
            setOkrEditorNonce((n) => n + 1);
        } finally {
            setSavingOkr(false);
        }
    }

    function copySection(text: string, setCopied: (v: boolean) => void) {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    const stats = {
        total: curTasks.length,
        done: curTasks.filter((t) => t.status === "완료").length,
        workload: curTasks.reduce((s, t) => s + (t.workload || 0), 0),
    };

    function toggleExpand(member: string) {
        setExpanded((e) => ({ ...e, [member]: !e[member] }));
    }

    const assignActive = useMemo(
        () => assignments.filter((a) => a.status === "진행중"),
        [assignments],
    );
    const assignWaiting = useMemo(
        () => assignments.filter((a) => a.status === "배정대기"),
        [assignments],
    );
    const assignCopyText = useMemo(
        () => formatAssignments(assignments),
        [assignments],
    );

    function openAddAssignment() {
        setEditAssignment(null);
        setAssignForm({ ...EMPTY_ASSIGN_FORM, members: [] });
        setOtherMember("");
        setShowOtherInput(false);
        setShowAssignModal(true);
    }

    function openEditAssignment(a: Assignment) {
        setEditAssignment(a);
        const raw = Array.isArray(a.members) ? [...a.members] : [];
        const core = raw.filter((x) => MEMBERS.includes(x));
        const extra = raw.filter((x) => !MEMBERS.includes(x));
        setAssignForm({
            type: a.type || "프로젝트",
            name: a.name || "",
            members: core,
            url: a.url || "",
            period_note: a.period_note || "",
            status: a.status === "배정대기" ? "배정대기" : "진행중",
        });
        setOtherMember(extra.join(", "));
        setShowOtherInput(extra.length > 0);
        setShowAssignModal(true);
    }

    function closeAssignModal() {
        setShowAssignModal(false);
        setEditAssignment(null);
        setAssignForm({ ...EMPTY_ASSIGN_FORM, members: [] });
        setOtherMember("");
        setShowOtherInput(false);
    }

    function toggleOtherMember() {
        if (showOtherInput) {
            setOtherMember("");
            setShowOtherInput(false);
        } else {
            setShowOtherInput(true);
        }
    }

    function parseOtherMemberNames(text: string): string[] {
        return text
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    function toggleAssignMember(name: string) {
        setAssignForm((f) => ({
            ...f,
            members: f.members.includes(name)
                ? f.members.filter((m) => m !== name)
                : [...f.members, name],
        }));
    }

    async function saveAssignment() {
        if (!assignForm.name.trim()) {
            alert("프로젝트명을 입력해주세요");
            return;
        }
        const extraNames = showOtherInput
            ? parseOtherMemberNames(otherMember)
            : [];
        const mergedRaw = [...assignForm.members, ...extraNames];
        const seen = new Set<string>();
        const mergedMembers = mergedRaw.filter((m) => {
            if (seen.has(m)) return false;
            seen.add(m);
            return true;
        });
        const payload = {
            type: assignForm.type,
            name: assignForm.name.trim(),
            members: mergedMembers,
            url: assignForm.url.trim() || null,
            period_note: assignForm.period_note.trim() || null,
            status: assignForm.status,
        };
        if (editAssignment) {
            const { error } = await supabase
                .from("assignments")
                .update(payload)
                .eq("id", editAssignment.id);
            if (error) {
                alert("수정 실패: " + error.message);
                return;
            }
        } else {
            const maxSort = assignments.reduce(
                (m, a) => Math.max(m, a.sort_order ?? 0),
                0,
            );
            const { error } = await supabase.from("assignments").insert({
                ...payload,
                sort_order: maxSort + 1,
            });
            if (error) {
                alert("추가 실패: " + error.message);
                return;
            }
        }
        closeAssignModal();
        await loadAssignments();
    }

    async function deleteAssignment(id: number) {
        if (!confirm("삭제할까요?")) return;
        const { error } = await supabase
            .from("assignments")
            .delete()
            .eq("id", id);
        if (error) {
            alert("삭제 실패: " + error.message);
            return;
        }
        await loadAssignments();
    }

    function copyAssignmentsBlock() {
        void navigator.clipboard.writeText(assignCopyText).then(() => {
            setCopiedAssign(true);
            setTimeout(() => setCopiedAssign(false), 2000);
        });
    }

    const isLeader = role === "admin";

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f7f6f3]">
                {/* 헤더 */}
                <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <h1 className="text-base font-bold text-stone-900">
                            리포트
                        </h1>
                        <div className="flex items-center gap-2">
                            <NotificationButton />
                            <UserMenu />
                        </div>
                    </div>
                </div>

                {/* 주간/월간 탭 */}
                <div className="border-b border-stone-200 px-4 py-3">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex bg-white rounded-lg p-0.5">
                            {[
                                { key: "weekly", label: "주간 리포트" },
                                { key: "monthly", label: "월간 리포트" },
                            ].map((t) => (
                                <button
                                    type="button"
                                    key={t.key}
                                    onClick={() =>
                                        setMode(t.key as "weekly" | "monthly")
                                    }
                                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-all
                    ${
                        mode === t.key
                            ? "bg-amber-500 text-white shadow-sm"
                            : "text-stone-500 hover:text-stone-700"
                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 기간 네비 */}
                <div className="border-b border-stone-200 px-4 py-2">
                    <div className="max-w-2xl mx-auto flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() =>
                                mode === "weekly"
                                    ? setWOff((w) => w - 1)
                                    : setMOff((m) => m - 1)
                            }
                            className="text-sm text-stone-400 px-2 py-1"
                        >
                            ‹ 이전
                        </button>
                        <div className="text-center">
                            <p className="text-sm font-bold text-stone-800">
                                {mode === "weekly" ? wk.label : mn.label}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                mode === "weekly"
                                    ? setWOff((w) => Math.min(w + 1, 0))
                                    : setMOff((m) => Math.min(m + 1, 0))
                            }
                            disabled={mode === "weekly" ? wOff >= 0 : mOff >= 0}
                            className={`text-sm px-2 py-1 ${(mode === "weekly" ? wOff : mOff) >= 0 ? "text-stone-200" : "text-stone-400"}`}
                        >
                            다음 ›
                        </button>
                    </div>
                </div>

                <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
                    {loading ? (
                        <PageSpinner />
                    ) : (
                        <>
                            {/* 통계 */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {[
                                    {
                                        n: stats.total,
                                        l: "업무 수",
                                        color: "text-stone-800",
                                    },
                                    {
                                        n: stats.done,
                                        l: "완료",
                                        color: "text-green-600",
                                    },
                                    {
                                        n: fmtMin(stats.workload),
                                        l: "총 공수",
                                        color: "text-amber-600",
                                    },
                                ].map((s) => (
                                    <div
                                        key={s.l}
                                        className="bg-white rounded-xl border border-stone-200 p-3 text-center"
                                    >
                                        <div
                                            className={`text-xl font-bold ${s.color}`}
                                        >
                                            {s.n}
                                        </div>
                                        <div className="text-[13px] text-stone-400 mt-0.5">
                                            {s.l}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 확인해주세요 */}
                            {mode === "weekly" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
                                        <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                            📌 확인해주세요
                                        </p>
                                        {isLeader && !editingChecklist && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const initial =
                                                        briefing?.checklist ?? "";
                                                    editChecklistDraftRef.current =
                                                        initial;
                                                    setEditChecklist(initial);
                                                    setEditingChecklist(true);
                                                    setChecklistEditorNonce(
                                                        (n) => n + 1,
                                                    );
                                                }}
                                                className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                                            >
                                                편집
                                            </button>
                                        )}
                                    </div>
                                    <div className="p-4 space-y-3">
                                        {!editingChecklist ? (
                                            noticeHtmlHasText(briefing?.checklist) ? (
                                                <SectionHtmlReadView
                                                    html={briefing!.checklist!}
                                                    theme="checklist"
                                                />
                                            ) : (
                                                <p className="text-[13px] text-stone-400">
                                                    이번 주 확인 사항이 없어요
                                                </p>
                                            )
                                        ) : (
                                            <TiptapNoticeEditor
                                                key={`checklist-${wOff}-${checklistEditorNonce}`}
                                                content={editChecklist}
                                                onChange={onChecklistHtmlChange}
                                                editable={isLeader}
                                                showToolbar={isLeader}
                                            />
                                        )}
                                        {editingChecklist && isLeader && (
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        void saveChecklist();
                                                    }}
                                                    disabled={savingChecklist}
                                                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                                >
                                                    {savingChecklist
                                                        ? "저장 중…"
                                                        : "저장하기"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const restored =
                                                            briefing?.checklist ??
                                                            "";
                                                        editChecklistDraftRef.current =
                                                            restored;
                                                        setEditingChecklist(false);
                                                        setEditChecklist(restored);
                                                        setChecklistEditorNonce(
                                                            (n) => n + 1,
                                                        );
                                                    }}
                                                    className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* OKR */}
                            {mode === "weekly" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div
                                        className="flex items-center justify-between px-4 py-3 border-b border-stone-100 cursor-pointer"
                                        onClick={() => setOkrExpanded((v) => !v)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOkrExpanded((v) => !v); }}
                                    >
                                        <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                            OKR
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {isLeader && !editingOkr && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const initial =
                                                            briefing?.okr ?? "";
                                                        editOkrDraftRef.current =
                                                            initial;
                                                        setEditOkr(initial);
                                                        setEditingOkr(true);
                                                        setOkrExpanded(true);
                                                        setOkrEditorNonce(
                                                            (n) => n + 1,
                                                        );
                                                    }}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                                                >
                                                    편집
                                                </button>
                                            )}
                                            <i
                                                className={`${okrExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-stone-400`}
                                                aria-hidden
                                            />
                                        </div>
                                    </div>
                                    {okrExpanded && (
                                        <>
                                            <div className="p-4 space-y-3">
                                                {!editingOkr ? (
                                                    noticeHtmlHasText(briefing?.okr) ? (
                                                        <SectionHtmlReadView
                                                            html={briefing!.okr!}
                                                            theme="okr"
                                                        />
                                                    ) : (
                                                        <p className="text-[13px] text-stone-400">
                                                            등록된 OKR이 없어요
                                                        </p>
                                                    )
                                                ) : (
                                                    <TiptapNoticeEditor
                                                        key={`okr-${wOff}-${okrEditorNonce}`}
                                                        content={editOkr}
                                                        onChange={onOkrHtmlChange}
                                                        editable={isLeader}
                                                        showToolbar={isLeader}
                                                    />
                                                )}
                                                {editingOkr && isLeader && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                void saveOkr();
                                                            }}
                                                            disabled={savingOkr}
                                                            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                                        >
                                                            {savingOkr
                                                                ? "저장 중…"
                                                                : "저장하기"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const restored =
                                                                    briefing?.okr ??
                                                                    "";
                                                                editOkrDraftRef.current =
                                                                    restored;
                                                                setEditingOkr(false);
                                                                setEditOkr(restored);
                                                                setOkrEditorNonce(
                                                                    (n) => n + 1,
                                                                );
                                                            }}
                                                            className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* 주간 전달사항 */}
                            {mode === "weekly" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
                                        <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                            주간 전달사항
                                        </p>
                                        {isLeader && !editingNotice && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const initial =
                                                        briefing?.notice ?? "";
                                                    editNoticeDraftRef.current =
                                                        initial;
                                                    setEditNotice(initial);
                                                    setEditingNotice(true);
                                                    setNoticeEditorNonce(
                                                        (n) => n + 1,
                                                    );
                                                }}
                                                className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                                            >
                                                편집
                                            </button>
                                        )}
                                    </div>
                                    <div className="p-4 space-y-3">
                                        {!editingNotice ? (
                                            noticeHtmlHasText(briefing?.notice) ? (
                                                <SectionHtmlReadView
                                                    html={briefing!.notice!}
                                                    theme="notice"
                                                />
                                            ) : (
                                                <p className="text-[13px] text-stone-400">
                                                    이번 주 전달사항이 없어요
                                                </p>
                                            )
                                        ) : (
                                            <TiptapNoticeEditor
                                                key={`notice-${wOff}-${noticeEditorNonce}`}
                                                content={editNotice}
                                                onChange={onNoticeHtmlChange}
                                                editable={isLeader}
                                                showToolbar={isLeader}
                                            />
                                        )}
                                        {editingNotice && isLeader && (
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        void saveNotice();
                                                    }}
                                                    disabled={savingNotice}
                                                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                                >
                                                    {savingNotice
                                                        ? "저장 중…"
                                                        : "저장하기"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const restored =
                                                            briefing?.notice ??
                                                            "";
                                                        editNoticeDraftRef.current =
                                                            restored;
                                                        setEditingNotice(false);
                                                        setEditNotice(restored);
                                                        setNoticeEditorNonce(
                                                            (n) => n + 1,
                                                        );
                                                    }}
                                                    className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 주간 브리핑 */}
                            {mode === "weekly" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                                주간 브리핑
                                            </p>
                                            {isEditedBriefing && (
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                                                    편집됨
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {!editAllowed && (
                                                <span className="text-[13px] text-stone-400">
                                                    {isGuest
                                                        ? "✏️ 게스트는 편집할 수 없어요"
                                                        : "✏️ 브리핑 편집은 매주 목요일에만 가능합니다"}
                                                </span>
                                            )}
                                            {!isGuest && !editing && isEditedBriefing && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void restoreAutoBriefing()
                                                    }
                                                    disabled={saving}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                                                >
                                                    복원
                                                </button>
                                            )}
                                            {editAllowed && !editing && (
                                                <button
                                                    type="button"
                                                    onClick={startEditing}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                                                >
                                                    편집
                                                </button>
                                            )}
                                            {editAllowed && editing && (
                                                <button
                                                    type="button"
                                                    onClick={cancelEditing}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 text-stone-600 hover:bg-stone-50"
                                                >
                                                    취소
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-5">
                                        {/* 프로젝트 */}
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-sm font-bold text-stone-600">
                                                    [ 프로젝트 ]
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void copyBriefingMarkdown(
                                                            editing
                                                                ? editProject
                                                                : displayProjectHtml,
                                                            setCopiedProject,
                                                        )
                                                    }
                                                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all
                              ${copiedProject ? "bg-green-500 text-white" : "bg-stone-800 text-white"}`}
                                                >
                                                    {copiedProject
                                                        ? "Copied!"
                                                        : "Copy"}
                                                </button>
                                            </div>
                                            {editing ? (
                                                <TiptapSectionEditor
                                                    key={`briefing-project-${wOff}-${briefingEditorKey}`}
                                                    content={editProject}
                                                    onChange={setEditProject}
                                                    editable
                                                    showToolbar
                                                    placeholder="프로젝트 브리핑을 입력하세요..."
                                                />
                                            ) : (
                                                <BriefingSavedHtmlPreview
                                                    html={displayProjectHtml}
                                                />
                                            )}
                                        </div>
                                        {/* 유지보수 */}
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-sm font-bold text-stone-600">
                                                    [ 유지보수 ]
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void copyBriefingMarkdown(
                                                            editing
                                                                ? editMaintenance
                                                                : displayMaintenanceHtml,
                                                            setCopiedMaintenance,
                                                        )
                                                    }
                                                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all
                              ${copiedMaintenance ? "bg-green-500 text-white" : "bg-stone-800 text-white"}`}
                                                >
                                                    {copiedMaintenance
                                                        ? "Copied!"
                                                        : "Copy"}
                                                </button>
                                            </div>
                                            {editing ? (
                                                <TiptapSectionEditor
                                                    key={`briefing-maintenance-${wOff}-${briefingEditorKey}`}
                                                    content={editMaintenance}
                                                    onChange={setEditMaintenance}
                                                    editable
                                                    showToolbar
                                                    placeholder="유지보수 브리핑을 입력하세요..."
                                                />
                                            ) : (
                                                <BriefingSavedHtmlPreview
                                                    html={
                                                        displayMaintenanceHtml
                                                    }
                                                />
                                            )}
                                        </div>
                                        {/* 기타 */}
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-sm font-bold text-stone-600">
                                                    [ 기타 ]
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void copyBriefingMarkdown(
                                                            editing
                                                                ? editEtc
                                                                : displayEtcHtml,
                                                            setCopiedEtc,
                                                        )
                                                    }
                                                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all
                              ${copiedEtc ? "bg-green-500 text-white" : "bg-stone-800 text-white"}`}
                                                >
                                                    {copiedEtc
                                                        ? "Copied!"
                                                        : "Copy"}
                                                </button>
                                            </div>
                                            {editing ? (
                                                <TiptapSectionEditor
                                                    key={`briefing-etc-${wOff}-${briefingEditorKey}`}
                                                    content={editEtc}
                                                    onChange={setEditEtc}
                                                    editable
                                                    showToolbar
                                                    placeholder="기타 브리핑을 입력하세요..."
                                                />
                                            ) : (
                                                <BriefingSavedHtmlPreview
                                                    html={displayEtcHtml}
                                                />
                                            )}
                                        </div>
                                        {editAllowed && editing && (
                                            <div className="flex flex-col gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        void saveBriefing();
                                                    }}
                                                    className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                                >
                                                    {saving
                                                        ? "저장 중…"
                                                        : "저장하기"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 배정현황 / 배정대기 */}
                            {mode === "weekly" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                                        <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                            담당 배정
                                        </p>
                                        <button
                                            type="button"
                                            onClick={copyAssignmentsBlock}
                                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0
                        ${copiedAssign ? "bg-green-500 text-white" : "bg-stone-800 text-white"}`}
                                        >
                                            {copiedAssign ? "Copied!" : "Copy"}
                                        </button>
                                    </div>
                                    <div className="p-4 space-y-4">
                                        <div>
                                            <p className="text-sm font-extrabold text-stone-600 mb-2">
                                                [배정현황]
                                            </p>
                                            {assignActive.length === 0 ? (
                                                <p className="text-[13px] text-stone-400">
                                                    등록된 항목이 없어요
                                                </p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {assignActive.map((a) => (
                                                        <li
                                                            key={a.id}
                                                            className="text-[13px] text-stone-800"
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <span className="flex-1 min-w-0 leading-relaxed break-words">
                                                                    <span className="font-extrabold text-stone-700">
                                                                        ⇒ [{a.type}]
                                                                    </span>{" "}
                                                                    {a.url ? (
                                                                        <a
                                                                            href={
                                                                                a.url
                                                                            }
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-amber-600 hover:underline font-medium"
                                                                            aria-label={`${a.name} 관련 링크 새 창으로 열림`}
                                                                        >
                                                                            {a.name}
                                                                        </a>
                                                                    ) : (
                                                                        a.name
                                                                    )}
                                                                    {" : "}
                                                                    {(
                                                                        a.members ||
                                                                        []
                                                                    ).join(", ")}
                                                                </span>
                                                                {isLeader && (
                                                                    <span className="flex shrink-0 gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                openEditAssignment(
                                                                                    a,
                                                                                )
                                                                            }
                                                                            className="text-xs text-stone-400 hover:text-amber-600"
                                                                        >
                                                                            수정
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void deleteAssignment(
                                                                                    a.id,
                                                                                )
                                                                            }
                                                                            className="text-xs text-stone-400 hover:text-red-500"
                                                                        >
                                                                            삭제
                                                                        </button>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {a.period_note
                                                                ? a.period_note
                                                                      .split(
                                                                          "\n",
                                                                      )
                                                                      .map(
                                                                          (
                                                                              line,
                                                                              i,
                                                                          ) =>
                                                                              line.trim() ? (
                                                                                  <p
                                                                                      key={
                                                                                          i
                                                                                      }
                                                                                      className="mt-1 pl-3 text-[13px] text-stone-500"
                                                                                  >
                                                                                      •{" "}
                                                                                      {line.trim()}
                                                                                  </p>
                                                                              ) : null,
                                                                      )
                                                                : null}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-extrabold text-stone-600 mb-2">
                                                [배정대기]
                                            </p>
                                            {assignWaiting.length === 0 ? (
                                                <p className="text-[13px] text-stone-400">
                                                    등록된 항목이 없어요
                                                </p>
                                            ) : (
                                                <ul className="space-y-3">
                                                    {assignWaiting.map((a) => (
                                                        <li
                                                            key={a.id}
                                                            className="text-[13px] text-stone-800"
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <span className="flex-1 min-w-0 leading-relaxed break-words">
                                                                    <span className="font-extrabold text-stone-700">
                                                                        ⇒
                                                                        [배정대기]
                                                                    </span>{" "}
                                                                    {a.url ? (
                                                                        <a
                                                                            href={
                                                                                a.url
                                                                            }
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-amber-600 hover:underline font-medium"
                                                                            aria-label={`${a.name} 관련 링크 새 창으로 열림`}
                                                                        >
                                                                            {
                                                                                a.name
                                                                            }
                                                                        </a>
                                                                    ) : (
                                                                        a.name
                                                                    )}
                                                                </span>
                                                                {isLeader && (
                                                                    <span className="flex shrink-0 gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                openEditAssignment(
                                                                                    a,
                                                                                )
                                                                            }
                                                                            className="text-xs text-stone-400 hover:text-amber-600"
                                                                        >
                                                                            수정
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void deleteAssignment(
                                                                                    a.id,
                                                                                )
                                                                            }
                                                                            className="text-xs text-stone-400 hover:text-red-500"
                                                                        >
                                                                            삭제
                                                                        </button>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {a.period_note
                                                                ? a.period_note
                                                                      .split(
                                                                          "\n",
                                                                      )
                                                                      .map(
                                                                          (
                                                                              line,
                                                                              i,
                                                                          ) =>
                                                                              line.trim() ? (
                                                                                  <p
                                                                                      key={
                                                                                          i
                                                                                      }
                                                                                      className="mt-1 pl-3 text-[13px] text-stone-500"
                                                                                  >
                                                                                      •{" "}
                                                                                      {line.trim()}
                                                                                  </p>
                                                                              ) : null,
                                                                      )
                                                                : null}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        {isLeader && (
                                            <button
                                                type="button"
                                                onClick={openAddAssignment}
                                                className="w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-xs font-medium text-stone-500 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50/50"
                                            >
                                                + 항목 추가
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 팀원별 상세 (아코디언) */}
                            <div>
                                <p className="text-sm font-bold text-stone-400 uppercase tracking-wide mb-2">
                                    팀원별 상세
                                </p>
                                {MEMBERS.map((m) => {
                                    const mt = curTasks.filter(
                                        (t) => t.member === m,
                                    );
                                    if (!mt.length) return null;
                                    const isExp = expanded[m];
                                    return (
                                        <div
                                            key={m}
                                            className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-2"
                                        >
                                            {/* 헤더 */}
                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(m)}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                                            >
                                                <div className="relative shrink-0">
                                                    <Avatar
                                                        name={m}
                                                        size={28}
                                                    />
                                                    {m === LEADER && (
                                                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs">
                                                            👑
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm font-bold text-stone-800">
                                                            {m}
                                                        </span>
                                                        {m === LEADER && (
                                                            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium border border-yellow-200">
                                                                리더
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[13px] text-stone-400">
                                                        {mt.length}건 ·{" "}
                                                        {
                                                            mt.filter(
                                                                (t) =>
                                                                    t.status ===
                                                                    "완료",
                                                            ).length
                                                        }
                                                        건 완료
                                                    </p>
                                                </div>
                                                {isExp ? (
                                                    <i
                                                        className="ri-arrow-up-s-line text-stone-400"
                                                        aria-hidden
                                                    />
                                                ) : (
                                                    <i
                                                        className="ri-arrow-down-s-line text-stone-400"
                                                        aria-hidden
                                                    />
                                                )}
                                            </button>

                                            {/* 상세 */}
                                            {isExp &&
                                                mt.map((t) => (
                                                    <div
                                                        key={t.id}
                                                        className={`flex items-start gap-2 px-4 py-2.5 border-t border-stone-100
                            ${t.priority === "긴급" || t.status === "이슈 및 대기" ? "bg-amber-50" : ""}`}
                                                    >
                                                        {t.is_starred && (
                                                            <span
                                                                className="text-xs shrink-0 mt-1"
                                                                title="핵심 프로젝트"
                                                            >
                                                                ⭐
                                                            </span>
                                                        )}
                                                        <span
                                                            className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 mt-0.5 ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}
                                                        >
                                                            {t.status}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-bold text-stone-800">
                                                                {t.proj}
                                                            </p>
                                                            {t.content && (
                                                                <p className="text-[13px] text-stone-400 truncate">
                                                                    {t.content}
                                                                </p>
                                                            )}
                                                            {t.issue && (
                                                                <div className="text-[13px] bg-amber-100 text-amber-700 px-2 py-1 rounded mt-1">
                                                                    이슈:{" "}
                                                                    {t.issue}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-[13px] font-bold text-amber-600 shrink-0">
                                                            {fmtMin(t.workload)}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {showAssignModal && (
                    <div
                        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40"
                        onClick={closeAssignModal}
                        role="presentation"
                    >
                        <div
                            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-base font-bold text-stone-900">
                                    {editAssignment
                                        ? "배정 항목 수정"
                                        : "배정 항목 추가"}
                                </h2>
                                <button
                                    type="button"
                                    onClick={closeAssignModal}
                                    className="text-2xl leading-none text-stone-400"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        구분
                                    </label>
                                    <Select
                                        options={[
                                            "프로젝트",
                                            "개편",
                                            "고도화",
                                            "유지보수",
                                            "기타",
                                        ].map((t) => ({ value: t, label: t }))}
                                        value={
                                            assignForm.type
                                                ? {
                                                      value: assignForm.type,
                                                      label: assignForm.type,
                                                  }
                                                : null
                                        }
                                        onChange={(opt) =>
                                            setAssignForm((f) => ({
                                                ...f,
                                                type: opt?.value ?? "",
                                            }))
                                        }
                                        isSearchable={false}
                                        isClearable={false}
                                        styles={modalFormSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        표시할 목록
                                    </label>
                                    <Select
                                        options={[
                                            {
                                                value: "진행중",
                                                label: "배정현황 (진행 중 배정)",
                                            },
                                            {
                                                value: "배정대기",
                                                label: "배정대기",
                                            },
                                        ]}
                                        value={{
                                            value: assignForm.status,
                                            label:
                                                assignForm.status === "진행중"
                                                    ? "배정현황 (진행 중 배정)"
                                                    : "배정대기",
                                        }}
                                        onChange={(opt) => {
                                            if (!opt) return;
                                            setAssignForm((f) => ({
                                                ...f,
                                                status: opt.value as
                                                    | "진행중"
                                                    | "배정대기",
                                            }));
                                        }}
                                        isSearchable={false}
                                        isClearable={false}
                                        styles={modalFormSelectStyles}
                                        menuPortalTarget={
                                            typeof document !== "undefined"
                                                ? document.body
                                                : null
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        프로젝트명 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                        value={assignForm.name}
                                        onChange={(e) =>
                                            setAssignForm((f) => ({
                                                ...f,
                                                name: e.target.value,
                                            }))
                                        }
                                        placeholder="예) LH사이버견본주택"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-xs font-medium text-stone-500">
                                        담당자
                                    </label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {MEMBERS.map((name) => {
                                            const on =
                                                assignForm.members.includes(
                                                    name,
                                                );
                                            return (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() =>
                                                        toggleAssignMember(name)
                                                    }
                                                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-all
                            ${on ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
                                                >
                                                    <Avatar
                                                        name={name}
                                                        size={32}
                                                    />
                                                    <span className="text-xs font-medium text-stone-600">
                                                        {name.slice(1)}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        <button
                                            type="button"
                                            onClick={toggleOtherMember}
                                            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 transition-all min-h-[72px]
                            ${showOtherInput ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
                                        >
                                            <span className="text-xs font-semibold text-stone-700">
                                                기타
                                            </span>
                                        </button>
                                    </div>
                                    {showOtherInput && (
                                        <input
                                            type="text"
                                            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                            value={otherMember}
                                            onChange={(e) =>
                                                setOtherMember(e.target.value)
                                            }
                                            placeholder="예) 김철수, 김영희"
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        URL
                                    </label>
                                    <input
                                        className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                        value={assignForm.url}
                                        onChange={(e) =>
                                            setAssignForm((f) => ({
                                                ...f,
                                                url: e.target.value,
                                            }))
                                        }
                                        placeholder="https://..."
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        메모
                                    </label>
                                    <textarea
                                        className="min-h-[88px] w-full resize-y rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                                        value={assignForm.period_note}
                                        onChange={(e) =>
                                            setAssignForm((f) => ({
                                                ...f,
                                                period_note: e.target.value,
                                            }))
                                        }
                                        placeholder="예) 사업기간: 2026년 5월~12월"
                                        spellCheck={false}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void saveAssignment()}
                                    className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600"
                                >
                                    {editAssignment ? "저장하기" : "추가하기"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
