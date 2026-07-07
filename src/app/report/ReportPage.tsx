"use client";

import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import UserMenu from "@/components/UserMenu";
import Avatar from "@/components/Avatar";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import AgentButton from "@/components/AgentButton";
import NotificationButton from "@/components/NotificationButton";
import { useAuth } from "@/components/AuthProvider";
import { PageSpinner } from "@/components/Spinner";
import type { Task } from "@/lib/types";
import { MEMBERS, TEAM_ID, normalizeStatus } from "@/lib/constants";
import { toLocalYmd } from "@/lib/toLocalYmd";
import TiptapSectionEditor from "@/components/TiptapSectionEditor";
import Tooltip from "@/components/Tooltip";
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

/** 이스케이프된 브리핑 조각에서 `**굵게**` → `<strong>` (자동문만 사용) */
function briefingEscapedToHtmlWithBold(escapedWithBr: string): string {
    return escapedWithBr.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
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

/** HTML → 마크다운 변환 (Copy 버튼용) */
function htmlToMarkdown(html: string): string {
    if (!html?.trim()) return "";
    return html
        // 노션 붙여넣기 시 마크다운 기호(**, *)가 그대로 노출되어 굵게/기울임 표시는 제거하고 텍스트만 유지
        .replace(/<strong>([\s\S]*?)<\/strong>/gi, "$1")
        .replace(/<em>([\s\S]*?)<\/em>/gi, "$1")
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

/** 브리핑 편집 허용 윈도우: 목요일 00:00 ~ 18:00 (KST 가정). */
function isEditableWindow(now: Date = new Date()): boolean {
    const day = now.getDay();
    const hour = now.getHours();
    if (day === 4 && hour < 18) return true; // 목 00:00~17:59
    return false;
}

function getWeekWin(offset: number) {
    const now = new Date();
    // 목~목 한 주: 주 시작은 목요일, 끝은 다음 목요일(끝 포함).
    const y = now.getFullYear();
    const mon = now.getMonth();
    const dom = now.getDate();
    const dow = now.getDay();
    const daysFromWeekStart = (dow - 4 + 7) % 7;
    const thu = new Date(y, mon, dom - daysFromWeekStart + offset * 7);
    thu.setHours(0, 0, 0, 0);
    const nextThu = new Date(
        thu.getFullYear(),
        thu.getMonth(),
        thu.getDate() + 7,
        23,
        59,
        59,
        999,
    );

    const fmt = (d: Date) =>
        `${d.getMonth() + 1}/${d.getDate()}(${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})`;
    return {
        from: toLocalYmd(thu),
        to: toLocalYmd(nextThu),
        label: `${fmt(thu)} ~ ${fmt(nextThu)}`,
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

type BriefingRow = {
    project: string;
    maintenance: string;
    etc: string;
    /** Tiptap 저장 HTML */
    notice: string | null;
    checklist: string | null;
    okr: string | null;
    /** 상태별 아코디언 브리핑 (Tiptap HTML) */
    in_progress: string | null;
    waiting: string | null;
    not_started: string | null;
    delayed: string | null;
    done: string | null;
    is_locked: boolean;
    edited_by: string | null;
    updated_at: string | null;
};

/** 상태별 주간 브리핑 아코디언 정의 (status → briefings 컬럼) */
type StatusBriefCol =
    | "in_progress"
    | "waiting"
    | "not_started"
    | "delayed"
    | "done";
const STATUS_BRIEF_GROUPS: {
    key: string;
    emoji: string;
    col: StatusBriefCol;
}[] = [
    { key: "진행중", emoji: "🔵", col: "in_progress" },
    { key: "시작 전", emoji: "⚪", col: "not_started" },
    { key: "대기", emoji: "🟡", col: "waiting" },
    { key: "지연/보류", emoji: "🔴", col: "delayed" },
    { key: "완료", emoji: "✅", col: "done" },
];

/** 구분(업무 유형)별 카드 정렬 순서 (목록에 없는 타입은 "기타"로 묶어 맨 뒤) */
const TYPE_SORT_ORDER = [
    "프로젝트",
    "유지보수",
    "접근성",
    "고도화",
    "업무지원",
];

/** 카드 헤더 [타입] 인라인 텍스트 색상 (타입별) */
// 업무(tasks) 페이지 TYPE_COLORS와 동일 팔레트로 통일 (text 색만 사용)
const TYPE_TEXT_COLOR: Record<string, string> = {
    프로젝트: "text-violet-700",
    유지보수: "text-red-700",
    고도화: "text-green-700",
    접근성: "text-sky-700",
    업무지원: "text-blue-700",
};

/** 담당 배정 "구분" 배지 색상 (bg+text). 구분: 프로젝트/개편/고도화/유지보수/기타 */
const ASSIGN_TYPE_BADGE: Record<string, string> = {
    프로젝트: "bg-violet-100 text-violet-700",
    개편: "bg-sky-100 text-sky-700",
    고도화: "bg-green-100 text-green-700",
    유지보수: "bg-red-100 text-red-700",
    기타: "bg-stone-100 text-stone-500",
};

/** 담당 배정 정렬 순서 (구분별로 같은 종류끼리 모음) */
const ASSIGN_TYPE_ORDER = ["프로젝트", "개편", "고도화", "유지보수", "기타"];
function assignTypeRank(type: string): number {
    const i = ASSIGN_TYPE_ORDER.indexOf(type);
    return i === -1 ? ASSIGN_TYPE_ORDER.length : i; // 목록에 없으면 맨 뒤
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * tasks.content(plain text) → 카드 Tiptap 에디터 초기 HTML.
 * 첫 줄: "⇒ 내용", 이후 줄: 들여쓰기(⇒ 없이 non-breaking space 2칸).
 * (ProseMirror가 선행 일반 공백은 접으므로   사용)
 */
/** 계획 항목 기간 접두: "5/27~6/2 " (구 브리핑 형식, MM/DD~MM/DD) */
function planDatePrefix(t: Task): string {
    const s = t.start_date ? t.start_date.slice(5).replace("-", "/") : "";
    const e = t.end_date ? t.end_date.slice(5).replace("-", "/") : "";
    return s && e ? `${s}~${e} ` : e ? `~${e} ` : "";
}

function contentToCardHtml(t: Task): string {
    // 계획 항목(미완료)만 기간 접두 — 구 브리핑 형식과 동일
    const datePrefix =
        t.is_plan && t.status !== "완료" ? planDatePrefix(t) : "";
    const taskLines = (t.content || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const formattedLines = taskLines.map((line, index) => {
        const prefix = index === 0 ? datePrefix : "";
        return `⇒ ${prefix}${briefingEscapedToHtmlWithBold(escapeHtml(line))}`;
    });

    if (formattedLines.length > 0) {
        return `<p>${formattedLines.join("<br>")}</p>`;
    }
    if (datePrefix) {
        return `<p>⇒ ${datePrefix.trim()}</p>`;
    }
    const lines = (t.content || "").split("\n");
    const out: string[] = [];
    let firstDone = false;
    for (const raw of lines) {
        const s = raw.trim();
        if (!firstDone) {
            if (!s) continue;
            out.push(
                `⇒ ${datePrefix}${briefingEscapedToHtmlWithBold(escapeHtml(s))}`,
            );
            firstDone = true;
        } else {
            out.push(s ? `  ${briefingEscapedToHtmlWithBold(escapeHtml(s))}` : "");
        }
    }
    // 내용이 비어도 계획 기간이 있으면 한 줄 표시
    if (!firstDone && datePrefix) {
        out.push(`⇒ ${datePrefix.trim()}`);
    }
    // 이슈/비고 (구 형식: ⚠️ {이슈}) — ⇒ 보다 한 단계 안쪽으로 들여쓰기
    if (t.issue && String(t.issue).trim()) {
        out.push(
            `  ⚠️ ${briefingEscapedToHtmlWithBold(escapeHtml(String(t.issue).trim()))}`,
        );
    }
    if (!out.length) return "<p></p>";
    return `<p>${out.join("<br>")}</p>`;
}

/** 상태 우선순위 (낮을수록 활성). STATUS_BRIEF_GROUPS 순서 = 진행중 > 시작 전 > 대기 > 지연/보류 > 완료 */
function statusRank(t: Task): number {
    const i = STATUS_BRIEF_GROUPS.findIndex(
        (s) => s.key === normalizeStatus(t.status),
    );
    return i === -1 ? STATUS_BRIEF_GROUPS.length : i;
}
const DONE_RANK = STATUS_BRIEF_GROUPS.findIndex((s) => s.key === "완료");

/**
 * 같은 프로젝트 업무를 하나로 묶는다.
 * bucket = 그 프로젝트 업무들 중 가장 활성인 상태(진행중 우선). 모두 완료면 완료.
 * 업무는 활성 → 완료 순으로 정렬. 같은 상태(bucket) 안에서는 ⭐ 핵심 프로젝트를 맨 위로.
 */
function buildBriefProjects(tasks: Task[]) {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
        const arr = map.get(t.proj) ?? [];
        arr.push(t);
        map.set(t.proj, arr);
    });
    return [...map.entries()]
        .map(([proj, ts]) => {
            const sorted = [...ts].sort(
                (a, b) => statusRank(a) - statusRank(b) || a.id - b.id,
            );
            return {
                proj,
                tasks: sorted,
                bucket: Math.min(...ts.map(statusRank)),
                starred: ts.some((t) => t.is_starred),
                type: sorted[0]?.type ?? null,
                // 담당자: 중복 제거해 헤더에 한 번만 표기 (업무 등장 순서 유지)
                members: [...new Set(sorted.map((t) => t.member))],
            };
        })
        .sort(
            (a, b) =>
                a.bucket - b.bucket ||
                Number(b.starred) - Number(a.starred) ||
                a.tasks[0].id - b.tasks[0].id,
        );
}
type BriefProject = ReturnType<typeof buildBriefProjects>[number];

/** 활성 프로젝트 카드 안에서 완료 업무를 "완료"로 표시할지 (프로젝트 전체가 완료면 굳이 표시 안 함) */
function isDoneTagged(p: BriefProject, t: Task): boolean {
    return normalizeStatus(t.status) === "완료" && p.bucket !== DONE_RANK;
}

/**
 * 병합된 프로젝트 복사 텍스트:
 *   [타입] 프로젝트명 @담당자
 *   ⇒ 내용
 *   ⇒ 내용 — 완료
 */
function projectCopyText(p: BriefProject, htmlFor: (t: Task) => string): string {
    const members = p.members.join(", ");
    const head = `${p.starred ? "⭐ " : ""}${p.type ? `[${p.type}] ` : ""}${p.proj}${members ? ` @${members}` : ""}`;
    const blocks = p.tasks
        .map((t) => {
            const body = htmlToMarkdown(htmlFor(t)).replace(/^ +/gm, (m) =>
                " ".repeat(m.length),
            );
            const done = isDoneTagged(p, t) ? " — 완료" : "";
            if (!body) return done ? `⇒ 완료` : "";
            return `${body}${done}`;
        })
        .filter(Boolean);
    return [head, ...blocks].join("\n");
}

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
        lines.push("[배정현황]");
        active.forEach((a) => {
            const memberStr = (a.members || []).join(", ");
            // Notion 등에 붙일 때 프로젝트명이 하이퍼링크로 인식되도록 Markdown 링크 사용
            const namePart = a.url ? `[${a.name}](${a.url})` : a.name;
            lines.push(`⇒ [${a.type}] ${namePart} : ${memberStr}`);
        });
    }

    if (waiting.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push("[배정대기]");
        waiting.forEach((a) => {
            const namePart = a.url ? `[${a.name}](${a.url})` : a.name;
            lines.push(`⇒ [배정대기] ${namePart}`);
            if (a.period_note) {
                a.period_note.split("\n").forEach((l) => {
                    if (l.trim()) lines.push(l.trim());
                });
            }
        });
    }

    return lines.join("\n");
}

/** 담당 배정 단건 복사 텍스트 (formatAssignments와 동일 형식) */
function assignmentCopyText(a: Assignment): string {
    const namePart = a.url ? `[${a.name}](${a.url})` : a.name;
    const head =
        a.status === "배정대기"
            ? `⇒ [배정대기] ${namePart}`
            : `⇒ [${a.type}] ${namePart} : ${(a.members || []).join(", ")}`;
    const lines = [head];
    if (a.period_note) {
        a.period_note.split("\n").forEach((l) => {
            if (l.trim()) lines.push(l.trim());
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
    // 콘텐츠 탭: 현황 보드(브리핑+배정) / 공지(확인·OKR·전달사항)
    const [reportTab, setReportTab] = useState<"board" | "notice">("board");
    const [wOff, setWOff] = useState(0);
    const wOffRef = useRef(wOff);
    // 컴포넌트 인스턴스별 고유 realtime 채널 suffix (렌더 순수성 위해 useId 사용)
    const channelId = useId().replace(/[^a-zA-Z0-9]/g, "");
    const [mOff, setMOff] = useState(0);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [editMode, setEditMode] = useState(false);
    useEffect(() => {
        wOffRef.current = wOff;
        setEditMode(false);
    }, [wOff]);
    const [assignTab, setAssignTab] = useState<"active" | "waiting">("active");
    const assignTabBarRef = useRef<HTMLDivElement>(null);
    // 구분(업무 유형) 탭바 드래그 스크롤
    const briefTabBarRef = useRef<HTMLDivElement>(null);
    const briefTabDragRef = useRef({
        dragging: false,
        startX: 0,
        scrollLeft: 0,
    });

    const [briefing, setBriefing] = useState<BriefingRow | null>(null);
    const [, setEditing] = useState(false);
    const [briefingEditorKey, setBriefingEditorKey] = useState(0);
    const [saving] = useState(false);
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
    // 확인해주세요·전달사항 접이식 (기본 접힘 — 핵심인 브리핑/배정을 위에서 한눈에)
    const [checklistOpen, setChecklistOpen] = useState(false);
    const [noticeOpen, setNoticeOpen] = useState(false);
    // 담당 배정: 항목별 아코디언 펼침 상태 (관리 페이지 프로젝트와 동일 패턴)
    const [expandedAssign, setExpandedAssign] = useState<
        Record<number, boolean>
    >({});
    const [copiedAssignId, setCopiedAssignId] = useState<number | null>(null);
    // 구분(업무 유형)별 카드 "전체 복사" 표시
    const [copiedTypeGroup, setCopiedTypeGroup] = useState<string | null>(null);
    // 프로젝트 카드 단건 복사 표시 (프로젝트명)
    const [copiedProj, setCopiedProj] = useState<string | null>(null);
    // 주간 브리핑: 선택된 구분(업무 유형) 탭
    const [briefTypeTab, setBriefTypeTab] = useState<string>("프로젝트");
    // 업무별 브리핑 카드: 저장된 내용(task_id→HTML), 편집 드래프트, 저장중/복사 표시
    const [savedBriefTasks, setSavedBriefTasks] = useState<
        Record<number, string>
    >({});
    const briefTaskDraftRef = useRef<Record<number, string>>({});
    const [savingTaskId, setSavingTaskId] = useState<number | null>(null);

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

    // 최신 저장 상태를 비동기 콜백에서 참조하기 위한 ref 동기화 (렌더 중 대입 금지 → effect)
    useEffect(() => {
        savingBriefingRef.current = saving;
        savingNoticeRef.current = savingNotice;
        savingChecklistRef.current = savingChecklist;
        savingOkrRef.current = savingOkr;
    }, [saving, savingNotice, savingChecklist, savingOkr]);

    const wk = getWeekWin(wOff);
    const mn = getMonthWin(mOff);

    const loadBriefing = useCallback(async () => {
        const offsetAtStart = wOffRef.current;
        const weekStart = getWeekWin(offsetAtStart).from;
        const { data, error } = await supabase
            .from("briefings")
            .select(
                "project, maintenance, etc, notice, checklist, okr, in_progress, waiting, not_started, delayed, done, is_locked, edited_by, updated_at",
            )
            .eq("team_id", TEAM_ID)
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
                in_progress: data.in_progress ?? null,
                waiting: data.waiting ?? null,
                not_started: data.not_started ?? null,
                delayed: data.delayed ?? null,
                done: data.done ?? null,
                is_locked: data.is_locked ?? false,
                edited_by: data.edited_by ?? null,
                updated_at: data.updated_at ?? null,
            });
            return;
        }

        // 주간 기준 변경(수→목) 이후 기존 수요일 데이터도 이월 가능하도록
        // 정확한 이전 주 날짜 대신 현재 week_start 이전의 가장 최근 행을 가져온다.
        const { data: prevData } = await supabase
            .from("briefings")
            .select("notice, checklist, okr")
            .eq("team_id", TEAM_ID)
            .lt("week_start", weekStart)
            .order("week_start", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (wOffRef.current !== offsetAtStart) {
            return;
        }

        const rawPrev = prevData?.notice ?? null;
        const carriedNotice = noticeHtmlHasText(rawPrev) ? rawPrev : null;
        const rawPrevChecklist = prevData?.checklist ?? null;
        const carriedChecklist = noticeHtmlHasText(rawPrevChecklist) ? rawPrevChecklist : null;
        const rawPrevOkr = prevData?.okr ?? null;
        const carriedOkr = noticeHtmlHasText(rawPrevOkr) ? rawPrevOkr : null;

        if (data) {
            setBriefing({
                project: data.project ?? "",
                maintenance: data.maintenance ?? "",
                etc: data.etc ?? "",
                notice: carriedNotice,
                checklist: data.checklist ?? carriedChecklist,
                okr: data.okr ?? null,
                in_progress: data.in_progress ?? null,
                waiting: data.waiting ?? null,
                not_started: data.not_started ?? null,
                delayed: data.delayed ?? null,
                done: data.done ?? null,
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
            okr: carriedOkr,
            in_progress: null,
            waiting: null,
            not_started: null,
            delayed: null,
            done: null,
            is_locked: false,
            edited_by: null,
            updated_at: null,
        });
    }, []);

    const loadAssignments = useCallback(async () => {
        const { data } = await supabase
            .from("assignments")
            .select("*")
            .eq("team_id", TEAM_ID)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
        setAssignments((data as Assignment[]) || []);
    }, []);

    useEffect(() => {
        void loadAssignments();
    }, [loadAssignments]);

    useEffect(() => {
        const channel = supabase
            .channel(`assignments-rt-${channelId}`)
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
    }, [loadAssignments, channelId]);

    const loadTasks = useCallback(async () => {
        const { data } = await supabase
            .from("tasks")
            .select("*")
            .eq("team_id", TEAM_ID)
            .order("created_at", { ascending: false });
        setTasks(data || []);
    }, []);

    useEffect(() => {
        setLoading(true);
        void loadTasks().finally(() => setLoading(false));
    }, [loadTasks]);

    useEffect(() => {
        const channel = supabase
            .channel(`tasks-rt-report-${channelId}`)
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
    }, [loadTasks, channelId]);

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

    // 업무별 브리핑 카드 저장 내용 로드 (GET /api/briefing-tasks?week=week_start)
    const loadBriefingTasks = useCallback(async () => {
        const week = getWeekWin(wOffRef.current).from;
        try {
            const res = await fetch(
                `/api/briefing-tasks?week=${encodeURIComponent(week)}`,
            );
            if (!res.ok) return;
            const json = (await res.json()) as {
                tasks?: { task_id: number; edited_content: string | null }[];
            };
            if (wOffRef.current !== wOff) return; // 주차가 바뀌었으면 폐기
            const map: Record<number, string> = {};
            for (const r of json.tasks ?? []) {
                if (r.edited_content != null)
                    map[r.task_id] = r.edited_content;
            }
            setSavedBriefTasks(map);
        } catch (e) {
            console.error("[loadBriefingTasks]", e);
        }
    }, [wOff]);

    useEffect(() => {
        if (mode !== "weekly") return;
        briefTaskDraftRef.current = {};
        setSavedBriefTasks({});
        void loadBriefingTasks();
    }, [mode, wOff, loadBriefingTasks]);

    useEffect(() => {
        const channel = supabase
            .channel(`briefings-rt-${channelId}`)
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
    }, [loadBriefing, channelId]);

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

    const canOpenEdit = !isGuest && isEditableWindow();
    const editAllowed = canOpenEdit && editMode;

    /** 업무별 브리핑 카드 저장 (POST /api/briefing-tasks upsert) */
    async function saveBriefingTask(taskId: number, html: string) {
        setSavingTaskId(taskId);
        try {
            const week = wk.from;
            const content = noticeHtmlHasText(html) ? html.trim() : null;
            const res = await fetch("/api/briefing-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    week,
                    task_id: taskId,
                    edited_content: content,
                }),
            });
            if (!res.ok) {
                const j = (await res.json().catch(() => ({}))) as {
                    message?: string;
                };
                alert("저장에 실패했어요: " + (j.message ?? res.status));
                return;
            }
            setSavedBriefTasks((prev) => ({
                ...prev,
                [taskId]: content ?? "",
            }));
        } finally {
            setSavingTaskId(null);
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
                    team_id: TEAM_ID,
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
                    team_id: TEAM_ID,
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
                    team_id: TEAM_ID,
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

    function toggleExpand(member: string) {
        setExpanded((e) => ({ ...e, [member]: !e[member] }));
    }

    /** 담당 배정 항목을 아코디언 카드로 렌더 (관리 페이지 프로젝트 패턴) */
    function renderAssignCard(a: Assignment) {
        const isOpen = !!expandedAssign[a.id];
        const members = a.members ?? [];
        return (
            <div
                key={a.id}
                className="bg-white rounded-xl border border-stone-200 overflow-hidden"
            >
                <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() =>
                        setExpandedAssign((e) => ({ ...e, [a.id]: !e[a.id] }))
                    }
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedAssign((p) => ({
                                ...p,
                                [a.id]: !p[a.id],
                            }));
                        }
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50/80"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ASSIGN_TYPE_BADGE[a.type] ?? "bg-stone-100 text-stone-500"}`}
                            >
                                {a.type}
                            </span>
                            <span className="truncate text-sm font-medium text-stone-800">
                                {a.name}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {members.slice(0, 3).map((m) => (
                            <Avatar key={m} name={m} size={20} />
                        ))}
                        {isLeader && (
                            <div
                                className="flex gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Tooltip label="수정">
                                    <button
                                        type="button"
                                        onClick={() => openEditAssignment(a)}
                                        aria-label="수정"
                                        className="text-base text-stone-400 hover:text-amber-600"
                                    >
                                        <i
                                            className="ri-edit-line"
                                            aria-hidden
                                        />
                                    </button>
                                </Tooltip>
                                <Tooltip label="삭제">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void deleteAssignment(a.id)
                                        }
                                        aria-label="삭제"
                                        className="text-base text-stone-400 hover:text-red-500"
                                    >
                                        <i
                                            className="ri-delete-bin-line"
                                            aria-hidden
                                        />
                                    </button>
                                </Tooltip>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void copySection(
                                    assignmentCopyText(a),
                                    (v) =>
                                        setCopiedAssignId(v ? a.id : null),
                                );
                            }}
                            className={`shrink-0 rounded-md p-1 transition-colors ${copiedAssignId === a.id ? "text-green-600" : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"}`}
                            title={copiedAssignId === a.id ? "복사됨" : "복사"}
                            aria-label="복사"
                        >
                            <i
                                className={`text-base ${copiedAssignId === a.id ? "ri-check-line" : "ri-file-copy-line"}`}
                                aria-hidden
                            />
                        </button>
                        <i
                            className={`${isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-stone-400`}
                            aria-hidden
                        />
                    </div>
                </div>
                {isOpen && (
                    <div className="space-y-1.5 px-4 pb-4 pt-1">
                        {members.length > 0 && (
                            <div className="flex items-start gap-2">
                                <span className="w-12 shrink-0 text-xs text-stone-400">
                                    담당자
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {members.map((m) => (
                                        <div
                                            key={m}
                                            className="flex items-center gap-1"
                                        >
                                            <Avatar name={m} size={16} />
                                            <span className="text-xs text-stone-600">
                                                {m}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {a.url && (
                            <div className="flex items-start gap-2">
                                <span className="w-12 shrink-0 text-xs text-stone-400">
                                    URL
                                </span>
                                <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="break-all text-xs text-amber-600 hover:underline"
                                >
                                    {a.url}
                                </a>
                            </div>
                        )}
                        {a.period_note && a.period_note.trim() && (
                            <div className="flex items-start gap-2">
                                <span className="w-12 shrink-0 text-xs text-stone-400">
                                    메모
                                </span>
                                <div className="min-w-0">
                                    {a.period_note
                                        .split("\n")
                                        .map((line, i) =>
                                            line.trim() ? (
                                                <p
                                                    key={i}
                                                    className="text-xs text-stone-600"
                                                >
                                                    {line.trim()}
                                                </p>
                                            ) : null,
                                        )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    const assignActive = useMemo(
        () =>
            assignments
                .filter((a) => a.status === "진행중")
                // 구분별로 같은 종류끼리 모음 (같은 구분 내에서는 기존 sort_order 유지 — 안정 정렬)
                .sort((a, b) => assignTypeRank(a.type) - assignTypeRank(b.type)),
        [assignments],
    );
    const assignWaiting = useMemo(
        () =>
            assignments
                .filter((a) => a.status === "배정대기")
                .sort((a, b) => assignTypeRank(a.type) - assignTypeRank(b.type)),
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
                team_id: TEAM_ID,
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
                            <AgentButton />
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

                {/* 콘텐츠 탭: 현황 보드 / 공지 (주간에서만) — 상위 주간/월간(알약)과 구분되도록 밑줄 탭 */}
                {mode === "weekly" && (
                    <div className="border-b border-stone-200 px-4">
                        <div className="max-w-2xl mx-auto flex gap-5">
                            {[
                                { key: "board", label: "현황 보드" },
                                { key: "notice", label: "공지" },
                            ].map((t) => {
                                const active = reportTab === t.key;
                                return (
                                    <button
                                        type="button"
                                        key={t.key}
                                        onClick={() =>
                                            setReportTab(
                                                t.key as "board" | "notice",
                                            )
                                        }
                                        className={`relative -mb-px border-b-2 px-1.5 py-2.5 text-sm font-semibold transition-colors ${
                                            active
                                                ? "border-stone-900 text-stone-900"
                                                : "border-transparent text-stone-400 hover:text-stone-600"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="max-w-2xl mx-auto px-4 pt-10 pb-24">
                    {loading ? (
                        <PageSpinner />
                    ) : (
                        <>
                            {/* 주간 브리핑 (상태별 아코디언) */}
                            {(mode === "monthly" ||
                                reportTab === "board") && (
                            <div className="mb-5">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="h-4 w-1 rounded bg-amber-500" />
                                        <p className="text-base font-bold text-stone-800">
                                            주간 브리핑
                                        </p>
                                    </div>
                                    {canOpenEdit && (
                                        <button
                                            type="button"
                                            onClick={() => setEditMode((v) => !v)}
                                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${editMode ? "bg-stone-800 text-white" : "border border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-700"}`}
                                        >
                                            <i className={`text-sm ${editMode ? "ri-lock-unlock-line" : "ri-edit-line"}`} aria-hidden />
                                            {editMode ? "편집 중" : "편집"}
                                        </button>
                                    )}
                                </div>
                                {/* 구분(업무 유형) 탭 → 선택된 구분의 업무를 상태별로 나열 */}
                                {(() => {
                                    const typeOf = (t: Task) =>
                                        TYPE_SORT_ORDER.includes(t.type ?? "")
                                            ? (t.type as string)
                                            : "기타";
                                    const typeGroups = [...TYPE_SORT_ORDER, "기타"]
                                        .map((type) => ({
                                            type,
                                            tasks: curTasks.filter(
                                                (t) => typeOf(t) === type,
                                            ),
                                        }))
                                        .filter((grp) => grp.tasks.length > 0);
                                    if (!typeGroups.length)
                                        return (
                                            <p className="py-8 text-center text-sm text-stone-400">
                                                브리핑할 업무가 없습니다.
                                            </p>
                                        );
                                    const canEdit = editAllowed;
                                    const activeType = typeGroups.some(
                                        (grp) => grp.type === briefTypeTab,
                                    )
                                        ? briefTypeTab
                                        : typeGroups[0].type;
                                    const activeGroup =
                                        typeGroups.find(
                                            (grp) => grp.type === activeType,
                                        ) ?? typeGroups[0];
                                    return (
                                        <>
                                            {/* 구분(업무 유형) 탭 바 */}
                                            <div
                                                ref={briefTabBarRef}
                                                className="flex gap-1 border-b border-stone-200 mb-3 overflow-x-auto overflow-y-hidden scrollbar-none select-none cursor-grab active:cursor-grabbing"
                                                onMouseDown={(e) => {
                                                    const el =
                                                        briefTabBarRef.current;
                                                    if (!el) return;
                                                    briefTabDragRef.current = {
                                                        dragging: true,
                                                        startX:
                                                            e.pageX -
                                                            el.offsetLeft,
                                                        scrollLeft:
                                                            el.scrollLeft,
                                                    };
                                                }}
                                                onMouseMove={(e) => {
                                                    const drag =
                                                        briefTabDragRef.current;
                                                    if (!drag.dragging) return;
                                                    const el =
                                                        briefTabBarRef.current;
                                                    if (!el) return;
                                                    e.preventDefault();
                                                    el.scrollLeft =
                                                        drag.scrollLeft -
                                                        (e.pageX -
                                                            el.offsetLeft -
                                                            drag.startX);
                                                }}
                                                onMouseUp={() => {
                                                    briefTabDragRef.current.dragging =
                                                        false;
                                                }}
                                                onMouseLeave={() => {
                                                    briefTabDragRef.current.dragging =
                                                        false;
                                                }}
                                            >
                                                {typeGroups.map((grp) => {
                                                    const isActive =
                                                        grp.type === activeType;
                                                    return (
                                                        <button
                                                            key={grp.type}
                                                            type="button"
                                                            onClick={() =>
                                                                setBriefTypeTab(
                                                                    grp.type,
                                                                )
                                                            }
                                                            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                                                                isActive
                                                                    ? "border-stone-700 text-stone-800"
                                                                    : "border-transparent text-stone-400 hover:text-stone-600"
                                                            }`}
                                                        >
                                                            <span
                                                                className={
                                                                    isActive
                                                                        ? TYPE_TEXT_COLOR[
                                                                              grp
                                                                                  .type
                                                                          ] ?? ""
                                                                        : ""
                                                                }
                                                            >
                                                                {grp.type}
                                                            </span>
                                                            <span
                                                                className={`text-xs rounded-full px-1.5 py-0.5 ${isActive ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500"}`}
                                                            >
                                                                {grp.tasks.length}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {[activeGroup].map((grp) => (
                                                <div
                                                    key={grp.type}
                                                    className="bg-white rounded-xl border border-stone-200 overflow-hidden"
                                                >
                                                    {/* 카드 헤더: 건수 + 전체 복사 */}
                                                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
                                                        <p className="text-sm text-stone-500">
                                                            총{" "}
                                                            <span className="font-bold text-stone-800">
                                                                {grp.tasks.length}
                                                            </span>
                                                            건
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const html = (
                                                                    t: Task,
                                                                ) =>
                                                                    briefTaskDraftRef
                                                                        .current[
                                                                        t.id
                                                                    ] ??
                                                                    savedBriefTasks[
                                                                        t.id
                                                                    ] ??
                                                                    contentToCardHtml(
                                                                        t,
                                                                    );
                                                                const text =
                                                                    buildBriefProjects(
                                                                        grp.tasks,
                                                                    )
                                                                        .map(
                                                                            (p) =>
                                                                                projectCopyText(
                                                                                    p,
                                                                                    html,
                                                                                ),
                                                                        )
                                                                        .join(
                                                                            "\n\n",
                                                                        );
                                                                void copySection(
                                                                    text,
                                                                    (v) =>
                                                                        setCopiedTypeGroup(
                                                                            v ? grp.type : null,
                                                                        ),
                                                                );
                                                            }}
                                                            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${copiedTypeGroup === grp.type ? "bg-green-500 text-white" : "bg-stone-800 text-white"}`}
                                                        >
                                                            {copiedTypeGroup === grp.type
                                                                ? "복사됨!"
                                                                : "전체 복사"}
                                                        </button>
                                                    </div>
                                                    {/* 카드 안: 상태별 그룹 — 같은 프로젝트는 하나로 병합, 활성 상태에 배치 */}
                                                    {(() => {
                                                        const taskHtml = (
                                                            t: Task,
                                                        ) =>
                                                            briefTaskDraftRef
                                                                .current[t.id] ??
                                                            savedBriefTasks[
                                                                t.id
                                                            ] ??
                                                            contentToCardHtml(t);
                                                        const projects =
                                                            buildBriefProjects(
                                                                grp.tasks,
                                                            );
                                                        return STATUS_BRIEF_GROUPS.map(
                                                            (g, r) => {
                                                                const projs =
                                                                    projects.filter(
                                                                        (p) =>
                                                                            p.bucket ===
                                                                            r,
                                                                    );
                                                                if (!projs.length)
                                                                    return null;
                                                                return (
                                                                    <div
                                                                        key={
                                                                            g.key
                                                                        }
                                                                    >
                                                                        {/* 상태 서브헤더 */}
                                                                        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                                                                            <span className="text-base">
                                                                                {
                                                                                    g.emoji
                                                                                }
                                                                            </span>
                                                                            <span className="text-sm font-semibold text-stone-600">
                                                                                {
                                                                                    g.key
                                                                                }
                                                                            </span>
                                                                            <span className="text-sm text-stone-400">
                                                                                {
                                                                                    projs.length
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                        <div className="divide-y divide-stone-100">
                                                                            {projs.map(
                                                                                (
                                                                                    p,
                                                                                ) => (
                                                                                    <div
                                                                                        key={
                                                                                            p.proj
                                                                                        }
                                                                                        className="p-4 space-y-3"
                                                                                    >
                                                                                        {/* 프로젝트 헤더: ⭐ [타입] 프로젝트명 + 복사 */}
                                                                                        <div className="flex items-start justify-between gap-2">
                                                                                            <p className="text-[13px] font-bold text-stone-800">
                                                                                                {p.starred && (
                                                                                                    <span
                                                                                                        className="mr-1"
                                                                                                        title="핵심 프로젝트"
                                                                                                    >
                                                                                                        ⭐
                                                                                                    </span>
                                                                                                )}
                                                                                                {p.type && (
                                                                                                    <span
                                                                                                        className={
                                                                                                            TYPE_TEXT_COLOR[
                                                                                                                p
                                                                                                                    .type
                                                                                                            ] ??
                                                                                                            "text-stone-500"
                                                                                                        }
                                                                                                    >
                                                                                                        [{p.type}]{" "}
                                                                                                    </span>
                                                                                                )}
                                                                                                {p.proj}
                                                                                                {p.members.length > 0 && (
                                                                                                    <span className="ml-1 font-medium text-stone-400">
                                                                                                        @{p.members.join(", ")}
                                                                                                    </span>
                                                                                                )}
                                                                                            </p>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() =>
                                                                                                    void copySection(
                                                                                                        projectCopyText(
                                                                                                            p,
                                                                                                            taskHtml,
                                                                                                        ),
                                                                                                        (
                                                                                                            v,
                                                                                                        ) =>
                                                                                                            setCopiedProj(
                                                                                                                v
                                                                                                                    ? p.proj
                                                                                                                    : null,
                                                                                                            ),
                                                                                                    )
                                                                                                }
                                                                                                className={`shrink-0 rounded-md p-1 transition-colors ${copiedProj === p.proj ? "text-green-600" : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"}`}
                                                                                                title={
                                                                                                    copiedProj ===
                                                                                                    p.proj
                                                                                                        ? "복사됨"
                                                                                                        : "복사"
                                                                                                }
                                                                                                aria-label="복사"
                                                                                            >
                                                                                                <i
                                                                                                    className={`text-base ${copiedProj === p.proj ? "ri-check-line" : "ri-file-copy-line"}`}
                                                                                                    aria-hidden
                                                                                                />
                                                                                            </button>
                                                                                        </div>
                                                                                        {/* 업무별 블록: @담당자 + 완료 태그 + 에디터 + 저장 */}
                                                                                        {p.tasks.map(
                                                                                            (
                                                                                                t,
                                                                                            ) => {
                                                                                                const savedHtml =
                                                                                                    savedBriefTasks[
                                                                                                        t
                                                                                                            .id
                                                                                                    ];
                                                                                                const cardInitial =
                                                                                                    noticeHtmlHasText(
                                                                                                        savedHtml,
                                                                                                    )
                                                                                                        ? savedHtml
                                                                                                        : contentToCardHtml(
                                                                                                              t,
                                                                                                          );
                                                                                                return (
                                                                                                    <div
                                                                                                        key={
                                                                                                            t.id
                                                                                                        }
                                                                                                        className="space-y-2"
                                                                                                    >
                                                                                                        {isDoneTagged(
                                                                                                            p,
                                                                                                            t,
                                                                                                        ) && (
                                                                                                            <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                                                                                                                완료
                                                                                                            </span>
                                                                                                        )}
                                                                                                        <TiptapSectionEditor
                                                                                                            key={`btask-${t.id}-${wOff}-${briefingEditorKey}`}
                                                                                                            content={
                                                                                                                cardInitial
                                                                                                            }
                                                                                                            onChange={(
                                                                                                                html,
                                                                                                            ) => {
                                                                                                                briefTaskDraftRef.current[
                                                                                                                    t.id
                                                                                                                ] =
                                                                                                                    html;
                                                                                                            }}
                                                                                                            editable={
                                                                                                                canEdit
                                                                                                            }
                                                                                                            showToolbar={
                                                                                                                canEdit
                                                                                                            }
                                                                                                            placeholder="업무 내용을 입력하세요..."
                                                                                                        />
                                                                                                        {canEdit && (
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                disabled={
                                                                                                                    savingTaskId ===
                                                                                                                    t.id
                                                                                                                }
                                                                                                                onClick={(
                                                                                                                    e,
                                                                                                                ) => {
                                                                                                                    e.preventDefault();
                                                                                                                    e.stopPropagation();
                                                                                                                    void saveBriefingTask(
                                                                                                                        t.id,
                                                                                                                        briefTaskDraftRef
                                                                                                                            .current[
                                                                                                                            t
                                                                                                                                .id
                                                                                                                        ] ??
                                                                                                                            cardInitial,
                                                                                                                    );
                                                                                                                }}
                                                                                                                className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                                                                                            >
                                                                                                                {savingTaskId ===
                                                                                                                t.id
                                                                                                                    ? "저장 중…"
                                                                                                                    : "저장"}
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </div>
                                                                                                );
                                                                                            },
                                                                                        )}
                                                                                    </div>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            },
                                                        );
                                                    })()}
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                            )}

                            {/* 담당 배정 */}
                            {mode === "weekly" && reportTab === "board" && (
                                <div className="mb-5 mt-8">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="h-4 w-1 rounded bg-amber-500" />
                                            <p className="text-base font-bold text-stone-800">
                                                담당 배정
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={copyAssignmentsBlock}
                                            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${copiedAssign ? "bg-green-500 text-white" : "bg-stone-800 text-white"}`}
                                        >
                                            {copiedAssign ? "복사됨!" : "전체 복사"}
                                        </button>
                                    </div>

                                    {/* 탭 바 */}
                                    <div
                                        ref={assignTabBarRef}
                                        className="flex gap-1 border-b border-stone-200 mb-3 overflow-x-auto scrollbar-none select-none cursor-grab active:cursor-grabbing"
                                    >
                                        {([
                                            { key: "active" as const, label: "배정현황", emoji: "🟢", count: assignActive.length },
                                            { key: "waiting" as const, label: "배정대기", emoji: "🟡", count: assignWaiting.length },
                                        ] as const).map((t) => {
                                            const isActive = assignTab === t.key;
                                            return (
                                                <button
                                                    key={t.key}
                                                    type="button"
                                                    onClick={() => setAssignTab(t.key)}
                                                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                                                        isActive
                                                            ? "border-stone-700 text-stone-800"
                                                            : "border-transparent text-stone-400 hover:text-stone-600"
                                                    } ${t.count === 0 ? "opacity-40" : ""}`}
                                                >
                                                    <span>{t.emoji}</span>
                                                    <span>{t.label}</span>
                                                    {t.count > 0 && (
                                                        <span className={`text-xs rounded-full px-1.5 py-0.5 ${isActive ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-500"}`}>
                                                            {t.count}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* 탭 콘텐츠 */}
                                    {assignTab === "active" && (
                                        assignActive.length === 0 ? (
                                            <p className="py-8 text-center text-sm text-stone-400">🟢 배정된 항목이 없습니다.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {assignActive.map(renderAssignCard)}
                                            </div>
                                        )
                                    )}
                                    {assignTab === "waiting" && (
                                        assignWaiting.length === 0 ? (
                                            <p className="py-8 text-center text-sm text-stone-400">🟡 대기 중인 항목이 없습니다.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {assignWaiting.map(renderAssignCard)}
                                            </div>
                                        )
                                    )}

                                    {isLeader && (
                                        <button
                                            type="button"
                                            onClick={openAddAssignment}
                                            className="mt-3 w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-xs font-medium text-stone-500 hover:border-stone-400 hover:text-stone-700"
                                        >
                                            + 항목 추가
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* 확인해주세요 */}
                            {mode === "weekly" && reportTab === "notice" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div
                                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100 cursor-pointer"
                                        onClick={() =>
                                            setChecklistOpen((v) => !v)
                                        }
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ")
                                                setChecklistOpen((v) => !v);
                                        }}
                                    >
                                        <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                            📌 확인해주세요
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {isLeader && !editingChecklist && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const initial =
                                                            briefing?.checklist ??
                                                            "";
                                                        editChecklistDraftRef.current =
                                                            initial;
                                                        setEditChecklist(initial);
                                                        setEditingChecklist(true);
                                                        setChecklistOpen(true);
                                                        setChecklistEditorNonce(
                                                            (n) => n + 1,
                                                        );
                                                    }}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                                                >
                                                    편집
                                                </button>
                                            )}
                                            <i
                                                className={`${checklistOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-stone-400`}
                                                aria-hidden
                                            />
                                        </div>
                                    </div>
                                    {checklistOpen && (
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
                                    )}
                                </div>
                            )}

                            {/* OKR */}
                            {mode === "weekly" && reportTab === "notice" && (
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
                            {mode === "weekly" && reportTab === "notice" && (
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-3">
                                    <div
                                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100 cursor-pointer"
                                        onClick={() => setNoticeOpen((v) => !v)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ")
                                                setNoticeOpen((v) => !v);
                                        }}
                                    >
                                        <p className="text-sm font-bold text-stone-400 uppercase tracking-wide">
                                            주간 전달사항
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {isLeader && !editingNotice && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const initial =
                                                            briefing?.notice ??
                                                            "";
                                                        editNoticeDraftRef.current =
                                                            initial;
                                                        setEditNotice(initial);
                                                        setEditingNotice(true);
                                                        setNoticeOpen(true);
                                                        setNoticeEditorNonce(
                                                            (n) => n + 1,
                                                        );
                                                    }}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-medium border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-50"
                                                >
                                                    편집
                                                </button>
                                            )}
                                            <i
                                                className={`${noticeOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-stone-400`}
                                                aria-hidden
                                            />
                                        </div>
                                    </div>
                                    {noticeOpen && (
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
                                    )}
                                </div>
                            )}

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
                            className="max-h-[calc(100dvh-var(--nav-height,0px)-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl"
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
