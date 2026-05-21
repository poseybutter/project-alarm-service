// v2 — 길드 가입 폼 (/guild-join) — 초대코드 검증 통과 후 표시
const { useState: useStateGuildJoin } = React;

const TEAMS = [
  { id: "publishing", name: "퍼블리싱팀", icon: "🎨", count: 4 },
  { id: "frontend",   name: "프론트엔드팀", icon: "💻", count: 6 },
  { id: "backend",    name: "백엔드팀",    icon: "🛠️", count: 5 },
  { id: "design",     name: "디자인팀",    icon: "✏️", count: 3 },
  { id: "qa",         name: "QA팀",       icon: "🔍", count: 2 },
];

function GuildJoin() {
  const [name, setName] = useStateGuildJoin("");
  const [teamId, setTeamId] = useStateGuildJoin("publishing");
  const [bio, setBio] = useStateGuildJoin("");
  const [agree, setAgree] = useStateGuildJoin(false);
  const [openTeam, setOpenTeam] = useStateGuildJoin(false);

  const team = TEAMS.find(t => t.id === teamId);
  const filled = [name.length >= 2, !!teamId, agree].filter(Boolean).length;
  const formValid = filled === 3;
  const bioMax = 200;

  return (
    <div className="w-[1440px] h-[900px] bg-white text-stone-900 flex" style={{ fontFamily: T2.font.sans }}>
      {/* ========== LEFT — 가입 폼 ========== */}
      <div className="w-[640px] flex flex-col justify-between px-16 py-10 border-r-2 border-stone-200">
        <div className="flex items-center justify-between">
          <Logo size={32} />
          <ChipG tone="green" icon={I.check(10)}>봉인 해제 완료</ChipG>
        </div>

        <div className="max-w-[480px] -mt-6">
          <div className="text-[11px] text-amber-700 font-extrabold mb-2 tracking-widest">CHAPTER 02 · PROFILE</div>
          <h1 className="text-[28px] font-black tracking-tight leading-[1.15]">
            모험가 정보 등록
          </h1>
          <p className="text-[14px] text-stone-500 mt-2 mb-5">
            길드에 합류하기 위한 정보를 입력해주세요.
          </p>

          {/* 진척도 */}
          <div className="mb-5">
            <GameBar value={filled} max={3} segments={12} label="가입 진척도" sub={`${filled} / 3`} />
          </div>

          <div className="flex flex-col gap-4">
            {/* 이름 */}
            <Field
              label={<span>이름 <span className="text-red-500">*</span></span>}
              placeholder="홍길동"
              icon={I.user()}
              value={name}
              onChange={setName}
              hint={name.length >= 2 ? <span className="text-emerald-600 font-bold">✓ 확인</span> : "2자 이상"}
              autoFocus
            />

            {/* 팀 선택 (커스텀 셀렉트) */}
            <div>
              <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline">
                <span>소속 팀 <span className="text-red-500">*</span></span>
                <span className="text-[11px] font-medium text-stone-400">길드 합류 후 변경 가능</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenTeam(!openTeam)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 bg-white rounded-lg border-2 transition-all
                    ${openTeam ? "border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.22)]" : "border-stone-300"}`}>
                  <span className="text-[22px] leading-none">{team.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-extrabold text-stone-900">{team.name}</div>
                    <div className="text-[11px] text-stone-500 font-mono font-bold">{team.count}명 활동 중</div>
                  </div>
                  <span className="text-stone-400 font-black">{openTeam ? "▲" : "▼"}</span>
                </button>

                {openTeam && (
                  <div className="absolute z-10 left-0 right-0 mt-1.5 bg-white border-2 border-stone-800 rounded-lg overflow-hidden"
                    style={{ boxShadow: "0 4px 0 0 #1c1917" }}>
                    {TEAMS.map((t) => (
                      <button key={t.id}
                        type="button"
                        onClick={() => { setTeamId(t.id); setOpenTeam(false); }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 transition-colors text-left
                          ${t.id === teamId ? "bg-amber-50" : "hover:bg-stone-50"}
                          ${t.id !== TEAMS[TEAMS.length-1].id ? "border-b-2 border-stone-100" : ""}`}>
                        <span className="text-[20px] leading-none">{t.icon}</span>
                        <div className="flex-1">
                          <div className="text-[13px] font-extrabold text-stone-900">{t.name}</div>
                          <div className="text-[10px] text-stone-500 font-mono font-bold">{t.count}명 활동 중</div>
                        </div>
                        {t.id === teamId && <span className="text-amber-600 font-black">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 각오 한마디 */}
            <div>
              <div className="text-[12px] font-extrabold text-stone-700 mb-1.5 flex justify-between items-baseline">
                <span className="flex items-center gap-1.5">📝 각오 한마디 <span className="text-[10px] font-mono text-stone-400 font-bold">(선택)</span></span>
                <span className={`text-[11px] font-mono font-bold ${bio.length > bioMax ? "text-red-600" : "text-stone-400"}`}>{bio.length} / {bioMax}</span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, bioMax))}
                placeholder="길드에 합류하는 각오를 적어주세요! ex. 열심히 하겠습니다 🔥"
                rows={3}
                className="w-full bg-white rounded-lg border-2 border-stone-300 px-3.5 py-3 text-[13.5px] font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.22)] transition-all resize-none"
                style={{ fontFamily: T2.font.sans }}
              />
              <div className="mt-1.5 text-[11px] text-stone-500 flex items-center gap-1.5">
                🛡️ 각오는 길드장만 볼 수 있어요
              </div>
            </div>

            {/* 약관 */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none" onClick={() => setAgree(!agree)}>
              <span className={`mt-0.5 w-[18px] h-[18px] grid place-items-center text-white flex-shrink-0 border-2 transition-colors
                ${agree ? "bg-amber-400 border-amber-700" : "bg-white border-stone-300"}`}>
                {agree && I.check(12)}
              </span>
              <span className="text-[12px] text-stone-600 leading-relaxed">
                <b className="text-stone-900">길드 행동 강령</b>과 <b className="text-stone-900">개인정보 처리방침</b>에 동의하며,
                내 작업 활동(EXP, 퀘스트 완료 등)이 길드원에게 표시되는 것에 동의합니다.
              </span>
            </label>

            <div className="flex gap-2 mt-2">
              <Btn variant="ghost" size="lg">← 이전</Btn>
              <Btn variant="primary" size="lg" full disabled={!formValid} rightIcon={I.arrow()}>
                📜 가입 신청서 제출
              </Btn>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-stone-400 font-bold">© 2026 UD2 Publishing</div>
      </div>

      {/* ========== RIGHT — 초대장 비주얼 ========== */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100/40 to-stone-50">
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)",
          backgroundSize: "16px 16px",
          maskImage: "radial-gradient(700px 600px at 60% 40%, #000, transparent 75%)",
        }} />

        <div className="relative h-full flex flex-col justify-center items-center p-12">
          {/* 스프라이트 */}
          <div className="mb-8 flex items-end gap-6">
            <div style={{ animation: "wobble 3s ease-in-out infinite" }}>
              <Scroll scale={6} />
            </div>
          </div>

          {/* 미리보기 카드 — 신청서 */}
          <div className="w-[460px] bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
            style={{ boxShadow: "0 6px 0 0 #1c1917" }}>
            {/* 헤더 바 */}
            <div className="h-7 bg-amber-400 border-b-2 border-stone-800 grid place-items-center">
              <div className="text-[10px] font-extrabold text-amber-950 tracking-widest font-mono">★ APPLICATION PREVIEW · 신청서 ★</div>
            </div>

            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[10px] text-amber-700 font-mono font-extrabold tracking-widest">UD2 WORKSPACE · 가입 신청</div>
                  <div className="text-[20px] font-black tracking-tight text-stone-900 mt-1">{name || "이름을 입력하세요"}</div>
                  <div className="text-[12px] text-stone-500 mt-0.5 flex items-center gap-1.5">
                    <span>{team.icon}</span>
                    {team.name}
                  </div>
                </div>
                <CharBox name={name[0] || "?"} size={50} color="#a8a29e" />
              </div>

              {/* 각오 한마디 미리보기 */}
              <div className="border-t-2 border-dashed border-stone-200 pt-4">
                <div className="text-[10px] text-stone-400 font-mono font-extrabold mb-2 tracking-widest">각오 한마디</div>
                <div className={`min-h-[60px] p-3 rounded-md text-[13px] leading-relaxed border-2
                  ${bio ? "bg-amber-50 border-amber-300 text-stone-800" : "bg-stone-50 border-stone-200 text-stone-300 italic"}`}>
                  {bio || "(아직 작성되지 않았어요)"}
                </div>
              </div>

              {/* 상태 */}
              <div className="mt-4 pt-4 border-t-2 border-dashed border-stone-200 grid grid-cols-3 gap-2.5">
                {[
                  { l: "STATUS", v: "PENDING", tone: "stone" },
                  { l: "TEAM", v: team.name.slice(0, 4) },
                  { l: "START", v: "Lv. 1" },
                ].map((m, i) => (
                  <div key={i} className="bg-stone-50 border-2 border-stone-200 rounded-md p-2 text-center">
                    <div className="text-[9px] text-stone-400 font-mono font-extrabold mb-1">{m.l}</div>
                    <div className="text-[11px] font-mono font-extrabold text-stone-900">{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 팀원 미리보기 */}
          <div className="w-[460px] mt-6 flex items-center gap-3 text-[12px] text-stone-600">
            <div className="flex">
              {[{n:"유",c:"#f59e0b",lv:12},{n:"수",c:"#0ea5e9",lv:9},{n:"민",c:"#10b981",lv:7},{n:"지",c:"#ef4444",lv:6}].map((p, i) => (
                <div key={i} style={{ marginLeft: i ? -10 : 0 }}>
                  <CharBox name={p.n} color={p.c} size={36} level={p.lv} />
                </div>
              ))}
            </div>
            <div>
              <b className="text-stone-900">{team.name} {team.count}명</b>이 새 동료를 기다려요
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.GuildJoin = GuildJoin;
