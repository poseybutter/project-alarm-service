// v2 — 승인 대기 (ZEP 스타일 / "관문 앞에서 대기 중")
const { useState: useStatePendingV2, useEffect: useEffectPendingV2 } = React;

function PendingV2() {
  const [elapsed, setElapsed] = useStatePendingV2(8 * 60 + 23);
  const [sandFrame, setSandFrame] = useStatePendingV2(0);
  useEffectPendingV2(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    const id2 = setInterval(() => setSandFrame((f) => (f + 1) % 4), 700);
    return () => { clearInterval(id); clearInterval(id2); };
  }, []);
  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return (
    <div className="w-[1440px] h-[900px] bg-gradient-to-b from-amber-50/40 via-white to-stone-50 text-stone-900 flex flex-col"
      style={{ fontFamily: T2.font.sans }}>
      {/* 도트 배경 */}
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
        backgroundSize: "20px 20px",
        maskImage: "radial-gradient(900px 700px at 50% 50%, #000, transparent 80%)",
      }} />

      {/* 헤더 */}
      <div className="relative h-16 px-10 flex items-center justify-between border-b-2 border-stone-200 bg-white/80 backdrop-blur">
        <Logo size={28} />
        <div className="flex items-center gap-3">
          <ChipG tone="amber" icon="⏳">승인 대기 중</ChipG>
          <span className="text-[13px] text-stone-500 font-medium">사용자 A · user-a@example.com</span>
          <Btn variant="ghost" size="sm">로그아웃</Btn>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center p-8">
        <div className="w-[720px]">
          {/* 메인 카드 — 게임 윈도우 */}
          <div className="bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
            style={{ boxShadow: "0 8px 0 0 #1c1917" }}>
            {/* 타이틀 바 */}
            <div className="h-9 bg-amber-400 border-b-2 border-stone-800 grid place-items-center relative">
              <div className="text-[11px] font-extrabold text-amber-950 tracking-widest font-mono">
                ★ GUARDIAN'S GATE · 관문 ★
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-700 border border-amber-900" />
                <span className="w-2.5 h-2.5 bg-amber-700 border border-amber-900" />
              </div>
            </div>

            <div className="p-10 text-center">
              {/* 픽셀 모래시계 */}
              <div className="flex justify-center mb-5">
                <div className="relative p-4 bg-amber-50 border-2 border-amber-300 rounded-lg"
                  style={{ animation: "swing 4s ease-in-out infinite" }}>
                  <Hourglass scale={5} />
                  {/* 떨어지는 모래 픽셀 */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-1/2 w-[6px] h-[6px] bg-amber-600"
                    style={{ animation: "sandfall 0.8s linear infinite", top: `${50 + sandFrame * 3}%` }} />
                </div>
              </div>

              <h1 className="text-[28px] font-black tracking-tight leading-[1.15] text-stone-900">
                관문 앞에서 대기 중…
              </h1>
              <p className="text-[14px] text-stone-500 mt-3 leading-relaxed max-w-[480px] mx-auto">
                길드장이 신청서를 확인하고 있어요. 승인이 완료되면
                <b className="text-stone-700"> user-a@example.com</b>으로 알림이 가요.
                보통 <b className="text-amber-700">업무시간 내 1시간 이내</b>로 처리됩니다.
              </p>

              {/* 3단계 — 게임 퀘스트 진행도 */}
              <div className="mt-8 grid grid-cols-[1fr_24px_1fr_24px_1fr] items-center">
                {[
                  { label: "신청서 제출", sub: "✓ 완료", state: "done", emoji: "📜" },
                  { label: "길드장 검토 중", sub: `⏳ ${fmt(elapsed)} 경과`, state: "now", emoji: "🔍" },
                  { label: "워크스페이스 입장", sub: "곧 만나요", state: "todo", emoji: "🏰" },
                ].map((s, i) => (
                  <React.Fragment key={i}>
                    <div className={`flex flex-col items-center gap-2 py-3 rounded-lg border-2 transition-all
                      ${s.state === "now" ? "bg-amber-50 border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" : "border-transparent"}`}>
                      <div className={`w-12 h-12 rounded-md grid place-items-center font-black text-[18px] border-2
                        ${s.state === "done" ? "bg-emerald-400 border-emerald-700 text-emerald-950" :
                          s.state === "now" ? "bg-amber-400 border-amber-700 text-amber-950" :
                          "bg-stone-100 border-stone-300 text-stone-400"}`}
                        style={{ boxShadow: s.state !== "todo" ? `0 3px 0 0 ${s.state === "done" ? "#047857" : "#b45309"}` : "none" }}>
                        {s.state === "done" ? "✓" : s.emoji}
                      </div>
                      <div>
                        <div className={`text-[13px] font-extrabold ${s.state === "todo" ? "text-stone-400" : "text-stone-900"}`}>{s.label}</div>
                        <div className="text-[11px] text-stone-500 font-mono font-bold mt-0.5">{s.sub}</div>
                      </div>
                    </div>
                    {i < 2 && (
                      <div className="grid grid-cols-3 gap-1">
                        {[0,1,2].map(k => (
                          <div key={k} className="h-1.5 rounded-sm" style={{
                            background: i === 0 ? (k === 2 ? "#f59e0b" : "#10b981") : "#d6d3d1",
                          }} />
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* 길드장 정보 */}
              <div className="mt-8 p-4 rounded-lg bg-stone-50 border-2 border-stone-200 flex items-center gap-3 text-left">
                <CharBox name="유" color="#f59e0b" size={44} level={12} />
                <div className="flex-1">
                  <div className="text-[10px] text-stone-400 font-mono font-extrabold tracking-widest">현재 담당 길드장</div>
                  <div className="text-[14px] font-extrabold mt-0.5">
                    주먹펴고 일어서 <ChipG tone="amber" icon="🛡️">던전 탐험가</ChipG>
                  </div>
                  <div className="text-[12px] text-stone-500 mt-0.5">user@example.com</div>
                </div>
                <Btn variant="soft" size="sm" leftIcon={<span>📣</span>}>슬랙으로 알리기</Btn>
              </div>
            </div>
          </div>

          {/* 대기 중 미니 퀘스트 — 사전 온보딩 */}
          <div className="mt-6">
            <div className="text-[11px] font-extrabold text-stone-700 tracking-widest uppercase mb-3 flex items-center gap-2">
              <Gem scale={2} tone="amber" />
              승인 대기 중 챌린지 · 미리 +20 EXP 받기
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { ico: "📖", title: "길드 행동 강령 읽기", sub: "3분 소요", xp: 20 },
                { ico: "⚔️", title: "퀘스트 미리보기", sub: "샘플 작업 둘러보기", xp: 0 },
              ].map((c, i) => (
                <div key={i} className="p-4 rounded-lg bg-white border-2 border-stone-300 hover:border-amber-400 hover:shadow-[0_3px_0_0_#b45309] cursor-pointer transition-all flex items-center gap-3 group">
                  <div className="w-11 h-11 rounded-md bg-amber-100 border-2 border-amber-300 grid place-items-center text-[20px]">{c.ico}</div>
                  <div className="flex-1">
                    <div className="text-[13px] font-extrabold text-stone-900">{c.title}</div>
                    <div className="text-[11px] text-stone-500 font-mono font-bold mt-0.5">{c.sub}</div>
                  </div>
                  {c.xp > 0 && (
                    <ChipG tone="amber" icon={<Gem scale={1.5} tone="amber" />}>+{c.xp} EXP</ChipG>
                  )}
                  <span className="text-stone-400 group-hover:text-amber-600 transition-colors">{I.arrow(14)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes swing { 0%,100% { transform: rotate(-2deg) } 50% { transform: rotate(2deg) } }
        @keyframes sandfall { 0% { transform: translate(-50%, 0); opacity: 1 } 100% { transform: translate(-50%, 16px); opacity: 0 } }
      `}</style>
    </div>
  );
}

window.PendingV2 = PendingV2;
