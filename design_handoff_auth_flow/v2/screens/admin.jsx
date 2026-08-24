// v2 — 관리자 멤버 승인 (ZEP 스타일 / "모험가 심사")
const { useState: useStateAdminV2, useMemo: useMemoAdminV2 } = React;

const PENDING_V2 = [
  { id: 1, name: "사용자 A", email: "user-a@example.com", invitedBy: "운영 관리자", role: "Frontend / Markup",
    appliedAt: "오늘 14:22", elapsed: "8분 전", code: "Q3R7-K2MN",
    note: "디자인팀 추천으로 신청합니다. 퍼블리싱 8년차예요.",
    risk: "low", domain: true,
  },
  { id: 2, name: "사용자 B", email: "user-b@example.com", invitedBy: "운영 관리자", role: "QA",
    appliedAt: "오늘 11:08", elapsed: "3시간 전", code: "BG8T-V1WS",
    note: "", risk: "low", domain: true,
  },
  { id: 3, name: "외부 사용자", email: "external-user@example.net", invitedBy: "운영 관리자", role: "외부 협력자",
    appliedAt: "어제 18:41", elapsed: "20시간 전", code: "ZZ00-1111",
    note: "프리랜서로 같이 작업했던 분이에요.",
    risk: "high", domain: false,
  },
  { id: 4, name: "사용자 C", email: "user-c@example.com", invitedBy: "운영 관리자", role: "Markup",
    appliedAt: "어제 09:30", elapsed: "30시간 전", code: "M4VC-X5LO",
    note: "신입입니다. 잘 부탁드려요!",
    risk: "low", domain: true,
  },
];

function AdminV2() {
  const [filter, setFilter] = useStateAdminV2("all");
  const [search, setSearch] = useStateAdminV2("");
  const [selected, setSelected] = useStateAdminV2(1);
  const [decided, setDecided] = useStateAdminV2({});
  const [confirm, setConfirm] = useStateAdminV2(null);

  const list = useMemoAdminV2(() => PENDING_V2.filter((p) => {
    if (filter === "risk" && p.risk !== "high") return false;
    if (filter === "today" && !p.appliedAt.startsWith("오늘")) return false;
    if (search && !(p.name.includes(search) || p.email.includes(search))) return false;
    return true;
  }), [filter, search]);

  const cur = PENDING_V2.find((p) => p.id === selected);
  const status = decided[selected];

  const decide = (action) => { setDecided({ ...decided, [selected]: action }); setConfirm(null); };

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
                  {PENDING_V2.length - Object.keys(decided).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ChipG tone="amber" icon="🔥">14일</ChipG>
          <CharBox name="유" color="#f59e0b" size={32} level={12} />
          <div className="text-[12px] font-extrabold">운영 관리자 <span className="text-stone-500 font-normal">· 길드장</span></div>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr_360px] overflow-hidden">
        {/* ========== LEFT — 신청자 목록 ========== */}
        <div className="border-r-2 border-stone-200 bg-stone-50 flex flex-col">
          <div className="p-4 pb-2">
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="text-[16px] font-black tracking-tight flex items-center gap-1.5">📜 가입 신청서</h2>
              <span className="text-[11px] font-mono font-extrabold text-stone-500">{list.length} / {PENDING_V2.length}</span>
            </div>
            <Field placeholder="이름 또는 이메일" icon={I.search()} value={search} onChange={setSearch} />
            <div className="flex gap-1 mt-2 p-1 bg-white rounded-md border-2 border-stone-200">
              {[
                { k: "all", l: "전체" },
                { k: "today", l: "오늘" },
                { k: "risk", l: "주의", count: PENDING_V2.filter(p => p.risk === "high").length },
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
              return (
                <div key={p.id} onClick={() => setSelected(p.id)}
                  className={`p-2.5 rounded-md cursor-pointer mb-1.5 flex gap-2.5 items-center transition-all border-2
                    ${isSel ? "bg-white border-amber-400 shadow-[0_2px_0_0_#b45309]" : "border-transparent hover:bg-white/70 hover:border-stone-200"}
                    ${st ? "opacity-60" : ""}`}>
                  <CharBox name={p.name} color={p.risk === "high" ? "#ef4444" : "#0ea5e9"} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="text-[13px] font-extrabold text-stone-900 truncate">{p.name}</div>
                      {p.risk === "high" && <ChipG tone="red">주의</ChipG>}
                      {st === "approved" && <ChipG tone="green">입장</ChipG>}
                      {st === "rejected" && <ChipG tone="gray">거부</ChipG>}
                    </div>
                    <div className="text-[10px] text-stone-500 font-mono truncate">{p.email}</div>
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

              {/* 모험가 캐릭터 카드 — 게임 인벤토리 슬롯 스타일 */}
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
                      <ChipG tone="gray" icon="🌱">Lv. 0 모험가 지망생</ChipG>
                      <span className="text-[12px] text-stone-500 font-mono font-bold">{cur.email}</span>
                      {!cur.domain && <ChipG tone="red">외부 도메인</ChipG>}
                    </div>
                  </div>

                  {status && (
                    <div className={`px-3 py-1.5 rounded-md text-[12px] font-black border-2
                      ${status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-500" : "bg-stone-100 text-stone-600 border-stone-400"}`}>
                      {status === "approved" ? "✓ 입장 허가됨" : "✕ 입장 거부됨"}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t-2 border-dashed border-stone-200 grid grid-cols-3 gap-4">
                  {[
                    { l: "희망 역할", v: cur.role },
                    { l: "추천인", v: <span className="flex items-center gap-1.5"><CharBox name={cur.invitedBy[0]} size={18} color="#f59e0b" />{cur.invitedBy}</span> },
                    { l: "사용한 열쇠", v: <span className="font-mono font-bold">{cur.code}</span> },
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] text-stone-400 font-mono font-extrabold mb-1 tracking-widest">{m.l}</div>
                      <div className="text-[13px] font-extrabold">{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 신청 메시지 — 두루마리 느낌 */}
              {cur.note && (
                <div className="mb-5">
                  <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">📜 신청 메시지</div>
                  <div className="p-4 rounded-md bg-amber-50 border-2 border-amber-300 text-[14px] text-stone-800 leading-relaxed font-medium">
                    "{cur.note}"
                  </div>
                </div>
              )}

              {/* 자동 보안 검증 — 게임 능력치 시트 */}
              <div className="mb-5">
                <div className="text-[11px] text-stone-700 font-extrabold mb-2 tracking-widest flex items-center gap-1.5">🛡️ 자동 보안 검증</div>
                <div className="rounded-md bg-white border-2 border-stone-300 divide-y-2 divide-stone-100">
                  {[
                    { ok: cur.domain, label: "허용 도메인 (@example.com)", detail: cur.domain ? "확인됨" : "외부 도메인 — 신중히 검토 필요" },
                    { ok: true, label: "유효한 열쇠 코드", detail: `${cur.invitedBy} 발급 · 만료 전` },
                    { ok: true, label: "신청 IP", detail: "한국, 서울 · 차단 이력 없음" },
                    { ok: cur.risk === "low", label: "중복 신청 없음", detail: cur.risk === "low" ? "확인됨" : "동일 이메일 2회 시도 — 이전 거절 이력" },
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
          )}

          {/* 액션 바 */}
          {cur && !status && (
            <div className="absolute bottom-0 left-0 right-0 px-7 py-4 bg-white border-t-2 border-stone-300 flex items-center gap-2">
              <Btn variant="danger" size="md" onClick={() => setConfirm("rejected")} leftIcon="🚫">
                입장 거부
              </Btn>
              <Btn variant="ghost" size="md">⏰ 나중에</Btn>
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
                  ? `🎉 ${cur.name}님이 길드에 입장했어요. 환영 알림이 발송되었습니다.`
                  : `🚫 ${cur.name}님의 입장을 거부했어요. 신청자에게 알림이 발송됩니다.`}
              </div>
              <Btn variant="ghost" size="sm" onClick={() => { const d = { ...decided }; delete d[selected]; setDecided(d); }}>↩ 되돌리기</Btn>
            </div>
          )}

          {/* 확인 모달 — 게임 다이얼로그 */}
          {confirm && cur && (
            <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm grid place-items-center p-6 z-10" onClick={() => setConfirm(null)}>
              <div onClick={(e) => e.stopPropagation()} className="w-[440px] rounded-xl bg-white border-2 border-stone-800 overflow-hidden"
                style={{ boxShadow: "0 8px 0 0 #1c1917" }}>
                <div className={`h-9 grid place-items-center border-b-2 border-stone-800 text-[11px] font-extrabold tracking-widest font-mono
                  ${confirm === "approved" ? "bg-emerald-400 text-emerald-950" : "bg-red-400 text-red-950"}`}>
                  ★ {confirm === "approved" ? "ENTRY APPROVAL" : "ENTRY REJECTION"} ★
                </div>
                <div className="p-6">
                  <div className="text-[44px] leading-none mb-3 text-center">
                    {confirm === "approved" ? "🎉" : "🚫"}
                  </div>
                  <h3 className="text-[18px] font-black tracking-tight mb-1.5 text-center">
                    {confirm === "approved" ? `${cur.name}님을 길드에 합류시킬까요?` : `${cur.name}님의 입장을 거부할까요?`}
                  </h3>
                  <p className="text-[13px] text-stone-500 leading-relaxed mb-5 text-center">
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

        {/* ========== RIGHT — 감사 로그 ========== */}
        <div className="border-l-2 border-stone-200 bg-stone-50 p-5 overflow-auto">
          <div className="text-[11px] text-stone-700 font-extrabold mb-4 tracking-widest flex items-center gap-1.5">📋 감사 로그 · TIMELINE</div>
          <div className="relative pl-5">
            <div className="absolute top-2 bottom-2 left-[5px] w-0.5 bg-stone-300" />
            {[
              { t: "가입 신청서 접수", d: "오늘 14:22 · IP 218.55.x.x", n: `${cur?.name}님이 비밀 열쇠로 가입 신청` },
              { t: "초대장 열람", d: "오늘 14:08", n: "신청자가 초대 링크 클릭 — 6분 후 가입 시도" },
              { t: "초대 이메일 발송", d: "어제 09:15", n: `${cur?.email}로 자동 발송됨` },
              { t: "열쇠 발급", d: "어제 09:14", n: `${cur?.invitedBy} · 5회 사용 가능 · ${cur?.code}` },
            ].map((ev, i) => (
              <div key={i} className="mb-4 relative">
                <div className="absolute -left-5 top-1 w-3 h-3 bg-white border-2 border-amber-500" />
                <div className="text-[13px] font-extrabold text-stone-900">{ev.t}</div>
                <div className="text-[10px] text-stone-500 font-mono font-bold mt-0.5">{ev.d}</div>
                <div className="text-[12px] text-stone-600 mt-1 leading-relaxed">{ev.n}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 p-4 rounded-md bg-amber-50 border-2 border-amber-400">
            <div className="text-[11px] text-amber-700 font-extrabold mb-2 tracking-widest">💡 추천 판정</div>
            <div className="text-[13px] text-stone-800 leading-relaxed mb-3 font-medium">
              {cur?.domain
                ? "회사 도메인 + 길드장 직접 발급 열쇠 → 일반적으로 입장 허가 권장"
                : "외부 도메인 신청 → 추천인에게 1차 확인 후 결정 권장"}
            </div>
            <Btn variant="soft" size="sm" full>📣 {cur?.invitedBy}에게 슬랙 확인</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AdminV2 = AdminV2;
