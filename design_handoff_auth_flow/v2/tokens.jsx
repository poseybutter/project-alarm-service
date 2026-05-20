// v2 디자인 토큰 — 라이트 모드, 앰버 액센트, 스톤 뉴트럴
// 실제 Tailwind 클래스로 매핑되는 값만 적어 핸드오프 시 그대로 옮길 수 있게

const T2 = {
  c: {
    bg: "#ffffff",
    bgSoft: "#fafaf9",      // stone-50
    bgMute: "#f5f5f4",      // stone-100
    line: "#e7e5e4",        // stone-200
    lineStrong: "#d6d3d1",  // stone-300
    text: "#171717",        // stone-900-ish
    textSub: "#44403c",     // stone-700
    textMute: "#a8a29e",    // stone-400
    accent: "#f59e0b",      // amber-500
    accentDeep: "#b45309",  // amber-700
    accentSoft: "#fffbeb",  // amber-50
    accentLine: "#fde68a",  // amber-200
    success: "#059669",     // emerald-600
    successSoft: "#ecfdf5", // emerald-50
    danger: "#dc2626",      // red-600
    dangerSoft: "#fef2f2",  // red-50
    info: "#0284c7",        // sky-600
    infoSoft: "#f0f9ff",    // sky-50
  },
  font: {
    sans: "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
};
window.T2 = T2;
