// v2 — 로그인 (ZEP 스타일)
const { useState: useStateLoginV2 } = React;

function LoginV2() {
  const [email, setEmail] = useStateLoginV2("user@example.com");
  const [pw, setPw] = useStateLoginV2("");
  const [showPw, setShowPw] = useStateLoginV2(false);
  const [remember, setRemember] = useStateLoginV2(true);
  const [loading, setLoading] = useStateLoginV2(false);
  const [err, setErr] = useStateLoginV2(null);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!email || !pw) { setErr("이메일과 비밀번호를 모두 입력해 주세요."); return; }
    setErr(null); setLoading(true);
    setTimeout(() => { setLoading(false); setErr("이메일 또는 비밀번호가 일치하지 않습니다."); }, 800);
  };

  return (
    <div className="w-[1440px] h-[900px] bg-white text-stone-900 flex" style={{ fontFamily: T2.font.sans }}>
      {/* ========== LEFT — 폼 ========== */}
      <div className="w-[560px] flex flex-col justify-between px-16 py-12 border-r-2 border-stone-200 bg-white">
        <Logo size={32} />

        <form onSubmit={submit} className="max-w-[400px]">
          <div className="mb-7">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-amber-800 bg-amber-50 border-2 border-amber-400 rounded-md px-2 py-0.5 mb-4">
              <span className="w-1.5 h-1.5 bg-amber-500" />
              CHAPTER 02 · 봄 시즌 진행 중
            </div>
            <h1 className="text-[30px] font-black tracking-tight leading-[1.15] text-stone-900">
              다시 만나서 반가워요.
            </h1>
            <p className="text-[14px] text-stone-500 mt-2">
              어제 작업으로 <b className="text-amber-700">+240 EXP</b>를 쌓았어요. 이어서 시작해 볼까요?
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Field label="이메일" placeholder="name@example.com" icon={I.mail()} value={email} onChange={setEmail} autoFocus />
            <Field
              label="비밀번호"
              hint={<a className="text-amber-700 hover:text-amber-800 cursor-pointer font-bold">비밀번호 잊으셨나요?</a>}
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              icon={I.lock()}
              value={pw}
              onChange={setPw}
              error={err}
              right={
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="p-2 text-stone-400 hover:text-stone-600 transition-colors flex">
                  {showPw ? I.eyeOff() : I.eye()}
                </button>
              }
            />

            <div className="flex justify-between items-center mt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setRemember(!remember)}>
                <span className={`w-[18px] h-[18px] grid place-items-center text-white border-2 transition-colors
                  ${remember ? "bg-amber-400 border-amber-700" : "bg-white border-stone-300"}`}>
                  {remember && I.check(12)}
                </span>
                <span className="text-[13px] text-stone-700 font-medium">자동 입장</span>
              </label>
              <span className="text-[11px] text-stone-400 font-mono">↩ ENTER</span>
            </div>

            <Btn type="submit" variant="primary" size="lg" full disabled={loading} rightIcon={I.arrow()}>
              {loading ? "입장 중…" : "🏰 길드에 입장하기"}
            </Btn>
          </div>

          <div className="flex items-center gap-3 my-6 text-[11px] font-bold text-stone-400 uppercase tracking-widest">
            <div className="flex-1 h-[2px] bg-stone-200" />
            아직 길드원이 아닌가요?
            <div className="flex-1 h-[2px] bg-stone-200" />
          </div>

          <Btn variant="ghost" size="md" full leftIcon={<Key scale={2} />}>
            <span>초대코드로 가입하기</span>
          </Btn>

          <div className="mt-5 p-3 bg-stone-50 border-2 border-stone-200 rounded-md flex gap-2 text-[12px] text-stone-600">
            <div className="text-stone-400 pt-0.5">🛡️</div>
            <span><b className="text-stone-900">UD2 내부 전용</b> 워크스페이스 — 외부 접근은 감사 로그에 기록됩니다.</span>
          </div>
        </form>

        <div className="flex gap-4 text-[11px] text-stone-400 font-bold">
          <span>© 2026 UD2 Publishing</span>
          <a className="hover:text-stone-600 cursor-pointer">도움말</a>
          <a className="hover:text-stone-600 cursor-pointer">상태</a>
        </div>
      </div>

      {/* ========== RIGHT — 게임 사이드 ========== */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-b from-amber-50 via-amber-100 to-amber-50">
        {/* 도트 패턴 배경 */}
        <div className="absolute inset-0 opacity-50" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
          backgroundSize: "16px 16px",
          maskImage: "radial-gradient(800px 600px at 50% 40%, #000, transparent 75%)",
        }} />

        <div className="relative h-full flex flex-col justify-center items-center p-12">
          {/* 캐릭터 — 픽셀 마스코트 */}
          <div className="mb-6 relative">
            <div className="absolute inset-0 translate-y-2 bg-amber-300/60 rounded-full blur-xl" />
            <div style={{ animation: "bob 2.4s ease-in-out infinite" }}>
              <Hero scale={6} />
            </div>
            {/* 말풍선 */}
            <div className="absolute -top-2 -right-8 px-3 py-1.5 bg-white border-2 border-stone-800 rounded-md text-[12px] font-extrabold text-stone-800 whitespace-nowrap"
              style={{ boxShadow: "0 3px 0 0 #1c1917" }}>
              어서 와요!
              <div className="absolute -bottom-[6px] left-3 w-2 h-2 bg-white border-r-2 border-b-2 border-stone-800 rotate-45" />
            </div>
          </div>

          {/* 진척 카드 — 게임 상태창 */}
          <div className="w-[440px] bg-white border-2 border-stone-800 rounded-xl p-6"
            style={{ boxShadow: "0 6px 0 0 #1c1917" }}>
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-dashed border-stone-200">
              <div className="flex items-center gap-3">
                <CharBox name="유" color="#f59e0b" level={12} size={44} />
                <div>
                  <div className="text-[10px] text-stone-400 font-mono font-bold tracking-wider">WELCOME BACK</div>
                  <div className="text-[15px] font-extrabold text-stone-900 leading-tight">주먹펴고 일어서</div>
                  <ChipG tone="amber" icon="🛡️">던전 탐험가</ChipG>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-stone-400 font-mono font-bold">STREAK</div>
                <div className="text-[18px] font-black text-amber-600 leading-tight" style={{ fontFamily: T2.font.mono }}>🔥14</div>
              </div>
            </div>

            {/* EXP 바 */}
            <GameBar value={1240} max={1500} label="Lv. 12 · NEXT" sub="1,240 / 1,500 EXP" segments={20} />

            {/* 오늘의 퀘스트 */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-extrabold text-stone-700 tracking-widest uppercase">📜 오늘의 퀘스트</div>
                <span className="text-[11px] font-mono text-stone-500 font-bold">0 / 3</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { t: "메인 헤더 마크업 리뷰", xp: 60, urgent: true },
                  { t: "상품 카드 컴포넌트 마무리", xp: 120 },
                  { t: "QA 피드백 3건 반영", xp: 80 },
                ].map((q, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-stone-50 border-2 border-stone-200">
                    <div className="w-4 h-4 border-2 border-stone-400 bg-white flex-shrink-0" />
                    <div className="flex-1 text-[13px] text-stone-800 font-bold">{q.t}</div>
                    {q.urgent && <ChipG tone="red">D-1</ChipG>}
                    <span className="flex items-center gap-1 text-[11px] font-extrabold text-amber-700 font-mono">
                      <Gem scale={2} tone="amber" />+{q.xp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 길드 활동 */}
          <div className="mt-5 w-[440px] flex items-center gap-3 px-1">
            <div className="flex">
              {[{n:"조",c:"#0ea5e9"},{n:"조",c:"#10b981"},{n:"헌",c:"#f59e0b"},{n:"이",c:"#ef4444"}].map((p, i) => (
                <div key={i} style={{ marginLeft: i ? -8 : 0 }}>
                  <CharBox name={p.n} color={p.c} size={30} />
                </div>
              ))}
            </div>
            <div className="text-[12px] text-stone-600">
              <b className="text-stone-900">4명</b>이 지금 길드 안에서 작업 중 · 오늘 누적 <b className="text-amber-700">+820 EXP</b>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        `}</style>
      </div>
    </div>
  );
}

window.LoginV2 = LoginV2;
