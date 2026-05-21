// v2 — 회원가입 (ZEP 스타일 / 비밀 열쇠 입력)
const { useState: useStateSignupV2, useMemo: useMemoSignupV2, useRef: useRefSignupV2 } = React;

function SignupV2() {
  const [step, setStep] = useStateSignupV2(0);
  const [code, setCode] = useStateSignupV2(["", ""]);
  const [codeErr, setCodeErr] = useStateSignupV2(null);
  const [verifying, setVerifying] = useStateSignupV2(false);
  const [name, setName] = useStateSignupV2("");
  const [email, setEmail] = useStateSignupV2("");
  const [pw, setPw] = useStateSignupV2("");
  const [showPw, setShowPw] = useStateSignupV2(false);
  const [agree, setAgree] = useStateSignupV2(false);
  const r0 = useRefSignupV2(null);
  const r1 = useRefSignupV2(null);

  const codeJoined = code.join("");
  const codeFull = codeJoined.length === 8;

  const updateCode = (i, v) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const next = [...code]; next[i] = cleaned; setCode(next);
    setCodeErr(null);
    if (cleaned.length === 4 && i === 0) r1.current?.focus();
  };

  const verifyCode = () => {
    if (!codeFull) return;
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      if (codeJoined === "TESTTEST") { setCodeErr("유효하지 않은 초대코드입니다."); return; }
      setStep(1);
    }, 700);
  };

  const pwStrength = useMemoSignupV2(() => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }, [pw]);

  const pwLabel = ["", "취약", "보통", "양호", "강함"][pwStrength];
  const pwColor = ["#a8a29e", "#dc2626", "#f59e0b", "#0ea5e9", "#10b981"][pwStrength];

  const filled = [name.length >= 2, /\S+@\S+\.\S+/.test(email), pwStrength >= 2, agree].filter(Boolean).length;
  const formValid = filled === 4;

  return (
    <div className="w-[1440px] h-[900px] bg-white text-stone-900 flex" style={{ fontFamily: T2.font.sans }}>
      {/* ========== LEFT — 폼 ========== */}
      <div className="w-[640px] flex flex-col justify-between px-16 py-10 border-r-2 border-stone-200">
        <div className="flex items-center justify-between">
          <Logo size={32} />
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-bold">
            <span className={step === 0 ? "text-amber-700" : ""}>STEP 01 · 열쇠</span>
            <span>›</span>
            <span className={step === 1 ? "text-amber-700" : ""}>STEP 02 · 모험가 정보</span>
          </div>
        </div>

        <div className="max-w-[460px] -mt-8">
          {/* ========== STEP 1: 비밀 열쇠 ========== */}
          {step === 0 && (
            <div>
              <div className="text-[11px] text-amber-700 font-extrabold mb-2 tracking-widest">CHAPTER 01 · INVITATION</div>
              <h1 className="text-[30px] font-black tracking-tight leading-[1.15]">
                비밀 열쇠를 입력하세요.
              </h1>
              <p className="text-[14px] text-stone-500 mt-2 mb-7">
                길드장이 발급한 <b className="text-stone-700">8자리 열쇠 코드</b>로 잠긴 문을 열 수 있어요.
              </p>

              <div className="mb-2 flex justify-between items-baseline">
                <span className="text-[12px] font-extrabold text-stone-700 tracking-tight">🔑 비밀 열쇠 코드</span>
                <span className="text-[11px] font-mono font-bold text-stone-400">4 + 4 · A-Z / 0-9</span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={r0}
                  value={code[0]}
                  onChange={(e) => updateCode(0, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && code[0].length === 4 && r1.current?.focus()}
                  maxLength={4}
                  placeholder="XXXX"
                  autoFocus
                  className={`flex-1 h-16 text-center font-black text-[26px] tracking-[0.18em] uppercase rounded-lg bg-white outline-none transition-all border-[3px]
                    ${codeErr ? "border-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]" :
                      code[0].length === 4 ? "border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(245,158,11,0.2)]" : "border-stone-300"}`}
                  style={{ fontFamily: T2.font.mono }}
                />
                <span className="text-stone-300 font-black text-2xl">—</span>
                <input
                  ref={r1}
                  value={code[1]}
                  onChange={(e) => updateCode(1, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && codeFull && verifyCode()}
                  maxLength={4}
                  placeholder="XXXX"
                  className={`flex-1 h-16 text-center font-black text-[26px] tracking-[0.18em] uppercase rounded-lg bg-white outline-none transition-all border-[3px]
                    ${codeErr ? "border-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]" :
                      code[1].length === 4 ? "border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(245,158,11,0.2)]" : "border-stone-300"}`}
                  style={{ fontFamily: T2.font.mono }}
                />
              </div>

              {codeErr && (
                <div className="mt-2 text-[12px] text-red-600 font-bold flex gap-1 items-center">⚠ {codeErr}</div>
              )}

              <div className="mt-3 text-[11px] font-bold text-stone-500 flex items-center gap-1.5">
                🛡️ 열쇠는 1회만 사용 가능 · 5회 실패 시 IP 일시 차단
              </div>

              <div className="mt-6">
                <Btn variant="primary" size="lg" full disabled={!codeFull || verifying} onClick={verifyCode} rightIcon={I.arrow()}>
                  {verifying ? "열쇠 확인 중…" : "🔓 봉인 해제"}
                </Btn>
              </div>

              <div className="mt-7 p-4 rounded-lg bg-amber-50 border-2 border-amber-300">
                <div className="flex items-start gap-3">
                  <Scroll scale={3} />
                  <div className="text-[12px] text-amber-900 leading-relaxed">
                    <b className="text-stone-900">열쇠가 없으신가요?</b><br/>
                    길드장(관리자)에게 열쇠 발급을 요청하세요. 슬랙 <span className="font-mono font-bold">#ud2-onboarding</span> 채널에서도 받을 수 있어요.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========== STEP 2: 모험가 정보 ========== */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] text-amber-700 font-extrabold tracking-widest">CHAPTER 02 · PROFILE</span>
                <ChipG tone="green" icon={I.check(10)}>봉인 해제됨</ChipG>
              </div>
              <h1 className="text-[28px] font-black tracking-tight leading-[1.2]">
                모험가 정보 등록
              </h1>
              <p className="text-[13px] text-stone-500 mt-1 mb-4">
                길드장이 신청을 검토하고 승인하면 정식 길드원이 돼요.
              </p>

              {/* 가입 진행도 게임 바 */}
              <div className="mb-5">
                <GameBar value={filled} max={4} segments={12} label="가입 진척도" sub={`${filled} / 4`} />
              </div>

              <div className="flex flex-col gap-3">
                <Field label="이름" placeholder="홍길동" icon={I.user()} value={name} onChange={setName}
                  hint={name.length >= 2 ? <span className="text-emerald-600 font-bold">✓ 확인</span> : "2자 이상"} autoFocus />
                <Field label="이메일" placeholder="name@ud2.co" icon={I.mail()} value={email} onChange={setEmail}
                  hint={/\S+@\S+\.\S+/.test(email) ? <span className="text-emerald-600 font-bold">✓ 확인</span> : "회사 이메일 권장"} />
                <div>
                  <Field
                    label="비밀번호"
                    type={showPw ? "text" : "password"}
                    placeholder="8자 이상, 대문자/숫자 포함"
                    icon={I.lock()}
                    value={pw}
                    onChange={setPw}
                    right={
                      <button type="button" onClick={() => setShowPw(!showPw)}
                        className="p-2 text-stone-400 hover:text-stone-600 flex">
                        {showPw ? I.eyeOff() : I.eye()}
                      </button>
                    }
                  />
                  {pw && (
                    <div className="mt-2 flex gap-1 items-center">
                      {[0,1,2,3].map(i => (
                        <div key={i} className="flex-1 h-1.5 rounded-[1px] border" style={{
                          background: i < pwStrength ? pwColor : "#e7e5e4",
                          borderColor: i < pwStrength ? pwColor : "#d6d3d1",
                        }} />
                      ))}
                      <span className="text-[11px] font-extrabold ml-2 w-12 text-right font-mono" style={{ color: pwColor }}>{pwLabel}</span>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2.5 mt-1 cursor-pointer select-none" onClick={() => setAgree(!agree)}>
                  <span className={`mt-0.5 w-[18px] h-[18px] grid place-items-center text-white flex-shrink-0 border-2 transition-colors
                    ${agree ? "bg-amber-400 border-amber-700" : "bg-white border-stone-300"}`}>
                    {agree && I.check(12)}
                  </span>
                  <span className="text-[12px] text-stone-600 leading-relaxed">
                    <b className="text-stone-900">길드 행동 강령</b>과 <b className="text-stone-900">개인정보 처리방침</b>에 동의하며,
                    내 작업 활동이 길드원에게 표시될 수 있다는 점에 동의합니다.
                  </span>
                </label>

                <div className="flex gap-2 mt-2">
                  <Btn variant="ghost" size="lg" onClick={() => setStep(0)}>← 이전</Btn>
                  <Btn variant="primary" size="lg" full disabled={!formValid} rightIcon={I.arrow()}>
                    📜 가입 신청서 제출
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between text-[12px] text-stone-400 font-bold">
          <span>이미 길드원? <a className="text-amber-700 cursor-pointer">로그인</a></span>
          <span>© 2026 UD2</span>
        </div>
      </div>

      {/* ========== RIGHT — 초대장 비주얼 ========== */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100/40 to-stone-50">
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
          backgroundSize: "16px 16px",
          maskImage: "radial-gradient(700px 600px at 60% 40%, #000, transparent 75%)",
        }} />

        <div className="relative h-full flex flex-col justify-center items-center p-12">
          {/* 픽셀 스프라이트 */}
          <div className="mb-8 flex items-end gap-6">
            <div style={{ animation: "wobble 3s ease-in-out infinite" }}>
              {step === 0 ? <Key scale={6} /> : <Scroll scale={6} />}
            </div>
          </div>

          {/* 초대장 카드 — 게임 윈도우 스타일 */}
          <div className="w-[440px] bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
            style={{ boxShadow: "0 6px 0 0 #1c1917" }}>
            {/* 헤더 바 — 픽셀 톱니 */}
            <div className="h-7 bg-amber-400 border-b-2 border-stone-800 grid place-items-center">
              <div className="text-[10px] font-extrabold text-amber-950 tracking-widest font-mono">★ INVITATION FROM GUILD MASTER ★</div>
            </div>

            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="text-[10px] text-amber-700 font-mono font-extrabold tracking-widest">UD2 WORKSPACE</div>
                  <div className="text-[20px] font-black tracking-tight text-stone-900 mt-1">퍼블리싱팀 길드</div>
                  <div className="text-[12px] text-stone-500 mt-0.5">Markup Story · 봄 시즌</div>
                </div>
                <Shield scale={3} />
              </div>

              <div className="text-[10px] text-stone-400 font-mono font-bold mb-1.5 tracking-widest">길드장</div>
              <div className="flex items-center gap-2 mb-5">
                <CharBox name="유" color="#f59e0b" size={32} level={12} />
                <div className="text-[13px]">
                  <b className="text-stone-900">김유정</b>
                  <span className="text-stone-500"> · 길드장 (Admin)</span>
                </div>
              </div>

              <div className="border-t-2 border-dashed border-stone-200 pt-4 grid grid-cols-3 gap-2.5">
                {[
                  { l: "VALID", v: "26.06.10" },
                  { l: "SLOTS", v: "3 / 5" },
                  { l: "START", v: "Lv. 1", tone: "amber" },
                ].map((m, i) => (
                  <div key={i} className="bg-stone-50 border-2 border-stone-200 rounded-md p-2 text-center">
                    <div className="text-[9px] text-stone-400 font-mono font-extrabold mb-1">{m.l}</div>
                    <div className="text-[12px] font-mono font-extrabold text-stone-900">{m.v}</div>
                  </div>
                ))}
              </div>

              {/* 입력된 코드 시각화 */}
              <div className="mt-5 pt-4 border-t-2 border-dashed border-stone-200">
                <div className="text-[10px] text-stone-400 font-mono font-extrabold mb-2 tracking-widest">
                  {step === 0 ? "YOUR KEY · 좌측에 입력" : "✓ KEY VERIFIED"}
                </div>
                <div className="flex items-center gap-1.5 justify-center">
                  {(code[0] + "----").slice(0, 4).split("").map((c, i) => (
                    <div key={i} className={`w-8 h-10 grid place-items-center font-black text-[18px] border-2 rounded font-mono
                      ${code[0][i] ? "bg-amber-100 border-amber-500 text-amber-900" : "bg-stone-50 border-stone-300 text-stone-300"}`}>
                      {code[0][i] || "·"}
                    </div>
                  ))}
                  <span className="text-stone-400 font-black mx-0.5">—</span>
                  {(code[1] + "----").slice(0, 4).split("").map((c, i) => (
                    <div key={i} className={`w-8 h-10 grid place-items-center font-black text-[18px] border-2 rounded font-mono
                      ${code[1][i] ? "bg-amber-100 border-amber-500 text-amber-900" : "bg-stone-50 border-stone-300 text-stone-300"}`}>
                      {code[1][i] || "·"}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 길드원 미리보기 */}
          <div className="w-[440px] mt-6 flex items-center gap-3 text-[12px] text-stone-600">
            <div className="flex">
              {[
                {n:"유",c:"#f59e0b",lv:12},
                {n:"수",c:"#0ea5e9",lv:9},
                {n:"민",c:"#10b981",lv:7},
                {n:"지",c:"#ef4444",lv:6},
              ].map((p, i) => (
                <div key={i} style={{ marginLeft: i ? -10 : 0 }}>
                  <CharBox name={p.n} color={p.c} size={36} level={p.lv} />
                </div>
              ))}
            </div>
            <div>
              <b className="text-stone-900">4명의 길드원</b>이 새 동료를 기다려요
            </div>
          </div>
        </div>

        <style>{`
          @keyframes wobble { 0%,100% { transform: rotate(-3deg) translateY(0) } 50% { transform: rotate(3deg) translateY(-4px) } }
        `}</style>
      </div>
    </div>
  );
}

window.SignupV2 = SignupV2;
