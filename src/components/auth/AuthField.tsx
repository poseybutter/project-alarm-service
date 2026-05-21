"use client";

import { useState, type ReactNode, type Ref } from "react";

type Props = {
    label?: ReactNode;
    hint?: ReactNode;
    error?: string | null;
    type?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    icon?: ReactNode;
    right?: ReactNode;
    autoFocus?: boolean;
    mono?: boolean;
    maxLength?: number;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    inputRef?: Ref<HTMLInputElement>;
    name?: string;
    autoComplete?: string;
    readOnly?: boolean;
};

/** 입력 필드 — amber 포커스 글로우, red 에러 글로우, 좌측 아이콘 + 우측 슬롯. */
export function AuthField({
    label,
    hint,
    error,
    type = "text",
    value,
    onChange,
    placeholder,
    icon,
    right,
    autoFocus,
    mono,
    maxLength,
    onKeyDown,
    inputRef,
    name,
    autoComplete,
    readOnly,
}: Props) {
    const [focused, setFocused] = useState(false);
    const borderState = error
        ? "border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.18)]"
        : focused && !readOnly
          ? "border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.22)]"
          : "border-stone-300";
    const bg = readOnly ? "bg-stone-50" : "bg-white";
    return (
        <label className="block">
            {label && (
                <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline tracking-tight">
                    <span>{label}</span>
                    {hint && (
                        <span
                            className={`text-[11px] font-medium text-stone-400 ${mono ? "font-mono-auth" : ""}`}
                        >
                            {hint}
                        </span>
                    )}
                </div>
            )}
            <div
                className={`flex items-center rounded-lg border-2 transition-all ${bg} ${borderState}`}
            >
                {icon && (
                    <div className="pl-3 text-stone-500 flex">{icon}</div>
                )}
                <input
                    ref={inputRef}
                    type={type}
                    name={name}
                    autoComplete={autoComplete}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    maxLength={maxLength}
                    readOnly={readOnly}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    className={`flex-1 bg-transparent border-none outline-none px-3 py-2.5 text-[14px] font-medium text-stone-900 placeholder:text-stone-400 ${mono ? "font-mono-auth tracking-[0.06em]" : "tracking-[-0.01em]"} ${readOnly ? "cursor-default text-stone-600" : ""}`}
                />
                {right && <div className="pr-1.5">{right}</div>}
            </div>
            {error && (
                <div className="mt-1.5 text-[12px] text-red-600 font-bold flex gap-1 items-center">
                    ⚠ {error}
                </div>
            )}
        </label>
    );
}
