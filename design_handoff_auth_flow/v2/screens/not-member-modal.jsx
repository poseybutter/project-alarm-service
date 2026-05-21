// v2 — "길드원이 아니에요!" 모달 (구글 로그인 후 초대코드 없는 사람)
const { useState: useStateNotMember, useRef: useRefNotMember } = React;

function NotMemberModal() {
  const [code, setCode] = useStateNotMember(["", ""]);
  const [err, setErr] = useStateNotMember(null);
  const [verifying, setVerifying] = useStateNotMember(false);
  const r0 = useRefNotMember(null);
  const r1 = useRefNotMember(null);

  const codeFull = code[0].length === 4 && code[1].length === 4;

  const updateCode = (i, v) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const next = [...code]; next[i] = cleaned; setCode(next);
    setErr(null);
    if (cleaned.length === 4 && i === 0) r1.current?.focus();
  };

  const verify = () => {
    if (!codeFull) return;
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      if (code.join("") === "INVALID0") { setErr("유효하지 않은 초대코드입니다."); return; }
      // 성공 → /guild-join 라우팅 (실제 구현)
    }, 700);
  };

  return (
    <div className="w-[1440px] h-[900px] relative" style={{ fontFamily: T2.font.sans }}>
      {/* 배경 — 로그인 직후 화면 흐릿하게 */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-50 via-white to-stone-50">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }} />
      </div>

      {/* Dim overlay */}
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="w-[480px] bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
          style={{ boxShadow: "0 8px 0 0 #1c1917" }}>

          {/* 타이틀 바 */}
          <div className="h-9 bg-red-400 border-b-2 border-stone-800 grid place-items-center relative">
            <div className="text-[11px] font-extrabold text-red-950 tracking-widest font-mono">
              ★ ACCESS DENIED · 잠긴 문 ★
            </div>
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-700 hover:bg-red-800 border-2 border-red-900 grid place-items-center text-white font-black text-[10px] rounded-sm">
              ✕
            </button>
          </div>

          <div className="p-7">
            {/* 픽셀 자물쇠 + 흔들림 애니메이션 */}
            <div className="flex justify-center mb-4">
              <div style={{ animation: "shake 0.6s ease-in-out" }}>
                <Locked scale={4} />
              </div>
            </div>

            <h2 className="text-[22px] font-black tracking-tight text-stone-900 text-center mb-1.5">
              길드원이 아니에요!
            </h2>
            <p className="text-[13px] text-stone-600 leading-relaxed text-center mb-5">
              이 워크스페이스는 <b className="text-stone-900">초대코드가 있는 모험가</b>만 입장할 수 있어요.<br/>
              길드장이 발급한 8자리 열쇠를 입력해 봉인을 풀어보세요.
            </p>

            {/* 코드 입력 */}
            <div className="mb-2 flex justify-between items-baseline">
              <span className="text-[11px] font-extrabold text-stone-700 tracking-widest flex items-center gap-1.5">🔑 비밀 열쇠 코드</span>
              <span className="text-[10px] font-mono font-bold text-stone-400">4 + 4</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={r0}
                value={code[0]}
                onChange={(e) => updateCode(0, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && code[0].length === 4 && r1.current?.focus()}
                maxLength={4}
                placeholder="XXXX"
                autoFocus
                className={`flex-1 h-14 text-center font-black text-[22px] tracking-[0.18em] uppercase rounded-lg bg-white outline-none transition-all border-[3px]
                  ${err ? "border-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]" :
                    code[0].length === 4 ? "border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]" : "border-stone-300"}`}
                style={{ fontFamily: T2.font.mono }}
              />
              <span className="text-stone-300 font-black text-xl">—</span>
              <input
                ref={r1}
                value={code[1]}
                onChange={(e) => updateCode(1, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && codeFull && verify()}
                maxLength={4}
                placeholder="XXXX"
                className={`flex-1 h-14 text-center font-black text-[22px] tracking-[0.18em] uppercase rounded-lg bg-white outline-none transition-all border-[3px]
                  ${err ? "border-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]" :
                    code[1].length === 4 ? "border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]" : "border-stone-300"}`}
                style={{ fontFamily: T2.font.mono }}
              />
            </div>

            {err && (
              <div className="mt-2 text-[12px] text-red-600 font-bold flex gap-1 items-center">⚠ {err}</div>
            )}

            <div className="mt-3 text-[11px] font-bold text-stone-500 flex items-center gap-1.5">
              🛡️ 열쇠는 1회만 사용 가능 · 5회 실패 시 IP 일시 차단
            </div>

            {/* 액션 */}
            <div className="flex gap-2 mt-5">
              <Btn variant="ghost" size="md">닫기</Btn>
              <Btn variant="primary" size="md" full disabled={!codeFull || verifying} onClick={verify}>
                {verifying ? "열쇠 확인 중…" : "🔓 봉인 해제"}
              </Btn>
            </div>

            {/* 안내 */}
            <div className="mt-5 p-3 rounded-md bg-stone-50 border-2 border-stone-200 flex gap-2.5 items-start">
              <Scroll scale={2} />
              <div className="text-[11.5px] text-stone-600 leading-relaxed">
                <b className="text-stone-900">초대코드가 없으신가요?</b><br/>
                팀 관리자에게 발급을 요청하거나, 슬랙 <span className="font-mono font-bold text-stone-800">#ud2-onboarding</span>에서 도움을 받으세요.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          25% { transform: translateX(-6px) rotate(-2deg) }
          75% { transform: translateX(6px) rotate(2deg) }
        }
      `}</style>
    </div>
  );
}

window.NotMemberModal = NotMemberModal;
