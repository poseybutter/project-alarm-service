// v2 — 관리자 멤버 승인 (개편) — 우측에 초대코드 발급 패널 추가
const { useState: useStateAdmin2, useMemo: useMemoAdmin2 } = React;

const TEAMS2 = [
  { id: "publishing", name: "퍼블리싱팀", icon: "🎨" },
  { id: "frontend",   name: "프론트엔드팀", icon: "💻" },
  { id: "backend",    name: "백엔드팀",    icon: "🛠️" },
  { id: "design",     name: "디자인팀",    icon: "✏️" },
  { id: "qa",         name: "QA팀",       icon: "🔍" },
];

const PENDING_PLAYERS = [
  { id: 1, name: "박지훈", email: "jihoon@ud2.co", teamId: "publishing",
    appliedAt: "오늘 14:22", elapsed: "8분 전", code: "Q3R7-K2MN",
    bio: "디자인팀 추천으로 신청합니다. 퍼블리싱 8년차예요. 잘 부탁드려요!",
    issuedBy: "김유정", issuedAt: "어제 09:14", expiresAt: "26.06.10", risk: "low", domain: true,
  },
  { id: 2, name: "이수민", email: "sumin@ud2.co", teamId: "qa",
    appliedAt: "오늘 11:08", elapsed: "3시간 전", code: "BG8T-V1WS",
    bio: "", issuedBy: "김유정", issuedAt: "어제 13:00", expiresAt: "26.05.30", risk: "low", domain: true,
  },
  { id: 3, name: "Alex Kim", email: "alex.kim@gmail.com", teamId: "frontend",
    appliedAt: "어제 18:41", elapsed: "20시간 전", code: "ZZ00-1111",
    bio: "프리랜서로 같이 작업했던 분이에요. 외부지만 신뢰할 수 있어요.",
    issuedBy: "박민서", issuedAt: "그저께 10:30", expiresAt: "26.06.01", risk: "high", domain: false,
  },
  { id: 4, name: "최유나", email: "yuna@ud2.co", teamId: "publishing",
    appliedAt: "어제 09:30", elapsed: "30시간 전", code: "M4VC-X5LO",
    bio: "신입입니다. 잘 부탁드려요! 🔥 빨리 적응하겠습니다.",
    issuedBy: "김유정", issuedAt: "이틀 전 09:00", expiresAt: "26.05.25", risk: "low", domain: true,
  },
];

const ISSUED_CODES = [
  { code: "K9B4-M2QT", teamId: "frontend",   expiresAt: "26.06.20", used: false, issuedAt: "오늘 10:15" },
  { code: "P5L1-N8RX", teamId: "publishing", expiresAt: "26.06.15", used: false, issuedAt: "어제 17:30" },
  { code: "Q3R7-K2MN", teamId: "publishing", expiresAt: "26.06.10", used: true,  issuedAt: "어제 09:14", usedBy: "박지훈" },
  { code: "BG8T-V1WS", teamId: "qa",         expiresAt: "26.05.30", used: true,  issuedAt: "어제 13:00", usedBy: "이수민" },
  { code: "T6Z9-W3HC", teamId: "design",     expiresAt: "26.05.22", used: false, issuedAt: "이틀 전 14:00", expired: true },
];

function AdminV2() {
  const [filter, setFilter] = useStateAdmin2("all");
  const [search, setSearch] = useStateAdmin2("");
  const [selected, setSelected] = useStateAdmin2(1);
  const [decided, setDecided] = useStateAdmin2({});
  const [confirm, setConfirm] = useStateAdmin2(null);
  const [issueTeam, setIssueTeam] = useStateAdmin2("publishing");
  const [issueExpiry, setIssueExpiry] = useStateAdmin2("7");
  const [newCode, setNewCode] = useStateAdmin2(null);
  const [codeFilter, setCodeFilter] = useStateAdmin2("active"); // active / used / expired

  const list = useMemoAdmin2(() => PENDING_PLAYERS.filter((p) => {
    if (filter === "risk" && p.risk !== "high") return false;
    if (filter === "today" && !p.appliedAt.startsWith("오늘")) return false;
    if (search && !(p.name.includes(search) || p.email.includes(search))) return false;
    return true;
  }), [filter, search]);

  const cur = PENDING_PLAYERS.find((p) => p.id === selected);
  const curTeam = TEAMS2.find(t => t.id === cur?.teamId);
  const status = decided[selected];

  const filteredCodes = ISSUED_CODES.filter((c) => {
    if (codeFilter === "active") return !c.used && !c.expired;
    if (codeFilter === "used") return c.used;
    if (codeFilter === "expired") return c.expired;
    return true;
  });

  const decide = (action) => { setDecided({ ...decided, [selected]: action }); setConfirm(null); };

  const issueNew = () => {
    const segs = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const gen = () => Array.from({ length: 4 }, () => segs[Math.floor(Math.random() * segs.length)]).join("");
    setNewCode(`${gen()}-${gen()}`);
  };

  return (
    <div className="w-[1440px] h-[900px] bg-white text-stone-900 grid grid-rows-[60px_1fr]" style={{ fontFamily: T2.font.sans }}>
      {/* ========== 헤더 ========== */}
      <div className="flex items-center justify-between px-5 border-b-2 border-stone-800 bg-amber-50">
        <div className="flex items-center gap-3">
          <Logo size={26} withText={false} />
          <div className="flex items-center gap-2">
            <Shield scale={2.5} />
            <div>
              <div className="text-[14px] font-black tracking-tight leading-tight">모험가 심사</div>
              <div className="text-[10px] text-amber-700 font-mono font-extrabold tracking-widest">GUILD MASTER · ADMIN</div>
            </div>
          </div>
          <div className="w-px h-6 bg-stone-300 ml-2" />
          {["📊 대시보드", "📜 퀘스트", "🛡️ 길드원", "⚙️ 설정"].map((t, i) => (
            <button key={t} className={`text-[12px] px-2.5 py-1.5 rounded-md font-extrabold transition-colors border-2
              ${i === 2 ? "bg-white border-stone-800 text-stone-900" : "border-transparent text-stone-500 hover:bg-amber-100"}`}>
              {t}
              {i === 2 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black bg-red-500 text-white border border-red-700 rounded">
                  {PENDING_PLAYERS.length - Object.keys(decided).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ChipG tone="amber" icon="🔥">14일</ChipG>
          <CharBox name="유" color="#f59e0b" size={32} level={12} />
          <div className="text-[12px] font-extrabold">김유정 <span className="text-stone-500 font-normal">· 길드장</span></div>
        </div>
      </div>

      <div className="grid grid-cols-[300px_1fr_380px] overflow-hidden">
        {/* ========== LEFT — 신청자 목록 ========== */}
        <div className="border-r-2 border-stone-200 bg-stone-50 flex flex-col">
          <div className="p-4 pb-2">
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="text-[16px] font-black tracking-tight flex items-center gap-1.5">📜 가입 신청서</h2>
              <span className="text-[11px] font-mono font-extrabold text-stone-500">{list.length} / {PENDING_PLAYERS.length}</span>
            </div>
            <Field placeholder="이름 또는 이메일" icon={I.search()} value={search} onChange={setSearch} />
            <div className="flex gap-1 mt-2 p-1 bg-white rounded-md border-2 border-stone-200">
              {[
                { k: "all", l: "전체" },
                { k: "today", l: "오늘" },
                { k: "risk", l: "주의", count: PENDING_PLAYERS.filter(p => p.risk === "high").length },
              ].map((f) => (
                <button key={f.k} onClick={() => setFilter(f.k)}
                  className={`flex-1 px-2 py-1.5 text-[12px] font-extrabold rounded-sm transition-colors flex items-center justify-center gap-1.5
                    ${filter === f.k ? "bg-amber-400 text-amber-950 border-2 border-amber-700 shadow-[0_2px_0_0_#b45309]" : "text-stone-500 hover:text-stone-700 border-2 border-transparent"}`}>
                  {f.l}
                  {f.count > 0 && <span className="text-[10px] bg-red-500 text-white px-1.5 rounded font-black border border-red-700">{f.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 pb-4 pt-1">
            {list.map((p) => {
              const st = decided[p.id];
              const isSel = selected === p.id;
              const team = TEAMS2.find(t => t.id === p.teamId);
              return (
                <div key={p.id} onClick={() => setSelected(p.id)}
                  className={`p-2.5 rounded-md cursor-pointer mb-1.5 flex gap-2.5 items-center transition-all border-2
                    ${isSel ? "bg-white border-amber-400 shadow-[0_2px_0_0_#b45309]" : "border-transparent hover:bg-white/70 hover:border-stone-200"}
                    ${st ? "opacity-60" : ""}`}>
                  <CharBox name={p.name} color={p.risk === "high" ? "#ef4444" : "#0ea5e9"} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <div className="text-[13px] font-extrabold text-stone-900 truncate">{p.name}</div>
                      {p.risk === "high" && <ChipG tone="red">주의</ChipG>}
                      {st === "approved" && <ChipG tone="green">입장</ChipG>}
                      {st === "rejected" && <ChipG tone="gray">거부</ChipG>}
                    </div>
                    <div className="text-[10px] text-stone-500 truncate flex items-center gap-1">
                      <span className="text-[11px]">{team.icon}</span>
                      <span className="font-bold">{team.name}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-stone-400 font-mono font-bold whitespace-nowrap">{p.elapsed}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========== CENTER — 상세 ========== */}
        <div className="overflow-auto relative">
          {cur && (
            <div className="p-7 pb-24">
              <div className="flex items-center gap-2 mb-4 text-[11px] text-stone-400 font-mono font-bold">
                <span>#UD2-{String(cur.id).padStart(5, "0")}</span>
                <span>·</span>
                <span>{cur.appliedAt} 신청 ({cur.elapsed})</span>
              </div>

              {/* 모험가 카드 */}
              <div className="rounded-xl border-2 border-stone-800 p-6 mb-5 bg-gradient-to-br from-amber-50 via-white to-white"
                style={{ boxShadow: "0 6px 0 0 #1c1917" }}>
                <div className="flex gap-5 items-start">
                  <div className="relative">
                    <CharBox name={cur.name} size={84} color={cur.risk === "high" ? "#ef4444" : "#0ea5e9"} />
                    <div className="absolute -top-3 -left-3 bg-stone-100 border-2 border-stone-400 rounded text-[9px] font-black text-stone-600 px-1.5 py-0.5 font-mono">
                      NEW
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-mono font-extrabold text-stone-400 tracking-widest">APPLICANT</div>
                    <div className="text-[26px] font-black tracking-tight leading-tight mt-0.5">{cur.name}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <ChipG tone="amber" icon={curTeam?.icon}>{curTeam?.name}</ChipG>
                      <ChipG tone="gray" icon="🌱">Lv. 0 지망생</ChipG>
                      {!cur.domain && <ChipG tone="red">외부 도메인</ChipG>}
                    </div>
                    <div className="text-[12px] text-stone-500 font-mono font-bold mt-1.5">{cur.email}</div>
                  </div>

                  {status && (
                    <div className={`px-3 py-1.5 rounded-md text-[12px] font-black border-2
                      ${status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-500" : "bg-stone-100 text-stone-600 border-stone-400"}`}>
                      {status === "approved" ? "✓ 입장 허가됨" : "✕ 입장 거부됨"}
                    </div>
                  )}
                </div>
              </div>

              {/* 각오 한마디 */}
              {cur.bio && (
                <div className="mb-5">
                  <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">
                    📝 각오 한마디
                    <ChipG tone="gray">🛡️ 길드장 전용</ChipG>
                  </div>
                  <div className="p-4 rounded-md bg-amber-50 border-2 border-amber-300 text-[14px] text-stone-800 leading-relaxed font-medium">
                    "{cur.bio}"
                  </div>
                </div>
              )}

              {/* 자동 보안 검증 — 초대코드 중심 */}
              <div className="mb-5">
                <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">🛡️ 초대코드 검증</div>
                <div className="rounded-md bg-white border-2 border-stone-300 overflow-hidden">
                  {/* 코드 표시 */}
                  <div className="p-4 bg-stone-50 border-b-2 border-stone-200 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-stone-400 font-mono font-extrabold tracking-widest mb-1">사용한 열쇠</div>
                      <div className="text-[20px] font-black font-mono tracking-[0.18em] text-stone-900">{cur.code}</div>
                    </div>
                    <Key scale={3} />
                  </div>

                  {/* 검증 항목 */}
                  <div className="divide-y-2 divide-stone-100">
                    {[
                      { ok: true, label: "발급자", detail: `${cur.issuedBy} 길드장 · ${cur.issuedAt} 발급` },
                      { ok: true, label: "만료일", detail: `${cur.expiresAt} 까지 유효 (만료 전)` },
                      { ok: cur.domain, label: "회사 도메인 (@ud2.co)", detail: cur.domain ? "확인됨" : "외부 도메인 — 추천인 확인 필요" },
                      { ok: cur.risk === "low", label: "중복 신청 없음", detail: cur.risk === "low" ? "확인됨" : "동일 이메일 2회 시도 이력" },
                    ].map((c, i) => (
                      <div key={i} className="flex gap-2.5 items-start py-2.5 px-3.5">
                        <div className={`w-5 h-5 rounded grid place-items-center flex-shrink-0 mt-0.5 border-2 font-black text-[11px]
                          ${c.ok ? "bg-emerald-100 text-emerald-700 border-emerald-500" : "bg-red-100 text-red-700 border-red-500"}`}>
                          {c.ok ? "✓" : "✕"}
                        </div>
                        <div className="flex-1">
                          <div className={`text-[13px] font-extrabold ${c.ok ? "text-stone-900" : "text-red-700"}`}>{c.label}</div>
                          <div className="text-[12px] text-stone-500 mt-0.5">{c.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 액션 바 */}
          {cur && !status && (
            <div className="absolute bottom-0 left-0 right-0 px-7 py-4 bg-white border-t-2 border-stone-300 flex items-center gap-2">
              <Btn variant="danger" size="md" onClick={() => setConfirm("rejected")} leftIcon="🚫">
                입장 거부
              </Btn>
              <div className="flex-1" />
              <span className="text-[11px] text-stone-400 mr-2 font-mono font-bold">⌘ + ↵ 빠른 승인</span>
              <Btn variant="success" size="md" onClick={() => setConfirm("approved")} leftIcon="🎉">
                입장 허가
              </Btn>
            </div>
          )}
          {cur && status && (
            <div className="absolute bottom-0 left-0 right-0 px-7 py-4 bg-white border-t-2 border-stone-300 flex items-center justify-between">
              <div className={`text-[13px] font-extrabold ${status === "approved" ? "text-emerald-700" : "text-stone-600"}`}>
                {status === "approved"
                  ? `🎉 ${cur.name}님이 ${curTeam?.name}에 합류했어요. 환영 알림 발송됨.`
                  : `🚫 ${cur.name}님의 입장을 거부했어요. 신청자에게 알림 발송됨.`}
              </div>
              <Btn variant="ghost" size="sm" onClick={() => { const d = { ...decided }; delete d[selected]; setDecided(d); }}>↩ 되돌리기</Btn>
            </div>
          )}

          {/* 확인 모달 */}
          {confirm && cur && (
            <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm grid place-items-center p-6 z-10" onClick={() => setConfirm(null)}>
              <div onClick={(e) => e.stopPropagation()} className="w-[440px] rounded-xl bg-white border-2 border-stone-800 overflow-hidden"
                style={{ boxShadow: "0 8px 0 0 #1c1917" }}>
                <div className={`h-9 grid place-items-center border-b-2 border-stone-800 text-[11px] font-extrabold tracking-widest font-mono
                  ${confirm === "approved" ? "bg-emerald-400 text-emerald-950" : "bg-red-400 text-red-950"}`}>
                  ★ {confirm === "approved" ? "ENTRY APPROVAL" : "ENTRY REJECTION"} ★
                </div>
                <div className="p-6 text-center">
                  <div className="text-[44px] leading-none mb-3">{confirm === "approved" ? "🎉" : "🚫"}</div>
                  <h3 className="text-[18px] font-black tracking-tight mb-1.5">
                    {confirm === "approved" ? `${cur.name}님을 ${curTeam?.name}에 합류시킬까요?` : `${cur.name}님의 입장을 거부할까요?`}
                  </h3>
                  <p className="text-[13px] text-stone-500 leading-relaxed mb-5">
                    {confirm === "approved"
                      ? "승인 즉시 워크스페이스에 입장하고, 모든 길드원에게 합류 알림이 갑니다."
                      : "신청자에게 거부 알림이 발송되며, 같은 이메일로는 30일 동안 재신청할 수 없어요."}
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Btn variant="ghost" size="md" onClick={() => setConfirm(null)}>취소</Btn>
                    <Btn variant={confirm === "approved" ? "success" : "danger"} size="md" onClick={() => decide(confirm)}>
                      {confirm === "approved" ? "✓ 입장 허가" : "✕ 입장 거부"}
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== RIGHT — 초대코드 발급 + 목록 ========== */}
        <div className="border-l-2 border-stone-200 bg-stone-50 flex flex-col overflow-hidden">
          {/* 발급 패널 */}
          <div className="p-5 border-b-2 border-stone-200 bg-white">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-extrabold flex items-center gap-1.5">
                <Key scale={2} /> 새 열쇠 발급
              </div>
              <ChipG tone="amber">길드장 권한</ChipG>
            </div>

            {newCode ? (
              <div className="mb-3">
                <div className="text-[10px] text-stone-400 font-mono font-extrabold tracking-widest mb-1.5">✓ NEW KEY ISSUED</div>
                <div className="p-3 bg-amber-50 border-2 border-amber-400 rounded-md flex items-center justify-between gap-2"
                  style={{ boxShadow: "0 3px 0 0 #b45309" }}>
                  <div className="text-[18px] font-black font-mono tracking-[0.18em] text-amber-950">{newCode}</div>
                  <button onClick={() => navigator.clipboard?.writeText(newCode)}
                    className="text-[11px] font-extrabold text-amber-700 hover:text-amber-900 px-2 py-1 rounded border-2 border-amber-400 bg-white">
                    📋 복사
                  </button>
                </div>
                <button onClick={() => setNewCode(null)}
                  className="mt-2 text-[11px] font-bold text-stone-500 hover:text-stone-700">
                  ↺ 다시 발급
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* 팀 선택 */}
                <div>
                  <div className="text-[11px] font-extrabold text-stone-600 mb-1">대상 팀</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TEAMS2.slice(0, 3).map((t) => (
                      <button key={t.id} onClick={() => setIssueTeam(t.id)}
                        className={`px-2 py-1.5 rounded-md text-[11.5px] font-extrabold border-2 transition-all flex items-center justify-center gap-1
                          ${issueTeam === t.id ? "bg-amber-100 border-amber-500 text-amber-900 shadow-[0_2px_0_0_#b45309]" : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                        <span>{t.icon}</span>{t.name.replace("팀","")}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    {TEAMS2.slice(3).map((t) => (
                      <button key={t.id} onClick={() => setIssueTeam(t.id)}
                        className={`px-2 py-1.5 rounded-md text-[11.5px] font-extrabold border-2 transition-all flex items-center justify-center gap-1
                          ${issueTeam === t.id ? "bg-amber-100 border-amber-500 text-amber-900 shadow-[0_2px_0_0_#b45309]" : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                        <span>{t.icon}</span>{t.name.replace("팀","")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 만료일 */}
                <div>
                  <div className="text-[11px] font-extrabold text-stone-600 mb-1">유효 기간</div>
                  <div className="flex gap-1.5">
                    {[
                      { k: "1", l: "1일" },
                      { k: "7", l: "7일" },
                      { k: "30", l: "30일" },
                    ].map((o) => (
                      <button key={o.k} onClick={() => setIssueExpiry(o.k)}
                        className={`flex-1 px-2 py-1.5 rounded-md text-[12px] font-extrabold border-2 transition-all
                          ${issueExpiry === o.k ? "bg-amber-100 border-amber-500 text-amber-900 shadow-[0_2px_0_0_#b45309]" : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                <Btn variant="primary" size="md" full onClick={issueNew}>
                  ✨ 새 열쇠 만들기
                </Btn>
              </div>
            )}
          </div>

          {/* 발급된 코드 목록 */}
          <div className="flex-1 overflow-auto px-4 pb-4">
            <div className="sticky top-0 bg-stone-50 pt-4 pb-2 z-[1]">
              <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center justify-between">
                <span>📜 발급된 열쇠</span>
                <span className="font-mono text-stone-400">{ISSUED_CODES.length}건</span>
              </div>
              <div className="flex gap-1 p-1 bg-white rounded-md border-2 border-stone-200">
                {[
                  { k: "active", l: "사용 가능", count: ISSUED_CODES.filter(c => !c.used && !c.expired).length },
                  { k: "used", l: "사용됨", count: ISSUED_CODES.filter(c => c.used).length },
                  { k: "expired", l: "만료", count: ISSUED_CODES.filter(c => c.expired).length },
                ].map((f) => (
                  <button key={f.k} onClick={() => setCodeFilter(f.k)}
                    className={`flex-1 px-1.5 py-1 text-[11px] font-extrabold rounded-sm transition-colors flex items-center justify-center gap-1
                      ${codeFilter === f.k ? "bg-amber-400 text-amber-950 border border-amber-700" : "text-stone-500 hover:text-stone-700 border border-transparent"}`}>
                    {f.l} <span className="text-[9px] font-mono opacity-70">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {filteredCodes.map((c) => {
                const team = TEAMS2.find(t => t.id === c.teamId);
                return (
                  <div key={c.code} className={`p-2.5 rounded-md bg-white border-2 transition-all
                    ${c.used ? "border-emerald-200 opacity-70" : c.expired ? "border-stone-200 opacity-60" : "border-stone-300 hover:border-amber-400"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[13px] font-black font-mono tracking-[0.15em] text-stone-900">{c.code}</div>
                      {c.used ? <ChipG tone="green">사용됨</ChipG> :
                       c.expired ? <ChipG tone="gray">만료</ChipG> :
                       <ChipG tone="amber">대기</ChipG>}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono font-bold">
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] leading-none">{team.icon}</span>
                        <span>{team.name}</span>
                      </div>
                      <span>{c.used ? `← ${c.usedBy}` : `~${c.expiresAt}`}</span>
                    </div>
                    {!c.used && !c.expired && (
                      <div className="flex gap-1 mt-2">
                        <button className="flex-1 text-[10px] font-extrabold text-stone-600 hover:text-stone-900 bg-stone-50 border-2 border-stone-200 rounded py-1">
                          📋 복사
                        </button>
                        <button className="flex-1 text-[10px] font-extrabold text-red-600 hover:text-red-800 bg-red-50 border-2 border-red-200 rounded py-1">
                          🗑 폐기
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredCodes.length === 0 && (
                <div className="py-8 text-center text-[12px] text-stone-400 font-bold">해당 상태의 열쇠가 없어요</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AdminV2 = AdminV2;
