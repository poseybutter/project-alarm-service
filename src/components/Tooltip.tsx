"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * hover 시 대상 위쪽에 뜨는 커스텀 툴팁.
 * 포털(document.body) + position:fixed 라서 부모의 overflow-hidden(둥근 카드 등)에 잘리지 않는다.
 * children은 단일 요소(보통 아이콘 버튼)를 감싸며, 래퍼는 inline-flex로 레이아웃 영향 최소화.
 */
export default function Tooltip({
    label,
    children,
    className,
}: {
    label: string;
    children: ReactNode;
    className?: string;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const [coord, setCoord] = useState<{ x: number; y: number } | null>(null);

    const show = () => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setCoord({ x: r.left + r.width / 2, y: r.top });
    };
    const hide = () => setCoord(null);

    return (
        <span
            ref={ref}
            className={`inline-flex ${className ?? ""}`}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocusCapture={show}
            onBlurCapture={hide}
        >
            {children}
            {coord !== null &&
                typeof document !== "undefined" &&
                createPortal(
                    <span
                        role="tooltip"
                        style={{ left: coord.x, top: coord.y - 8 }}
                        className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[11px] font-medium text-white shadow-md"
                    >
                        {label}
                    </span>,
                    document.body,
                )}
        </span>
    );
}
