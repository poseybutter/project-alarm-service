/**
 * 로컬 타임존 기준 YYYY-MM-DD (DayPicker 등에서 DB에 저장할 때 사용).
 * `toISOString().slice(0, 10)`은 UTC 기준이라 날짜가 하루 밀릴 수 있음.
 */
export function toLocalYmd(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) {
        return `${y}-${m}-${d}`;
    }
    const y2 = date.getFullYear();
    const m2 = String(date.getMonth() + 1).padStart(2, "0");
    const d2 = String(date.getDate()).padStart(2, "0");
    return `${y2}-${m2}-${d2}`;
}
