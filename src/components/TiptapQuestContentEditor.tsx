"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";

export type TiptapQuestContentEditorProps = {
    /** 모달 열릴 때만 바뀌는 초기 HTML (부모에서 key로 세션 구분) */
    initialHtml: string;
    onChange: (html: string) => void;
    placeholder?: string;
};

/** 퀘스트 제목·본문용 Tiptap (줄바꿈·굵게·기울임·글머리/번호 목록, HTML 저장) */
export default function TiptapQuestContentEditor({
    initialHtml,
    onChange,
    placeholder = "예) 메인 슬라이드 퍼블리싱",
}: TiptapQuestContentEditorProps) {
    const [, setUiTick] = useState(0);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: false,
            }),
            Placeholder.configure({ placeholder }),
            Typography,
        ],
        content: initialHtml?.trim() ? initialHtml : "<p></p>",
        editable: true,
        editorProps: {
            attributes: {
                class: "tiptap notice-editor-prose min-h-[100px] px-2 py-2 focus:outline-none text-sm",
            },
        },
        onUpdate: ({ editor: ed }) => {
            onChange(ed.getHTML());
        },
    });

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
            <div className="notice-editor min-h-[100px] rounded-lg border border-stone-200 bg-stone-50 animate-pulse" />
        );
    }

    return (
        <div className="notice-editor rounded-lg border border-stone-200 bg-stone-50 overflow-hidden">
            <div className="flex flex-wrap gap-1 border-b border-stone-200 bg-white px-2 py-1.5">
                <button
                    type="button"
                    className={btn(editor.isActive("bold"))}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    B
                </button>
                <button
                    type="button"
                    className={btn(editor.isActive("italic"))}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    I
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
            <EditorContent editor={editor} />
        </div>
    );
}
