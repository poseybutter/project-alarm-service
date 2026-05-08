export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
    const s = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-10 h-10" : "w-6 h-6";
    return (
        <div
            className={`${s} animate-spin rounded-full border-2 border-stone-200 border-t-amber-500`}
        />
    );
}

// 페이지 전체 로딩용
export function PageSpinner() {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner size="lg" />
            <p className="text-xs text-stone-400">불러오는 중...</p>
        </div>
    );
}
