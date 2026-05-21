// v2 — 추가 화면 핸드오프 TypeScript 스니펫
function SnippetsExtra() {
  const Block = ({ title, code, lang = "tsx" }) => (
    <div className="rounded-xl bg-white border-2 border-stone-200 overflow-hidden">
      <div className="px-4 py-2.5 flex justify-between items-center border-b-2 border-stone-200 bg-amber-50">
        <span className="text-[12px] font-extrabold text-stone-900">{title}</span>
        <span className="text-[10px] text-stone-500 font-bold" style={{ fontFamily: T2.font.mono }}>{lang}</span>
      </div>
      <pre className="m-0 p-4 text-[11.5px] leading-relaxed overflow-auto" style={{ fontFamily: T2.font.mono, maxHeight: 380 }}>
        <code className="text-stone-700">{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="w-[1440px] bg-stone-50 px-14 py-10" style={{ fontFamily: T2.font.sans }}>
      <div className="mb-6">
        <div className="text-[11px] text-stone-400 font-bold tracking-wider" style={{ fontFamily: T2.font.mono }}>HANDOFF · 추가 화면</div>
        <div className="text-[22px] font-black tracking-tight mt-1">Next.js + TypeScript 핸드오프</div>
        <p className="text-[13px] text-stone-500 mt-1 max-w-[800px]">
          구글 OAuth 통합 + 길드 가입 폼 + 관리자 코드 발급 패널에 필요한 API/페이지/서버 액션 코드입니다.
          Spring Boot 백엔드와 통신하며, JWT는 HttpOnly 쿠키로 격리합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Block title="lib/api.ts — 공통 API 클라이언트"
code={`import { cookies } from "next/headers";

const API = process.env.SPRING_API!;

export async function springFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const at = cookies().get("ud2_at")?.value;
  const r = await fetch(\`\${API}\${path}\`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(at ? { Authorization: \`Bearer \${at}\` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export type Team = { id: string; name: string; icon: string; memberCount: number };
export type Invitation = {
  id: number; code: string; teamId: string;
  expiresAt: string; used: boolean; usedBy?: string; issuedAt: string;
};
export type PendingPlayer = {
  id: number; name: string; email: string; teamId: string;
  bio: string | null; appliedAt: string;
  invitation: { code: string; issuedBy: string; issuedAt: string; expiresAt: string };
  domain: boolean; risk: "low" | "high";
};`} />

        <Block title="app/api/invitations/verify/route.ts — ① 코드 검증"
code={`import { NextResponse } from "next/server";
import { springFetch } from "@/lib/api";

// 모달의 '봉인 해제' 클릭 시 호출
export async function POST(req: Request) {
  const { code } = await req.json();

  // 1) 형식 검사 (8자, 영문 대문자/숫자)
  const clean = code?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean || clean.length !== 8) {
    return NextResponse.json(
      { valid: false, message: "유효하지 않은 초대코드입니다." },
      { status: 400 }
    );
  }

  // 2) Spring 측 검증 — 만료/사용 여부 확인
  const r = await springFetch<{
    invitationId: number; teamId: string;
  }>(\`/invitations/verify\`, {
    method: "POST",
    body: JSON.stringify({ code: clean }),
  });

  if (!r.ok || !r.data) {
    // 보안: 만료/없음/사용됨을 모두 같은 메시지로 (정보 누설 방어)
    return NextResponse.json(
      { valid: false, message: "유효하지 않은 초대코드입니다." },
      { status: 400 }
    );
  }

  // 3) 검증 통과 — 임시 토큰을 쿠키에 (5분 유효)
  //    /guild-join 페이지가 이걸 들고 가입 폼 제출
  const res = NextResponse.json({
    valid: true,
    teamId: r.data.teamId,
    invitationId: r.data.invitationId,
  });
  res.cookies.set("ud2_invite", String(r.data.invitationId), {
    httpOnly: true, secure: true, sameSite: "lax",
    maxAge: 300, path: "/",
  });
  return res;
}`} />

        <Block title="app/(auth)/_components/NotMemberModal.tsx — ② 모달"
code={`"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Pix, SPR_LOCKED, GameButton, InviteCodeInput } from "@/components/game-ui";

export function NotMemberModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<[string, string]>(["", ""]);
  const [err, setErr] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();

  const codeFull = code[0].length === 4 && code[1].length === 4;

  async function verify() {
    if (!codeFull) return;
    setVerifying(true);
    const r = await fetch("/api/invitations/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.join("") }),
    });
    setVerifying(false);
    const data = await r.json();
    if (!data.valid) return setErr(data.message ?? "유효하지 않은 초대코드입니다.");
    router.push("/guild-join"); // 검증 통과 → 가입 폼으로
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm grid place-items-center px-6"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-[480px] bg-white border-2 border-stone-800 rounded-xl overflow-hidden"
        style={{ boxShadow: "0 8px 0 0 #1c1917" }}>
        <div className="h-9 bg-red-400 border-b-2 border-stone-800 grid place-items-center">
          <div className="text-[11px] font-extrabold text-red-950 tracking-widest font-mono">
            ★ ACCESS DENIED · 잠긴 문 ★
          </div>
        </div>
        <div className="p-7">
          <div className="flex justify-center mb-4">
            <Pix map={SPR_LOCKED} palette={"red"} scale={4} />
          </div>
          <h2 className="text-[22px] font-black text-center mb-1.5">길드원이 아니에요!</h2>
          <p className="text-[13px] text-stone-600 text-center mb-5">
            이 워크스페이스는 <b>초대코드가 있는 모험가</b>만 입장할 수 있어요.
          </p>
          <InviteCodeInput value={code} onChange={setCode} error={err} />
          <div className="flex gap-2 mt-5">
            <GameButton variant="ghost" onClick={onClose}>닫기</GameButton>
            <GameButton variant="primary" full disabled={!codeFull || verifying} onClick={verify}>
              {verifying ? "열쇠 확인 중…" : "🔓 봉인 해제"}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}`} />

        <Block title="app/(auth)/callback/google/route.ts — 구글 OAuth 콜백"
code={`import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { springFetch } from "@/lib/api";

// 구글 OAuth 성공 후 Spring으로 토큰 교환
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth", req.url));

  // 1) Spring에 구글 code 전달 → Spring이 구글 검증 후 사용자 매칭
  const r = await springFetch<{
    access: string; refresh: string;
    user: { id: number; email: string; status: "new" | "pending" | "active" };
  }>("/auth/google/callback", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

  if (!r.ok || !r.data) return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  const { access, refresh, user } = r.data;

  cookies().set("ud2_at", access, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 60*30, path: "/",
  });
  cookies().set("ud2_rt", refresh, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 60*60*24*14, path: "/",
  });

  // 2) 분기 — 신규는 모달 띄울 페이지로, pending은 대기, active는 워크스페이스
  if (user.status === "new")     return NextResponse.redirect(new URL("/?showInviteModal=1", req.url));
  if (user.status === "pending") return NextResponse.redirect(new URL("/pending", req.url));
  return NextResponse.redirect(new URL("/", req.url));
}`} />

        <Block title="app/api/guild-join/route.ts — ③ 가입 제출"
code={`import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { springFetch } from "@/lib/api";

const Body = {
  parse(o: any): { name: string; teamId: string; bio: string } | null {
    const name = String(o?.name ?? "").trim();
    const teamId = String(o?.teamId ?? "").trim();
    const bio = String(o?.bio ?? "").slice(0, 200);
    if (name.length < 2 || !teamId) return null;
    return { name, teamId, bio };
  },
};

export async function POST(req: Request) {
  const inviteId = cookies().get("ud2_invite")?.value;
  if (!inviteId) {
    // 모달 검증 → 가입 폼 흐름이 끊겼을 때
    return NextResponse.json({ error: "INVITE_REQUIRED" }, { status: 400 });
  }

  const body = Body.parse(await req.json());
  if (!body) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  // Spring에 가입 신청 — 서버에서 status=pending으로 저장
  const r = await springFetch("/guild-join", {
    method: "POST",
    body: JSON.stringify({ ...body, invitationId: Number(inviteId) }),
  });

  if (!r.ok) {
    return NextResponse.json({ error: "JOIN_FAILED" }, { status: r.status });
  }

  // 임시 토큰 폐기 (1회용)
  cookies().delete("ud2_invite");
  return NextResponse.json({ ok: true });
}`} />

        <Block title="app/(auth)/guild-join/page.tsx — ③ 가입 폼"
code={`"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthField, GameButton, GameBar, CharBox, Pix, SPR_SCROLL } from "@/components/game-ui";
import type { Team } from "@/lib/api";

export default function GuildJoinPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [bio, setBio] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/teams").then(r => r.json()).then((d: Team[]) => {
      setTeams(d);
      if (d[0]) setTeamId(d[0].id);
    });
  }, []);

  const filled = [name.length >= 2, !!teamId, agree].filter(Boolean).length;
  const valid = filled === 3;

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    const r = await fetch("/api/guild-join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teamId, bio }),
    });
    setSubmitting(false);
    if (r.status === 400 && (await r.json())?.error === "INVITE_REQUIRED") {
      return router.push("/?showInviteModal=1");
    }
    if (!r.ok) return alert("가입 신청에 실패했어요. 잠시 후 다시 시도해 주세요.");
    router.push("/pending");
  }

  return (
    <div className="grid grid-cols-[640px_1fr] h-screen">
      {/* 좌측 폼: AuthField/Select/Textarea + GameBar(진척도) */}
      {/* 우측 비주얼: Pix(SPR_SCROLL) + 신청서 미리보기 카드 */}
    </div>
  );
}`} />

        <Block title="app/api/admin/invitations/route.ts — ④ 코드 발급"
code={`import { NextResponse } from "next/server";
import { springFetch } from "@/lib/api";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

async function requireAdmin() {
  const at = cookies().get("ud2_at")?.value;
  if (!at) return null;
  try {
    const { payload } = await jwtVerify(at, new TextEncoder().encode(process.env.JWT_SECRET!));
    return payload.role === "admin" ? payload : null;
  } catch { return null; }
}

// POST /api/admin/invitations
// body: { teamId: string, expiresInDays: 1 | 7 | 30 }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse(null, { status: 403 });

  const { teamId, expiresInDays = 7 } = await req.json();
  if (!teamId) return NextResponse.json({ error: "TEAM_REQUIRED" }, { status: 400 });

  // Spring 측에서 코드 생성 + audit_log 기록 + DB 저장
  const r = await springFetch<{
    invitation: { id: number; code: string; teamId: string; expiresAt: string };
  }>("/admin/invitations", {
    method: "POST",
    body: JSON.stringify({ teamId, expiresInDays }),
  });
  if (!r.ok || !r.data) return new NextResponse(null, { status: r.status });
  return NextResponse.json(r.data.invitation);
}

// GET /api/admin/invitations?status=active|used|expired
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse(null, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "all";
  const r = await springFetch(\`/admin/invitations?status=\${status}\`);
  return NextResponse.json(r.data ?? []);
}`} />

        <Block title="app/api/admin/players/[id]/approve/route.ts — 승인/거절"
code={`import { NextResponse } from "next/server";
import { springFetch } from "@/lib/api";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

async function requireAdmin() {
  const at = cookies().get("ud2_at")?.value;
  if (!at) return null;
  try {
    const { payload } = await jwtVerify(at, new TextEncoder().encode(process.env.JWT_SECRET!));
    return payload.role === "admin" ? payload : null;
  } catch { return null; }
}

// PATCH /api/admin/players/:id/approve
export async function PATCH(_: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return new NextResponse(null, { status: 403 });

  const r = await springFetch(\`/admin/players/\${params.id}/approve\`, { method: "PATCH" });
  if (!r.ok) return new NextResponse(null, { status: r.status });

  // Spring 측에서:
  // - players.status = 'active'
  // - audit_log INSERT (admin_id, action, player_id, ts)
  // - 신청자에게 합류 알림 (이메일 + 슬랙)
  // - 길드원 전체에게 '새 동료가 합류했어요' 브로드캐스트
  return NextResponse.json(r.data);
}`} />

        <Block title="middleware.ts — 라우트 보호 (개편)"
code={`import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/pending", "/guild-join"];
// /guild-join은 ud2_invite 쿠키 있으면 접근 가능 (모달 검증 후)

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) /guild-join: invite 토큰 필수
  if (pathname.startsWith("/guild-join")) {
    if (!req.cookies.get("ud2_invite")?.value) {
      return NextResponse.redirect(new URL("/?showInviteModal=1", req.url));
    }
    return NextResponse.next();
  }

  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("ud2_at")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const { payload } = await jwtVerify(
      token, new TextEncoder().encode(process.env.JWT_SECRET!)
    );

    // 신규 OAuth 유저 — 가입 안 함
    if (payload.status === "new") {
      return NextResponse.redirect(new URL("/?showInviteModal=1", req.url));
    }
    if (payload.status === "pending") {
      return NextResponse.redirect(new URL("/pending", req.url));
    }
    if (payload.role !== "admin" && pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = { matcher: ["/((?!_next|api|favicon).*)"] };`} />
      </div>

      {/* DB 스키마 보조 */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white border-2 border-amber-300 overflow-hidden">
          <div className="px-4 py-2.5 border-b-2 border-amber-300 bg-amber-50 flex items-center gap-2">
            <Key scale={2} />
            <span className="text-[12px] font-extrabold text-stone-900">Spring 측 권장 DB 스키마 (참고)</span>
          </div>
          <pre className="m-0 p-4 text-[11.5px] leading-relaxed overflow-auto bg-white" style={{ fontFamily: T2.font.mono, maxHeight: 400 }}>
            <code className="text-stone-700">{`-- 팀
CREATE TABLE teams (
  id          VARCHAR(32) PRIMARY KEY,    -- "publishing", "frontend"
  name        VARCHAR(64) NOT NULL,
  icon        VARCHAR(8),                  -- 이모지
  created_at  TIMESTAMP DEFAULT NOW()
);

-- 초대코드 (1회용)
CREATE TABLE invitations (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(9) UNIQUE NOT NULL,  -- "Q3R7-K2MN"
  team_id     VARCHAR(32) REFERENCES teams(id),
  issued_by   BIGINT REFERENCES players(id),
  issued_at   TIMESTAMP DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  used_by     BIGINT REFERENCES players(id),
  used_at     TIMESTAMP
);
CREATE INDEX idx_inv_status ON invitations(used, expires_at);

-- 모험가 (사용자)
CREATE TABLE players (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(64) NOT NULL,
  team_id       VARCHAR(32) REFERENCES teams(id),
  status        VARCHAR(16) NOT NULL,   -- 'new' | 'pending' | 'active' | 'rejected'
  role          VARCHAR(16) DEFAULT 'member',  -- 'member' | 'admin'
  bio           TEXT,                   -- 각오 한마디 (관리자만 조회)
  invitation_id BIGINT REFERENCES invitations(id),
  applied_at    TIMESTAMP,
  approved_at   TIMESTAMP,
  rejected_at   TIMESTAMP,
  reject_until  TIMESTAMP               -- 30일 락
);

-- 감사 로그
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT REFERENCES players(id),
  action      VARCHAR(64) NOT NULL,    -- 'invitation.issue', 'player.approve' 등
  target_id   BIGINT,
  metadata    JSONB,
  ip          INET,
  created_at  TIMESTAMP DEFAULT NOW()
);`}</code>
          </pre>
        </div>

        <div className="rounded-xl bg-white border-2 border-amber-300 overflow-hidden">
          <div className="px-4 py-2.5 border-b-2 border-amber-300 bg-amber-50 flex items-center gap-2">
            <Shield scale={2} />
            <span className="text-[12px] font-extrabold text-stone-900">전체 인증 플로우 다이어그램</span>
          </div>
          <pre className="m-0 p-4 text-[11.5px] leading-relaxed overflow-auto bg-white" style={{ fontFamily: T2.font.mono, maxHeight: 400 }}>
            <code className="text-stone-700">{`[방문자]
   │
   ├─ /login ────────────────────► [이메일+비밀번호]
   │                                       │
   │                            성공 ┌─────┴─────┐ pending
   │                                 ▼           ▼
   │                            /          /pending (폴링)
   │
   └─ 구글 로그인 → /callback/google
                          │
                          ├─ status=new ──► [모달 표시]
                          │                   │
                          │           ┌───────┴──── 코드 검증 실패
                          │           ▼
                          │     /guild-join ──► [팀+각오 입력]
                          │           │                 │
                          │           ▼            POST /guild-join
                          │     status=pending ─► /pending
                          │
                          ├─ status=pending → /pending
                          └─ status=active  → /

[관리자]
   │
   └─ /admin/members
        │
        ├─ 신청자 목록 (GET /api/admin/players?status=pending)
        ├─ 상세 → 보안 검증 → 모달 → 승인/거절
        │   PATCH /api/admin/players/:id/approve|reject
        │
        └─ 우측 패널: 코드 발급
            POST /api/admin/invitations { teamId, expiresInDays }
            └─► 생성된 코드 표시 + 클립보드 복사

[보안 규칙]
- JWT는 HttpOnly + Secure + SameSite=lax 쿠키
- 초대코드: 1회용 + 5회 실패 시 IP 차단
- 거절 후 30일간 동일 이메일 재신청 불가
- 각오(bio)는 role=admin만 SELECT 가능 (RLS)`}</code>
          </pre>
        </div>
      </div>

      {/* 보안 UX 추가 원칙 */}
      <div className="mt-8">
        <div className="text-[11px] text-stone-400 font-bold mb-3" style={{ fontFamily: T2.font.mono, letterSpacing: "0.05em" }}>
          NEW SECURITY UX · 추가 화면 보안 원칙
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["구글 OAuth는 분기점만", "OAuth 성공 = 인증 성공 ≠ 가입 완료. status=new는 별도 모달로 분기, pending은 /pending으로 격리."],
            ["임시 invite 토큰", "/guild-join 페이지는 코드 검증 시 발급된 5분 유효 임시 쿠키 필요. 직접 URL 접근 차단."],
            ["코드 검증 응답은 단일 메시지", "'만료' / '없음' / '사용됨' 모두 '유효하지 않은 초대코드' 한 줄 — 정보 누설 방지."],
            ["각오 한마디는 role=admin만", "Spring/Supabase RLS로 SELECT 권한 분리. 길드원 프로필 화면에서도 노출 X."],
            ["코드 발급은 audit_log 필수", "발급자/시각/대상 팀/만료일 기록. 외부 도메인 가입 추적 시 역추적 가능."],
            ["코드 복사는 1회성 클립보드", "발급 직후 클립보드에만. 새로고침/이동 시 평문 사라짐. DB는 해시 저장 권장."],
          ].map(([h, b], i) => (
            <div key={i} className="p-4 rounded-xl bg-white border-2 border-amber-200">
              <div className="flex gap-2 items-start mb-1.5">
                <span className="text-[11px] font-bold text-amber-700 w-5" style={{ fontFamily: T2.font.mono }}>{String(i+1).padStart(2, "0")}</span>
                <div className="text-[13px] font-extrabold text-stone-900">{h}</div>
              </div>
              <div className="text-[12px] text-stone-600 leading-relaxed pl-7">{b}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.SnippetsExtra = SnippetsExtra;
