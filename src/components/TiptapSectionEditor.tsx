"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";

export type TiptapSectionEditorProps = {
    content: string;
    onChange: (html: string) => void;
    editable: boolean;
    showToolbar: boolean;
    placeholder?: string;
};

/** 주간 브리핑 섹션용 Tiptap (TiptapNoticeEditor와 동일 확장·툴바 구조) */
export default function TiptapSectionEditor({
    content,
    onChange,
    editable,
    showToolbar,
    placeholder = "내용을 입력하세요...",
}: TiptapSectionEditorProps) {
    const [, setUiTick] = useState(0);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                // heading: #(H1) ##(H2) ###(H3) 자동 변환 포함
                heading: { levels: [1, 2, 3] },
                // hardBreak: Shift+Enter → <br> (기본 포함)
                hardBreak: {},
                // bold: **text** / __text__, italic: *text* / _text__
                // bulletList: - (space), orderedList: 1. (space) 모두 기본 포함
            }),
            Placeholder.configure({
                placeholder,
            }),
            Typography,
        ],
        content: content || "<p></p>",
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
