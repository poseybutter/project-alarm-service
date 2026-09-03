"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";

type TiptapNoticeEditorProps = {
    content: string;
    onChange: (html: string) => void;
    editable: boolean;
    showToolbar: boolean;
};

/** 주간 전달사항 Tiptap (HTML 저장) */
export default function TiptapNoticeEditor({
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
