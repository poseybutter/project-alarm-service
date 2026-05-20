// v2 ZEP-style primitives — 픽셀 스프라이트 + 3D 게임 버튼 + 세그먼트 바
const { useState: useStateV2P, useEffect: useEffectV2P } = React;

/* ============================================================
   PIXEL SPRITE ENGINE — viewBox 1단위 = 1픽셀
   ============================================================ */
function Pix({ map, palette, scale = 4, style, className }) {
  const w = map[0].length, h = map.length;
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      const c = palette[ch];
      if (c) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c} />);
    }
  }
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", display: "block", ...style }}
      className={className}>
      {cells}
    </svg>
  );
}

/* ===== Palette ===== */
const PAL_AMBER = {
  ".": null, "K": "#0c0a09", "L": "#92400e", "A": "#d97706", "a": "#f59e0b",
  "b": "#fbbf24", "c": "#fde68a", "W": "#ffffff", "S": "#fed7aa",
};
const PAL_RED   = { ".": null, "K": "#0c0a09", "L": "#7f1d1d", "A": "#b91c1c", "a": "#ef4444", "b": "#fca5a5", "W": "#ffffff" };
const PAL_GREEN = { ".": null, "K": "#0c0a09", "L": "#065f46", "A": "#059669", "a": "#10b981", "b": "#6ee7b7", "W": "#ffffff" };
const PAL_BLUE  = { ".": null, "K": "#0c0a09", "L": "#1e40af", "A": "#2563eb", "a": "#3b82f6", "b": "#93c5fd", "W": "#ffffff" };
const PAL_STONE = { ".": null, "K": "#0c0a09", "L": "#44403c", "A": "#78716c", "a": "#a8a29e", "b": "#d6d3d1", "W": "#ffffff" };

/* ===== Sprites ===== */
// 14x14 마스코트 — 모험가 길드원
const SPR_HERO = [
  "....KKKKKK....",
  "...KaaaaaaK...",
  "..KaWAAAAWaK..",
  "..KaWAcWcAWaK.".slice(0,14), // safety
  "..KaAcKWKcAaK.".slice(0,14),
  "..KaAccccccAK.".slice(0,14),
  "..KaAAcAAcAAK.".slice(0,14),
  "...KaAAAAAK...",
  "....KKKKKK....",
  "...KaWWWWaK...",
  "..KaWAAAAWaK..",
  "..KaaAaaAaaK..",
  "...KaaaaaaK...",
  "....KKKKKK....",
];
function Hero({ scale = 5 }) { return <Pix map={SPR_HERO} palette={PAL_AMBER} scale={scale} />; }

// 12x14 모래시계
const SPR_HOUR = [
  ".LLLLLLLLLL.",
  "LLLLLLLLLLLL",
  "LWaaaaaaaaWL",
  "LWAaaaaaaAWL",
  "LWAAaaaaAAWL",
  "LWAAAaaAAAWL",
  "LWWAAAAAAWWL",
  "LWWAAAAAAWWL",
  "LWAAAaaAAAWL",
  "LWAAaccaAAWL",
  "LWAaccccaAWL",
  "LWaaccccaaWL",
  "LLLLLLLLLLLL",
  ".LLLLLLLLLL.",
];
function Hourglass({ scale = 5, tone = "amber" }) {
  const pal = tone === "amber" ? PAL_AMBER : PAL_STONE;
  return <Pix map={SPR_HOUR} palette={pal} scale={scale} />;
}

// 16x10 열쇠
const SPR_KEY = [
  "....KKKKK.......",
  "...KaaaaaK......",
  "..KaWKKKaaK.....",
  "..KaKbbbKaK.....",
  "..KaWKKKaaK.....",
  "...KaaaaaK......",
  "....KKaaK.......",
  ".....KaK.KKK.KK.",
  ".....KaK.KbK.KK.",
  ".....KKKKKKKKKK.",
];
function Key({ scale = 5 }) { return <Pix map={SPR_KEY} palette={PAL_AMBER} scale={scale} />; }

// 12x14 방패 (관리자 / 길드장 인장)
const SPR_SHIELD = [
  "KKKKKKKKKKKK",
  "KaaaaaaaaaaK",
  "KaWWAAAAWWaK",
  "KaWAcAAcAWaK",
  "KaAccAAccAaK",
  "KaAAAccAAAaK",
  "KaAAccccAAaK",
  "KaAAcAAcAAaK",
  "KaaAAAAAAaaK",
  ".KaaAAAAaaK.",
  "..KaaAAaaK..",
  "...KaaaaK...",
  "....KaaK....",
  ".....KK.....",
];
function Shield({ scale = 5 }) { return <Pix map={SPR_SHIELD} palette={PAL_AMBER} scale={scale} />; }

// 14x10 두루마리 / 초대장
const SPR_SCROLL = [
  "..KKKKKKKKKKKK",
  ".KAAAAAAAAAAAK",
  "KAcWWWWWWWWcAK",
  "KAcKKKWKKKKcAK",
  "KAcKKWKKKKWcAK",
  "KAcKWKKWKKKcAK",
  "KAcKKKWKKWKcAK",
  "KAcWWWWWWWWcAK",
  ".KAAAAAAAAAAAK",
  "..KKKKKKKKKKKK",
];
function Scroll({ scale = 5 }) { return <Pix map={SPR_SCROLL} palette={PAL_AMBER} scale={scale} />; }

// 9x9 체크 표시 (완료)
const SPR_CHECK = [
  ".........",
  ".......aA",
  "......aAK",
  ".....aAK.",
  "K...aAK..",
  "AK.aAK...",
  ".AaAK....",
  "..AK.....",
  ".........",
];
function PixCheck({ scale = 3 }) { return <Pix map={SPR_CHECK} palette={PAL_GREEN} scale={scale} />; }

// 작은 다이아 (XP 보석)
const SPR_GEM = [
  "..AAAA..",
  ".AbbAAA.",
  "AbbbAAAA",
  "AbWbAAAa",
  "AbbbAaaA",
  ".AbbAAA.",
  "..AAAA..",
  "...AA...",
];
function Gem({ scale = 3, tone = "blue" }) {
  const pal = tone === "blue" ? PAL_BLUE : tone === "red" ? PAL_RED : tone === "green" ? PAL_GREEN : PAL_AMBER;
  return <Pix map={SPR_GEM} palette={pal} scale={scale} />;
}

// 16x10 자물쇠 (X 표시) — 거절/잠김
const SPR_LOCKED = [
  "....KKKKKKKK....",
  "...KaaaaaaaaK...",
  "..KaWKKKKKKWaK..",
  "..KaWKaaaaKWaK..",
  ".KaaaaaaaaaaaaK.",
  "KaaaaWKKKKWaaaaK",
  "Kaaaa.KaK.aaaaaK",
  "Kaaaaa.K.aaaaaaK",
  ".KaaaaaaaaaaaaK.",
  "..KKKKKKKKKKKK..",
];
function Locked({ scale = 4 }) { return <Pix map={SPR_LOCKED} palette={PAL_RED} scale={scale} />; }

/* ============================================================
   GAME UI COMPONENTS
   ============================================================ */

// 로고 — 픽셀 다이아 + 텍스트
function Logo({ size = 32, withText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 border-2 border-amber-900 bg-amber-400"
          style={{
            clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
            imageRendering: "pixelated",
          }}/>
        <span className="relative font-black text-amber-950" style={{ fontSize: size * 0.42, letterSpacing: "-0.04em" }}>U</span>
      </div>
      {withText && (
        <div>
          <div className="text-[15px] font-extrabold tracking-tight text-stone-900 leading-tight">UD2 워크스페이스</div>
          <div className="text-[11px] text-stone-400 font-mono">markup-story · v1.4</div>
        </div>
      )}
    </div>
  );
}

// 3D 게임 버튼 — 하단 보더로 입체감
function Btn({ children, variant = "primary", size = "md", full, leftIcon, rightIcon, onClick, disabled, type }) {
  const sizes = {
    sm: "h-9 px-3 text-[12.5px]",
    md: "h-11 px-4 text-[14px]",
    lg: "h-12 px-5 text-[15px]",
  };
  const variants = {
    primary: "bg-amber-400 hover:bg-amber-300 text-amber-950 border-amber-700 shadow-[0_4px_0_0_#b45309] active:shadow-[0_1px_0_0_#b45309]",
    ghost:   "bg-white hover:bg-stone-50 text-stone-700 border-stone-300 shadow-[0_3px_0_0_#d6d3d1] active:shadow-[0_1px_0_0_#d6d3d1]",
    soft:    "bg-stone-100 hover:bg-stone-50 text-stone-800 border-stone-300 shadow-[0_3px_0_0_#d6d3d1] active:shadow-[0_1px_0_0_#d6d3d1]",
    danger:  "bg-red-100 hover:bg-red-50 text-red-800 border-red-400 shadow-[0_3px_0_0_#dc2626] active:shadow-[0_1px_0_0_#dc2626]",
    success: "bg-emerald-400 hover:bg-emerald-300 text-emerald-950 border-emerald-700 shadow-[0_3px_0_0_#047857] active:shadow-[0_1px_0_0_#047857]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-extrabold rounded-lg border-2 transition-all
        active:translate-y-[3px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
        ${sizes[size]} ${variants[variant]} ${full ? "w-full" : ""}`}>
      {leftIcon}{children}{rightIcon}
    </button>
  );
}

// 입력 필드 — 2px 보더, 포커스 시 앰버 글로우
function Field({ label, hint, error, type = "text", value, onChange, placeholder, icon, right, autoFocus, mono, maxLength, onKeyDown, inputRef }) {
  const [focused, setFocused] = useStateV2P(false);
  return (
    <label className="block">
      {label && (
        <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline tracking-tight">
          <span>{label}</span>
          {hint && <span className="text-[11px] font-medium text-stone-400" style={{ fontFamily: mono ? T2.font.mono : "inherit" }}>{hint}</span>}
        </div>
      )}
      <div className={`flex items-center bg-white rounded-lg border-2 transition-all
        ${error ? "border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.18)]" :
          focused ? "border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.22)]" : "border-stone-300"}`}>
        {icon && <div className="pl-3 text-stone-500 flex">{icon}</div>}
        <input
          ref={inputRef}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent border-none outline-none px-3 py-2.5 text-[14px] font-medium text-stone-900 placeholder:text-stone-400"
          style={{ fontFamily: mono ? T2.font.mono : T2.font.sans, letterSpacing: mono ? "0.06em" : "-0.01em" }}
        />
        {right && <div className="pr-1.5">{right}</div>}
      </div>
      {error && <div className="mt-1.5 text-[12px] text-red-600 font-bold flex gap-1 items-center">⚠ {error}</div>}
    </label>
  );
}

// 세그먼트 EXP/HP 바
function GameBar({ value, max = 100, label, sub, tone = "amber", segments = 20 }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(pct * segments);
  const colors = {
    amber: "bg-amber-400 border-amber-700",
    red:   "bg-red-400 border-red-700",
    blue:  "bg-blue-400 border-blue-700",
    green: "bg-emerald-400 border-emerald-700",
  };
  const fill = colors[tone].split(" ")[0];
  const border = colors[tone].split(" ")[1];
  return (
    <div>
      {(label || sub) && (
        <div className="flex justify-between items-baseline mb-1">
          {label && <span className="text-[11px] font-extrabold text-stone-700 tracking-widest uppercase">{label}</span>}
          {sub && <span className="text-[11px] text-stone-500 font-mono font-bold">{sub}</span>}
        </div>
      )}
      <div className={`flex gap-[2px] p-[3px] rounded-md bg-stone-100 border-2 ${border}`}>
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className={`flex-1 h-3 rounded-[1px] ${i < filled ? fill : "bg-stone-200"}`} />
        ))}
      </div>
    </div>
  );
}

// 게임 칩 — 사각, 2px 보더
function ChipG({ children, tone = "amber", icon }) {
  const tones = {
    amber: "bg-amber-50 border-amber-400 text-amber-800",
    blue:  "bg-blue-50 border-blue-400 text-blue-800",
    green: "bg-emerald-50 border-emerald-400 text-emerald-800",
    red:   "bg-red-50 border-red-400 text-red-700",
    gray:  "bg-stone-100 border-stone-300 text-stone-700",
    gold:  "bg-yellow-50 border-yellow-500 text-yellow-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded border-2 ${tones[tone]} text-[11px] font-extrabold leading-snug`}>
      {icon}{children}
    </span>
  );
}

// 캐릭터 박스 — 사각 아바타 (게임 인벤토리 슬롯 스타일)
function CharBox({ name = "?", size = 48, color, level }) {
  const colors = ["#f59e0b", "#0ea5e9", "#10b981", "#ef4444", "#a78bfa", "#ec4899"];
  const c = color || colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="relative inline-block flex-shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-md border-2 border-stone-800 bg-white"
        style={{ boxShadow: `inset 0 -3px 0 0 rgba(0,0,0,0.18)` }}>
        <div className="absolute inset-[3px] rounded grid place-items-center text-white font-black"
          style={{ background: `linear-gradient(180deg, ${c} 0%, ${c}dd 100%)`, fontSize: size * 0.42 }}>
          {name.slice(0, 1)}
        </div>
      </div>
      {level != null && (
        <div className="absolute -bottom-2 -right-2 grid place-items-center bg-amber-400 text-amber-950 border-2 border-amber-700 rounded text-[10px] font-black px-1 leading-none"
          style={{ height: 17, minWidth: 22, boxShadow: "0 2px 0 0 #b45309" }}>
          {level}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   LINE ICONS — 입력 필드 안에 들어가는 작은 아이콘들 (원래 디자인 유지)
   ============================================================ */
const I = {
  mail: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>,
  lock: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>,
  user: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>,
  eye: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.4 4M6.6 6.6A16 16 0 0 0 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1"/><path d="m4 4 16 16"/><circle cx="12" cy="12" r="3"/></svg>,
  arrow: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14m-5-6 6 6-6 6"/></svg>,
  check: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 5 5 9-10"/></svg>,
  x: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6 6 18"/></svg>,
  search: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
};

Object.assign(window, {
  Pix, Hero, Hourglass, Key, Shield, Scroll, PixCheck, Gem, Locked,
  Logo, Btn, Field, GameBar, ChipG, CharBox, I,
});
