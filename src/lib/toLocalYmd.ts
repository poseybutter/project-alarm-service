/**
 * 로컬 타임존 기준 YYYY-MM-DD (DayPicker 등에서 DB에 저장할 때 사용).
 * `toISOString().slice(0, 10)`은 UTC 기준이라 날짜가 하루 밀릴 수 있음.
 */
export function toLocalYmd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
