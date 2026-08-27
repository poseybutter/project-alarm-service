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

/**
 * 해당 주(월요일 시작) 월요일의 로컬 YYYY-MM-DD.
 * 일요일은 직전 월요일(-6일)로, 그 외에는 (1 - 요일)만큼 당겨서 계산.
 */
export function getThisMonday(date: Date = new Date()): string {
    const d = new Date(date);
    const day = d.getDay(); // 0=일 ~ 6=토
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return toLocalYmd(d);
}
