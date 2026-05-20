export type GameBarTone = "amber" | "red" | "blue" | "green";

type Props = {
    value: number;
    max?: number;
    label?: string;
    sub?: string;
    tone?: GameBarTone;
    segments?: number;
};

const TONE_FILL: Record<GameBarTone, string> = {
    amber: "bg-amber-400",
    red: "bg-red-400",
    blue: "bg-blue-400",
    green: "bg-emerald-400",
};

const TONE_BORDER: Record<GameBarTone, string> = {
    amber: "border-amber-700",
    red: "border-red-700",
    blue: "border-blue-700",
    green: "border-emerald-700",
};

/** 세그먼트형 EXP 바 — 기본 20세그먼트, value/max 비율로 채워진 세그먼트 수 계산. */
export function GameBar({
    value,
    max = 100,
    label,
    sub,
    tone = "amber",
    segments = 20,
}: Props) {
    const pct = Math.max(0, Math.min(1, value / max));
    const filled = Math.round(pct * segments);
    return (
        <div>
            {(label || sub) && (
                <div className="flex justify-between items-baseline mb-1">
                    {label && (
                        <span className="text-[11px] font-extrabold text-stone-700 tracking-widest uppercase">
                            {label}
                        </span>
                    )}
                    {sub && (
                        <span className="text-[11px] text-stone-500 font-mono-auth font-bold">
                            {sub}
                        </span>
                    )}
                </div>
            )}
            <div
                className={`flex gap-[2px] p-[3px] rounded-md bg-stone-100 border-2 ${TONE_BORDER[tone]}`}
            >
                {Array.from({ length: segments }).map((_, i) => (
                    <div
                        key={i}
                        className={`flex-1 h-3 rounded-[1px] ${i < filled ? TONE_FILL[tone] : "bg-stone-200"}`}
                    />
                ))}
            </div>
        </div>
    );
}
