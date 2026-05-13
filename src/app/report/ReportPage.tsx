"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

/** 보기 모드: 자동문을 에디터와 같은 타이포로 렌더 (읽기 전용) */
function BriefingAutoPreview({ plain }: { plain: string }) {
    const html = plain.trim() ? plainBriefingToInitialHtml(plain) : "<p></p>";
    return (
        <div className="notice-editor min-h-[2.5rem] overflow-x-auto rounded-lg border border-stone-200 bg-stone-50">
            <div
                className="ProseMirror tiptap min-h-[2.5rem] px-3 py-3 text-stone-700"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
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

        const highlight = groupTasks.some(
            (t) => t.priority === "긴급" || t.status === "이슈 및 대기",
        );
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
                        ? `⚠️ @${t.member} · 이슈: ${issueText} — ${t.status}`
                        : `⚠️ 이슈: ${issueText} — ${t.status}`,
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
            const raw = (t.content || "").trim();
            if (raw) {
                bodyLines.push(`⇒ **[작업 계획]** ${dateStr}${raw}`);
            }
        }

        const blockParts = [titleLine, "", ...bodyLines];
        const block = blockParts.join("\n").replace(/\n+$/, "");
        blocks.push(block);
    }

    return blocks.join("\n\n").trimEnd();
}

function canEdit(isLocked: boolean): boolean {
    if (isLocked) return false;
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    if (day === 3 && hour < 10) return false;
    return true;
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
    const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
    const [wOff, setWOff] = useState(0);
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
    const [editNotice, setEditNotice] = useState("");
    const [editingNotice, setEditingNotice] = useState(false);
    const [savingNotice, setSavingNotice] = useState(false);
    const [noticeEditorNonce, setNoticeEditorNonce] = useState(0);
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

    const wk = getWeekWin(wOff);
    const mn = getMonthWin(mOff);

    const loadBriefing = useCallback(async () => {
        const weekStart = getWeekWin(wOff).from;
        const { data, error } = await supabase
            .from("briefings")
            .select(
                "project, maintenance, etc, notice, is_locked, edited_by, updated_at",
            )
            .eq("week_start", weekStart)
            .maybeSingle();

        if (error) {
            return;
        }

        if (data && noticeHtmlHasText(data.notice)) {
            setBriefing({
                project: data.project ?? "",
                maintenance: data.maintenance ?? "",
                etc: data.etc ?? "",
                notice: data.notice ?? null,
                is_locked: data.is_locked ?? false,
                edited_by: data.edited_by ?? null,
                updated_at: data.updated_at ?? null,
            });
            return;
        }

        const prevWeekStart = getWeekWin(wOff - 1).from;
        const { data: prevData } = await supabase
            .from("briefings")
            .select("notice")
            .eq("week_start", prevWeekStart)
            .maybeSingle();

        const rawPrev = prevData?.notice ?? null;
        const carriedNotice = noticeHtmlHasText(rawPrev) ? rawPrev : null;

        if (data) {
            setBriefing({
                project: data.project ?? "",
                maintenance: data.maintenance ?? "",
                etc: data.etc ?? "",
                notice: carriedNotice,
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
            is_locked: false,
            edited_by: null,
            updated_at: null,
        });
    }, [wOff]);

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

    useEffect(() => {
        async function loadTasks() {
            setLoading(true);
            const { data } = await supabase
                .from("tasks")
                .select("*")
                .order("created_at", { ascending: false });
            setTasks(data || []);
            setLoading(false);
        }
        void loadTasks();
    }, []);

    useEffect(() => {
        setEditing(false);
        setEditingNotice(false);
        setNoticeEditorNonce((n) => n + 1);
        setBriefingEditorKey((k) => k + 1);
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

    const isBriefingLocked = briefing?.is_locked === true;

    const editAllowed = canEdit(isBriefingLocked);

    function startEditing() {
        setEditProject(plainBriefingToInitialHtml(autoProject));
        setEditMaintenance(plainBriefingToInitialHtml(autoMaintenance));
        setEditEtc(plainBriefingToInitialHtml(autoEtc));
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

    async function saveBriefing() {
        setSaving(true);
        const weekStart = wk.from;
        const { error } = await supabase.from("briefings").upsert(
            {
                week_start: weekStart,
                project: editProject,
                maintenance: editMaintenance,
                etc: editEtc,
                notice: briefing?.notice ?? null,
                is_locked: briefing?.is_locked ?? false,
                edited_by: currentMember ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "week_start" },
        );
        setSaving(false);
        if (error) {
            console.error(error);
            alert("저장에 실패했어요: " + error.message);
            return;
        }
        setEditing(false);
        await loadBriefing();
    }

    async function saveNotice() {
        setSavingNotice(true);
        const weekStart = wk.from;
        const { error } = await supabase.from("briefings").upsert(
            {
                week_start: weekStart,
                project: briefing?.project ?? "",
                maintenance: briefing?.maintenance ?? "",
                etc: briefing?.etc ?? "",
                notice: noticeHtmlHasText(editNotice)
                    ? editNotice.trim()
                    : null,
                is_locked: briefing?.is_locked ?? false,
                edited_by: currentMember ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "week_start" },
        );
        setSavingNotice(false);
        if (error) {
            console.error(error);
            alert("저장에 실패했어요: " + error.message);
            return;
        }
        setEditingNotice(false);
        setNoticeEditorNonce((n) => n + 1);
        await loadBriefing();
    }

    async function toggleLock() {
        const newLocked = !briefing?.is_locked;
        const weekStart = wk.from;
        const { error } = await supabase.from("briefings").upsert(
            {
                week_start: weekStart,
                project: briefing?.project ?? "",
                maintenance: briefing?.maintenance ?? "",
                etc: briefing?.etc ?? "",
                notice: briefing?.notice ?? null,
                is_locked: newLocked,
                edited_by: currentMember ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "week_start" },
        );
        if (error) {
            alert("잠금 상태 변경 실패: " + error.message);
            return;
        }
        setEditing(false);
        await loadBriefing();
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
                            {mode === "weekly" && (
                                <p className="text-xs text-stone-400 mt-0.5">
                                    매주 수요일 자동 취합
                                </p>
                            )}
                        </div>
                        <button
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
                                        <div className="text-xs text-stone-400 mt-0.5">
                                            {s.l}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 주간 전달사항 */}
                            {mode === "weekly" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
                                        <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                                            주간 전달사항
                                        </p>
                                        {isLeader && !editingNotice && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditNotice(
                                                        briefing?.notice ?? "",
                                                    );
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
                                        {!editingNotice &&
                                        !noticeHtmlHasText(briefing?.notice) ? (
                                            <p className="text-xs text-stone-400">
                                                이번 주 전달사항이 없어요
                                            </p>
                                        ) : (
                                            <TiptapNoticeEditor
                                                key={`notice-${wOff}-${noticeEditorNonce}`}
                                                content={
                                                    editingNotice
                                                        ? editNotice
                                                        : briefing?.notice ?? ""
                                                }
                                                onChange={setEditNotice}
                                                editable={
                                                    editingNotice && isLeader
                                                }
                                                showToolbar={
                                                    editingNotice && isLeader
                                                }
                                            />
                                        )}
                                        {editingNotice && isLeader && (
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void saveNotice()
                                                    }
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
                                                        setEditingNotice(false);
                                                        setEditNotice(
                                                            briefing?.notice ??
                                                                "",
                                                        );
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
                                        <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                                            주간 브리핑
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {isLeader && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void toggleLock()
                                                    }
                                                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${
                                                        isBriefingLocked
                                                            ? "border-stone-300 bg-stone-100 text-stone-600"
                                                            : "border-amber-200 bg-amber-50 text-amber-700"
                                                    }`}
                                                >
                                                    {isBriefingLocked
                                                        ? "🔒 잠금됨"
                                                        : "🔓 잠금"}
                                                </button>
                                            )}
                                            {!editAllowed && (
                                                <span className="text-xs text-stone-400">
                                                    {isBriefingLocked
                                                        ? "🔒 관리자가 브리핑을 잠금했어요"
                                                        : "✏️ 수요일 오전 10시 이후 편집 가능해요"}
                                                </span>
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
                                    {briefing !== null && (
                                        <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/80">
                                            <p className="text-xs text-stone-500">
                                                마지막 저장:{" "}
                                                {briefing.edited_by ?? "—"} ·{" "}
                                                {briefing.updated_at
                                                    ? new Date(
                                                          briefing.updated_at,
                                                      ).toLocaleString(
                                                          "ko-KR",
                                                          {
                                                              dateStyle:
                                                                  "short",
                                                              timeStyle:
                                                                  "short",
                                                          },
                                                      )
                                                    : "—"}
                                            </p>
                                        </div>
                                    )}
                                    <div className="p-4 space-y-5">
                                        {/* 프로젝트 */}
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-stone-600">
                                                    [ 프로젝트 ]
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void copyBriefingRichToClipboard(
                                                            editing
                                                                ? editProject
                                                                : plainBriefingToInitialHtml(
                                                                      autoProject,
                                                                  ),
                                                            editing
                                                                ? htmlToPlainText(
                                                                      editProject,
                                                                  )
                                                                : autoProject,
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
                                                <>
                                                    <TiptapSectionEditor
                                                        key={`briefing-project-${wOff}-${briefingEditorKey}`}
                                                        content={editProject}
                                                        onChange={
                                                            setEditProject
                                                        }
                                                        editable
                                                        showToolbar
                                                        placeholder="프로젝트 브리핑을 입력하세요..."
                                                    />
                                                    {editAllowed && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                restoreBriefingSection(
                                                                    "project",
                                                                )
                                                            }
                                                            className="mt-2 w-full rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            이 섹션 자동
                                                            생성으로 복원
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <BriefingAutoPreview
                                                    plain={autoProject}
                                                />
                                            )}
                                        </div>
                                        {/* 유지보수 */}
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-stone-600">
                                                    [ 유지보수 ]
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void copyBriefingRichToClipboard(
                                                            editing
                                                                ? editMaintenance
                                                                : plainBriefingToInitialHtml(
                                                                      autoMaintenance,
                                                                  ),
                                                            editing
                                                                ? htmlToPlainText(
                                                                      editMaintenance,
                                                                  )
                                                                : autoMaintenance,
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
                                                <>
                                                    <TiptapSectionEditor
                                                        key={`briefing-maintenance-${wOff}-${briefingEditorKey}`}
                                                        content={
                                                            editMaintenance
                                                        }
                                                        onChange={
                                                            setEditMaintenance
                                                        }
                                                        editable
                                                        showToolbar
                                                        placeholder="유지보수 브리핑을 입력하세요..."
                                                    />
                                                    {editAllowed && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                restoreBriefingSection(
                                                                    "maintenance",
                                                                )
                                                            }
                                                            className="mt-2 w-full rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            이 섹션 자동
                                                            생성으로 복원
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <BriefingAutoPreview
                                                    plain={autoMaintenance}
                                                />
                                            )}
                                        </div>
                                        {/* 기타 */}
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-stone-600">
                                                    [ 기타 ]
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void copyBriefingRichToClipboard(
                                                            editing
                                                                ? editEtc
                                                                : plainBriefingToInitialHtml(
                                                                      autoEtc,
                                                                  ),
                                                            editing
                                                                ? htmlToPlainText(
                                                                      editEtc,
                                                                  )
                                                                : autoEtc,
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
                                                <>
                                                    <TiptapSectionEditor
                                                        key={`briefing-etc-${wOff}-${briefingEditorKey}`}
                                                        content={editEtc}
                                                        onChange={setEditEtc}
                                                        editable
                                                        showToolbar
                                                        placeholder="기타 브리핑을 입력하세요..."
                                                    />
                                                    {editAllowed && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                restoreBriefingSection(
                                                                    "etc",
                                                                )
                                                            }
                                                            className="mt-2 w-full rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
                                                        >
                                                            이 섹션 자동
                                                            생성으로 복원
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <BriefingAutoPreview
                                                    plain={autoEtc}
                                                />
                                            )}
                                        </div>
                                        {editAllowed && editing && (
                                            <div className="flex flex-col gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={() =>
                                                        void saveBriefing()
                                                    }
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
                                        <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
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
                                            <p className="text-xs font-extrabold text-stone-600 mb-2">
                                                [배정현황]
                                            </p>
                                            {assignActive.length === 0 ? (
                                                <p className="text-xs text-stone-400">
                                                    등록된 항목이 없어요
                                                </p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {assignActive.map((a) => (
                                                        <li
                                                            key={a.id}
                                                            className="flex items-start gap-3 text-xs text-stone-800"
                                                        >
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
                                                                        className="text-[11px] text-stone-400 hover:text-amber-600"
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
                                                                        className="text-[11px] text-stone-400 hover:text-red-500"
                                                                    >
                                                                        삭제
                                                                    </button>
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-extrabold text-stone-600 mb-2">
                                                [배정대기]
                                            </p>
                                            {assignWaiting.length === 0 ? (
                                                <p className="text-xs text-stone-400">
                                                    등록된 항목이 없어요
                                                </p>
                                            ) : (
                                                <ul className="space-y-3">
                                                    {assignWaiting.map((a) => (
                                                        <li
                                                            key={a.id}
                                                            className="text-xs text-stone-800"
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
                                                                            className="text-[11px] text-stone-400 hover:text-amber-600"
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
                                                                            className="text-[11px] text-stone-400 hover:text-red-500"
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
                                                                                      className="mt-1 pl-3 text-[11px] text-stone-500"
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
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
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
                                                    <p className="text-xs text-stone-400">
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
                                                        {(t.priority ===
                                                            "긴급" ||
                                                            t.status ===
                                                                "이슈 및 대기") && (
                                                            <span className="text-xs shrink-0 mt-1">
                                                                ⭐
                                                            </span>
                                                        )}
                                                        <span
                                                            className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 mt-0.5 ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}
                                                        >
                                                            {t.status}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-stone-800">
                                                                {t.proj}
                                                            </p>
                                                            {t.content && (
                                                                <p className="text-xs text-stone-400 truncate">
                                                                    {t.content}
                                                                </p>
                                                            )}
                                                            {t.issue && (
                                                                <div className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded mt-1">
                                                                    이슈:{" "}
                                                                    {t.issue}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-xs font-bold text-amber-600 shrink-0">
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
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none rounded-lg border border-stone-200 bg-white py-2.5 pl-3 pr-10 text-sm"
                                            value={assignForm.type}
                                            onChange={(e) =>
                                                setAssignForm((f) => ({
                                                    ...f,
                                                    type: e.target.value,
                                                }))
                                            }
                                        >
                                            {[
                                                "프로젝트",
                                                "개편",
                                                "고도화",
                                                "유지보수",
                                                "기타",
                                            ].map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                        <i className="ri-arrow-down-s-line pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        표시할 목록
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none rounded-lg border border-stone-200 bg-white py-2.5 pl-3 pr-10 text-sm"
                                            value={assignForm.status}
                                            onChange={(e) =>
                                                setAssignForm((f) => ({
                                                    ...f,
                                                    status: e.target.value as
                                                        | "진행중"
                                                        | "배정대기",
                                                }))
                                            }
                                        >
                                            <option value="진행중">
                                                배정현황 (진행 중 배정)
                                            </option>
                                            <option value="배정대기">
                                                배정대기
                                            </option>
                                        </select>
                                        <i className="ri-arrow-down-s-line pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                        프로젝트명
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
                                                    <span className="text-[10px] font-medium text-stone-600">
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
                                        URL (선택)
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
                                {assignForm.status === "배정대기" && (
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-stone-500">
                                            사업기간 메모 (선택)
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
                                )}
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
