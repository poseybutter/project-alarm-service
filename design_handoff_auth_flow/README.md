# Handoff: UD2 워크스페이스 인증 플로우 (ZEP 픽셀 게임 UI)

## Overview
UD2 퍼블리싱팀 내부 업무관리 SaaS의 인증 화면 4종 디자인 핸드오프입니다.
멀티 테넌시 확장(30명+)을 앞두고 기존 4명 사용 환경에서 새로 도입하는 이메일+비밀번호+초대코드 인증 + 관리자 승인 플로우를 다룹니다.

**대상 화면 7종**
1. 로그인 (이메일+비밀번호)
2. 회원가입 (초대코드 4+4 분할 입력, 2-step)
3. 승인 대기
4. 관리자 멤버 승인 + **초대코드 발급 패널** (개편)
5. **"길드원이 아니에요!" 모달** (구글 OAuth 후 코드 미보유)
6. **길드 가입 폼 `/guild-join`** (팀 선택 + 각오 한마디)
7. (4와 동일) 관리자 화면 — 코드 발급 + 코드 목록 + 각오 한마디 노출 추가

**추가된 API 명세** (v2/snippets-extra.jsx 참조):
- `POST /api/invitations/verify` — 초대코드 검증 (5분 유효 임시 쿠키 발급)
- `POST /api/guild-join` — 가입 신청 제출 (임시 쿠키 검증 후 1회 사용 폐기)
- `GET /callback/google` — 구글 OAuth 콜백 (status에 따라 분기: new/pending/active)
- `POST /api/admin/invitations` — 코드 발급
- `GET /api/admin/invitations?status=active|used|expired` — 코드 목록
- `PATCH /api/admin/players/[id]/approve|reject` — 승인/거절
- `GET /api/teams` — 팀 목록

**스택**
- Frontend: Next.js + Tailwind CSS
- Backend: Spring Boot (JWT 발급) + Supabase
- 인증 흐름: 회원가입 → `status=pending` → 관리자 승인 → 로그인 가능

---

## About the Design Files
**이 폴더의 HTML 파일은 디자인 레퍼런스(프로토타입)입니다.** 최종 UI/UX와 인터랙션을 보여주기 위한 목업이며, 실제 프로덕션 코드로 그대로 복사하라는 의미가 아닙니다.

여러분의 작업은 이 디자인을 **실제 Next.js + Tailwind 프로젝트의 패턴/컨벤션에 맞게 재구현**하는 것입니다. 프로토타입은 React + Babel CDN으로 단일 HTML에서 동작하도록 만들어졌지만, 실제 코드베이스에서는 TypeScript + 컴포넌트 분리 + 서버 컴포넌트 / 클라이언트 컴포넌트 구분을 따르세요.

`UD2 인증 화면 v2.html`을 브라우저에서 열어 실제 동작/픽셀 디테일을 확인하면서 작업하시면 됩니다.

---

## Fidelity
**High-fidelity** — 픽셀-퍼펙트 목업입니다. 색상, 타이포그래피, 간격, 인터랙션이 모두 최종 결정된 상태입니다. 가능한 한 그대로 재현하세요.

단, 다음은 유연하게:
- 픽셀 SVG 스프라이트는 `Pix` 컴포넌트를 그대로 옮기거나 정적 SVG 파일로 export해서 써도 됩니다
- 애니메이션(bob/wobble/swing)은 우선순위 낮음 — 시간 부족하면 생략 가능

---

## Design Direction: ZEP 픽셀 게임 UI

게이미피케이션이 핵심 컨셉이지만 **실무 도구**임을 잊지 말 것.

### 시각 시스템
- **배경**: `#ffffff` (라이트 모드 고정, 다크 모드 X)
- **액센트**: `#f59e0b` (amber-500) — 모든 강조/CTA
- **폰트**: SUIT Variable (본문), JetBrains Mono (코드/숫자/`Lv.` 등)
- **보더**: 모든 카드/버튼/입력창 **2px 솔리드** (얇은 1px X)
- **라운드**: 8 / 10 / 12 / 16px (작게)
- **그림자**: 블러 X. **하단 색 그림자 오프셋만** 사용 (게임 버튼 느낌)
  - 예: `box-shadow: 0 4px 0 0 #b45309` (앰버 700)
  - 카드: `box-shadow: 0 6px 0 0 #1c1917` (stone 950)

### 게이미피케이션 카피 (실제 화면에 들어간 문구)
| 위치 | 카피 |
|---|---|
| 로그인 버튼 | 🏰 길드에 입장하기 |
| 가입 STEP 1 헤드라인 | 비밀 열쇠를 입력하세요. |
| 가입 STEP 1 라벨 | 🔑 비밀 열쇠 코드 |
| 가입 STEP 1 버튼 | 🔓 봉인 해제 |
| 가입 STEP 2 헤드라인 | 모험가 정보 등록 |
| 가입 STEP 2 버튼 | 📜 가입 신청서 제출 |
| 승인 대기 헤드라인 | 관문 앞에서 대기 중… |
| 대기 헤더 칩 | ⏳ 승인 대기 중 |
| 관리자 헤더 | 모험가 심사 |
| 관리자 사이드 메뉴 | 📊 대시보드 / 📜 퀘스트 / 🛡️ 길드원 / ⚙️ 설정 |
| 관리자 승인 | 🎉 입장 허가 |
| 관리자 거절 | 🚫 입장 거부 |

**카피 원칙:**
- 게임어는 **버튼 라벨 / 섹션 헤더 / 상태 칩**에만
- **에러 메시지, 보안 안내, 폼 힌트는 명확한 한국어 그대로** (예: "이메일 또는 비밀번호가 일치하지 않습니다.")

---

## Screens / Views

### 1. 로그인 (`/login`)

**Purpose**: 기존 멤버가 이메일+비밀번호로 로그인. JWT 발급받아 워크스페이스 진입.

**Layout**:
- 1440 × 900 기준
- 좌(560px): 폼 / 우(880px, flex-1): 게임 사이드
- 좌우 경계: `border-r-2 border-stone-200`

**좌측 폼 (max-width 400px, py-12 px-16)**:
- 상단: Logo (다이아 모양 + "UD2 워크스페이스" 텍스트)
- 중앙:
  - 칩: `CHAPTER 02 · 봄 시즌 진행 중` (amber-50 bg / amber-400 border)
  - h1: "다시 만나서 반가워요." (30px, font-black, tracking-tight)
  - 서브: "어제 작업으로 +240 EXP를 쌓았어요. 이어서 시작해 볼까요?"
  - 이메일 필드 (Field 컴포넌트, mail 아이콘)
  - 비밀번호 필드 (lock 아이콘, eye/eyeOff 토글, "비밀번호 잊으셨나요?" 힌트)
  - 자동 입장 체크박스 + `↩ ENTER` 힌트
  - 메인 버튼: `🏰 길드에 입장하기` (variant=primary lg full)
  - 구분선: "아직 길드원이 아닌가요?"
  - 보조 버튼: 픽셀 열쇠 + "초대코드로 가입하기" (variant=ghost md)
  - 보안 안내 박스: 🛡️ "UD2 내부 전용 워크스페이스 — 외부 접근은 감사 로그에 기록됩니다."
- 하단: © 2026 UD2 Publishing / 도움말 / 상태

**우측 게임 사이드 (flex-1, amber 그라데이션 배경)**:
- 배경: `bg-gradient-to-b from-amber-50 via-amber-100 to-amber-50`
- 도트 패턴 오버레이 (radial-gradient at 1px 1px, 16px 간격, mask로 가운데만 보이게)
- 마스코트 (Hero 픽셀 스프라이트, scale=6, bob 애니메이션)
- 말풍선 "어서 와요!" (white bg, 2px stone-800 border, 3px 하단 그림자, 삼각 꼬리)
- **게임 상태창** (440px width, white bg, 2px stone-800 border, 6px shadow):
  - 헤더: CharBox(김유정, level 12) + 이름 + "🛡️ 던전 탐험가" 칩 + 🔥14 스트릭
  - EXP 바: GameBar (20 segments, value=1240, max=1500, label "Lv. 12 · NEXT", sub "1,240 / 1,500 EXP")
  - 오늘의 퀘스트 3개: 체크박스 + 제목 + 💎+XP
    - "메인 헤더 마크업 리뷰" / D-1 칩 / +60
    - "상품 카드 컴포넌트 마무리" / +120
    - "QA 피드백 3건 반영" / +80
- 하단: 길드원 아바타 3명 겹침 + "3명이 지금 길드 안에서 작업 중 · 오늘 누적 +820 EXP"

**Validation**:
- 빈 필드 제출 시: "이메일과 비밀번호를 모두 입력해 주세요."
- 잘못된 자격증명: "이메일 또는 비밀번호가 일치하지 않습니다." (어느 쪽 틀렸는지 노출 X — 계정 enumeration 방어)

**Behavior**:
- 로딩 중: 버튼 텍스트 "입장 중…"으로 변경, disabled
- `status === "pending"` 응답 시 → `/pending` 라우팅
- 일반 401/400 → 에러 메시지 표시 (필드는 그대로 유지)
- 성공 → `/quests` 또는 메인으로

---

### 2. 회원가입 (`/signup`)

**Purpose**: 초대코드 검증 후 이름/이메일/비밀번호 입력. 가입 후 `status=pending`으로 저장 → `/pending`으로 라우팅.

**Layout**:
- 1440 × 900, 좌(640px) 폼 / 우(800px) 초대장 비주얼

**2-Step 구조**:
- **STEP 1: 비밀 열쇠 입력** (코드 검증 통과해야 STEP 2 활성)
- **STEP 2: 모험가 정보 등록** (이름/이메일/비번/약관)

**좌측 STEP 1**:
- 상단: Logo + 진행도 "STEP 01 · 열쇠 › STEP 02 · 모험가 정보"
- 라벨: "CHAPTER 01 · INVITATION" (amber-700, font-extrabold, tracking-widest)
- h1: "비밀 열쇠를 입력하세요." (30px)
- 서브: "길드장이 발급한 8자리 열쇠 코드로 잠긴 문을 열 수 있어요."
- 라벨 행: "🔑 비밀 열쇠 코드" / "4 + 4 · A-Z / 0-9" (모노)
- **8자리 열쇠 입력**: 두 개의 4자리 input + 하이픈 구분자
  - 각 input: h-16, font-mono, font-black, text-[26px], tracking-[0.18em], uppercase
  - 자동 정제: 영문 대문자/숫자만 허용 (`.toUpperCase().replace(/[^A-Z0-9]/g, "")`)
  - 첫 박스 4자리 입력 완료 시 두 번째로 포커스 자동 이동
  - 두 번째 박스에서 Enter → 코드 검증 시작
  - 채워진 박스: amber-400 border + amber-50 bg + amber 글로우
  - 에러 상태: red-400 border + red 글로우
- 보안 안내: 🛡️ "열쇠는 1회만 사용 가능 · 5회 실패 시 IP 일시 차단"
- 버튼: `🔓 봉인 해제` (검증 중엔 "열쇠 확인 중…")
- 안내 박스: amber-50, 픽셀 두루마리 + "열쇠가 없으신가요? 길드장에게 요청 또는 슬랙 #ud2-onboarding"

**좌측 STEP 2**:
- 상단: "CHAPTER 02 · PROFILE" + "✓ 봉인 해제됨" 그린 칩
- h1: "모험가 정보 등록"
- 가입 진척도 GameBar (segments=12, value=현재완료개수, max=4)
- 필드 4개:
  - 이름 (user 아이콘, 2자 이상 검증)
  - 이메일 (mail 아이콘, regex 검증)
  - 비밀번호 (lock 아이콘, eye 토글, **4단계 강도 게이지** + 라벨)
  - 약관 동의 체크박스 (길드 행동 강령 + 개인정보 처리방침)
- 버튼: ← 이전 / `📜 가입 신청서 제출` (모두 채워야 활성)

**비밀번호 강도 계산 (그대로 사용)**:
```js
const pwStrength = useMemo(() => {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}, [pw]);
const pwLabel = ["", "취약", "보통", "양호", "강함"][pwStrength];
const pwColor = ["#a8a29e", "#dc2626", "#f59e0b", "#0ea5e9", "#10b981"][pwStrength];
```
- 4세그먼트 바 + 우측에 라벨 텍스트
- 강도 2 이상 필수 (양호 미만 거절)

**우측 초대장 비주얼 (440px)**:
- 픽셀 스프라이트 표시 (STEP 0: Key / STEP 1: Scroll), wobble 애니메이션
- 게임 윈도우 카드:
  - 헤더 바 (amber-400, 2px stone-800 border): "★ INVITATION FROM GUILD MASTER ★"
  - 내용:
    - "UD2 WORKSPACE" 모노 라벨
    - "퍼블리싱팀 길드" 20px font-black
    - "Markup Story · 봄 시즌"
    - 픽셀 방패 sprite
    - 길드장 정보: CharBox(유, lv 12) + "김유정 · 길드장 (Admin)"
    - 3개 메타 박스 (테두리 stone-200, 모노 폰트):
      - VALID · 26.06.10
      - SLOTS · 3 / 5
      - START · Lv. 1
    - **입력된 코드 시각화**: 좌측 입력 따라 amber로 채워지는 8개 칸
- 길드원 4명 캐릭터 박스 (Level 표시) + "4명의 길드원이 새 동료를 기다려요"

**Behavior**:
- STEP 1 검증 통과해야 STEP 2 진입 (잘못된 코드로 다른 정보 폼 노출 X)
- STEP 1에서 5회 실패 시 IP 일시 차단 (백엔드 처리, UI는 일반 에러 메시지)
- STEP 2 폼 완료 후 제출 → POST `/api/auth/signup` → 성공 시 `/pending` 이동

---

### 3. 승인 대기 (`/pending`)

**Purpose**: `status=pending` 상태 사용자가 보는 화면. 자동 폴링으로 상태 변경 감지.

**Layout**:
- 1440 × 900 풀스크린
- 상단 헤더 (60px, white/80 backdrop-blur, 2px stone-200 border-b)
- 메인 카드 720px 중앙

**헤더**:
- 좌: Logo
- 우: ⏳ "승인 대기 중" 칩 + 신청자 이메일 + 로그아웃 버튼

**메인 카드** (white bg, 2px stone-800 border, 8px 하단 그림자):
- **타이틀 바** (amber-400, 2px stone-800 border-b): "★ GUARDIAN'S GATE · 관문 ★" (모노, font-extrabold, tracking-widest)
- 우측 상단에 작은 픽셀 아이콘 2개 (윈도우 버튼 느낌)
- 본문:
  - 픽셀 모래시계 (Hourglass scale=5, amber-50 박스 안, swing 애니메이션)
  - 떨어지는 모래 픽셀 (sandFrame state로 위치 변경, 700ms 간격)
  - h1: "관문 앞에서 대기 중…" (28px)
  - 서브: 신청자 이메일 + "업무시간 내 1시간 이내 처리" 안내
  - **3단 진행도** (퀘스트 단계 스타일):
    1. 📜 신청서 제출 — done (emerald-400, 3px 그림자)
    2. 🔍 길드장 검토 중 — now (amber-400, amber 글로우 보더)
       - 서브: "⏳ {fmt(elapsed)} 경과" (1초마다 증가)
    3. 🏰 워크스페이스 입장 — todo (stone-100, 회색)
    - 사이 연결선: 3개 작은 사각형 (완료 그라데이션 / 미완료 stone-300)
  - 길드장 정보 박스 (stone-50, 2px stone-200):
    - CharBox(유, lv 12) + 이름 + "🛡️ 던전 탐험가" 칩 + 이메일
    - 액션: `📣 슬랙으로 알리기` (variant=soft sm)

**하단 미니 퀘스트** (대기 중 사전 온보딩):
- 라벨: 💎 "승인 대기 중 챌린지 · 미리 +20 EXP 받기"
- 2개 카드 그리드:
  - 📖 길드 행동 강령 읽기 (3분 소요, +20 EXP)
  - ⚔️ 퀘스트 미리보기 (샘플 작업 둘러보기)
  - 호버 시 amber-400 border + 3px 그림자

**Behavior**:
- 클라이언트에서 15초마다 `/api/auth/me` 폴링:
  ```js
  setInterval(async () => {
    const r = await fetch("/api/auth/me");
    const me = await r.json();
    if (me.status === "active") router.push("/quests");
    if (me.status === "rejected") router.push("/login?rejected=1");
  }, 15000);
  ```
- 경과 시간 1초마다 업데이트 (`elapsed` state)
- 모래 떨어지는 애니메이션 700ms 간격

---

### 4. 관리자 멤버 승인 (`/admin/members`)

**Purpose**: 관리자만 접근. pending 멤버 목록 확인 → 자동 보안 검증 검토 → 입장 허가/거부.

**라우트 보호**: middleware에서 `payload.role !== "admin"` → `/quests`로 리다이렉트.

**Layout** (1440 × 900):
- 상단 헤더 (60px, amber-50 bg, 2px stone-800 border-b)
- 3컬럼: 좌(320px) 목록 / 중(flex-1) 상세 / 우(360px) 감사 로그

**헤더**:
- 좌:
  - Logo (icon only)
  - 픽셀 방패 + "모험가 심사" 14px font-black + "GUILD MASTER · ADMIN" 모노 라벨
  - 구분선
  - 메뉴 4개 (📊 대시보드 / 📜 퀘스트 / 🛡️ 길드원 active / ⚙️ 설정)
    - active는 2px stone-800 border + red 카운트 배지
- 우:
  - 🔥14 스트릭 칩 + 본인 CharBox(유, lv 12) + "김유정 · 길드장"

**좌측 목록** (stone-50 bg, 2px stone-200 border-r):
- 검색창 (이름/이메일, search 아이콘)
- 필터 토글 3개 (전체 / 오늘 / 주의 N개) — 활성 시 amber 3D 버튼
- 신청자 카드 리스트:
  - CharBox (위험 신청은 red 색상) + 이름 + 위험 칩 + 결정 칩 (입장/거부)
  - 이메일 (모노) + 경과 시간 (모노)
  - 선택 시: amber 보더 + 3px 그림자
  - 결정된 신청자: opacity 60

**중앙 상세** (스크롤 영역):
- 헤더: `#UD2-00001 · 오늘 14:22 신청 (8분 전)` (모노)
- **모험가 캐릭터 카드** (게임 윈도우 스타일):
  - 큰 CharBox 84px
  - "NEW" 라벨 (좌상단 작은 모노 칩)
  - "APPLICANT" 모노 라벨 → 이름 (26px font-black)
  - "🌱 Lv. 0 모험가 지망생" 칩 + 이메일 + "외부 도메인" 빨간 칩 (해당시)
  - 결정 후 상단 우측에 결정 칩 (✓ 입장 허가됨 / ✕ 입장 거부됨)
  - 점선 구분선 아래 3개 메타: 희망 역할 / 추천인 (작은 CharBox 포함) / 사용한 열쇠 (모노)
- **신청 메시지** (note 있을 때): 📜 라벨 + amber-50 박스에 인용
- **자동 보안 검증** (4개 체크 항목, 능력치 시트 스타일):
  - 회사 도메인 (@ud2.co)
  - 유효한 열쇠 코드 (발급자 · 만료 전)
  - 신청 IP (서울, 차단 이력 없음)
  - 중복 신청 없음
  - 각 항목: ✓ (emerald) 또는 ✕ (red) + 라벨 + 상세
- **액션 바** (sticky bottom, white bg, 2px stone-300 border-t):
  - 결정 전: 🚫 입장 거부 (danger) / ⏰ 나중에 (ghost) / 우측: ⌘+↵ 힌트 + 🎉 입장 허가 (success)
  - 결정 후: 결과 메시지 + ↩ 되돌리기

**확인 모달** (게임 다이얼로그):
- 배경 stone-900/40 backdrop-blur
- 440px 카드, 2px stone-800 border, 8px 하단 그림자
- 타이틀 바 (승인=emerald-400 / 거부=red-400): "★ ENTRY APPROVAL ★" or "★ ENTRY REJECTION ★"
- 큰 이모지 🎉 / 🚫
- "{이름}님을 길드에 합류시킬까요?"
- 안내문: 승인=즉시 입장+합류 알림 / 거부=알림 발송+30일 락
- 버튼: 취소 / ✓ 입장 허가 or ✕ 입장 거부

**우측 감사 로그** (stone-50 bg, 2px stone-200 border-l):
- 라벨: "📋 감사 로그 · TIMELINE"
- 타임라인 (세로 stone-300 라인, 각 이벤트마다 amber 사각 마커):
  - 가입 신청서 접수 (오늘 14:22 · IP)
  - 초대장 열람 (오늘 14:08)
  - 초대 이메일 발송 (어제 09:15)
  - 열쇠 발급 (어제 09:14 · 발급자 · 5회 사용 가능 · 코드)
- 추천 판정 박스 (amber-50, 2px amber-400):
  - 회사 도메인 → 입장 허가 권장
  - 외부 도메인 → 추천인에게 1차 확인 후 결정 권장
  - "📣 {추천인}에게 슬랙 확인" 액션 버튼

---

## Interactions & Behavior

### 픽셀 스프라이트 컴포넌트
`v2/primitives.jsx`의 `<Pix>` 컴포넌트가 핵심입니다. 픽셀맵 문자열 배열 + 팔레트 객체를 받아 1px viewBox SVG로 렌더합니다.

```jsx
function Pix({ map, palette, scale = 4, style, className }) {
  const w = map[0].length, h = map.length;
  return (
    <svg width={w*scale} height={h*scale} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", ...style }}>
      {map.flatMap((row, y) => row.split('').map((ch, x) =>
        palette[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[ch]} /> : null
      ))}
    </svg>
  );
}
```

스프라이트 6종(Hero, Hourglass, Key, Shield, Scroll, Gem)은 그대로 옮기거나 `.svg` 파일로 export해서 `next/image` 또는 `<img>`로 사용해도 됩니다.

### 3D 버튼
```css
/* primary */
border: 2px solid #b45309; /* amber-700 */
background: #fbbf24; /* amber-400, hover: amber-300 */
color: #451a03; /* amber-950 */
box-shadow: 0 4px 0 0 #b45309;
&:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 0 #b45309;
}
```
- ghost: stone-300 보더 / shadow stone-300
- success: emerald-400 / emerald-700
- danger: red-100 / red-400 보더 / shadow red-500

### EXP 바
- 20개 세그먼트 (`flex gap-[2px] p-[3px]`)
- 컨테이너: stone-100 bg, 2px tone-700 border
- 채워진 세그먼트: tone-400 bg
- 빈 세그먼트: stone-200 bg

### 입력 필드 포커스 글로우
```css
border: 2px solid #d6d3d1; /* stone-300 */
/* focus */
border-color: #fbbf24; /* amber-400 */
box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22);
/* error */
border-color: #f87171; /* red-400 */
box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.18);
```

### 애니메이션 (CSS keyframes)
- `bob`: 마스코트 (2.4s, translateY 0 → -6px)
- `wobble`: 회원가입 스프라이트 (3s, rotate -3deg ↔ 3deg + translateY)
- `swing`: 모래시계 (4s, rotate -2deg ↔ 2deg)
- `sandfall`: 모래 픽셀 (0.8s linear infinite)

---

## State Management

### 로그인 (`/login`)
```ts
const [email, setEmail] = useState("");
const [pw, setPw] = useState("");
const [showPw, setShowPw] = useState(false);
const [remember, setRemember] = useState(true);
const [loading, setLoading] = useState(false);
const [err, setErr] = useState<string | null>(null);
```

### 회원가입 (`/signup`)
```ts
const [step, setStep] = useState<0 | 1>(0);
const [code, setCode] = useState<[string, string]>(["", ""]);
const [codeErr, setCodeErr] = useState<string | null>(null);
const [verifying, setVerifying] = useState(false);
const [name, setName] = useState("");
const [email, setEmail] = useState("");
const [pw, setPw] = useState("");
const [showPw, setShowPw] = useState(false);
const [agree, setAgree] = useState(false);
```

### 승인 대기 (`/pending`)
```ts
const [elapsed, setElapsed] = useState(0); // 신청 시각부터 누적 초
// 1초마다 +1, 15초마다 status 폴링
```

### 관리자 (`/admin/members`)
```ts
const [filter, setFilter] = useState<"all" | "today" | "risk">("all");
const [search, setSearch] = useState("");
const [selected, setSelected] = useState<number | null>(null);
const [decided, setDecided] = useState<Record<number, "approved" | "rejected">>({});
const [confirm, setConfirm] = useState<"approved" | "rejected" | null>(null);
```

---

## Security UX (반드시 지킬 9가지)

1. **에러는 모호하게** — "이메일 또는 비밀번호 불일치" (어느 쪽이 틀렸는지 노출 X, 계정 enumeration 방어)
2. **JWT는 HttpOnly 쿠키** — localStorage 금지. SameSite=lax + secure. Refresh도 동일.
3. **초대코드 4+4 분할** — 8자 한 칸은 오타율 높음. 그룹 분리 + 자동 포커스. 1회 사용 + 5회 실패 시 IP 일시 차단.
4. **코드 검증을 정보 입력 전 분리** — STEP 1 통과해야 STEP 2 폼 노출. 잘못된 코드로 다른 정보 폼 노출 X.
5. **pending은 403** — 로그인은 성공시키되 보호 라우트 차단. 신청자가 자기 상태 명확히 인지.
6. **관리자 승인은 2-step** — 리스트에서 바로 승인 X. 카드 확장 → 모달 → 확정. 실수로 외부인 합류 방지.
7. **거절 30일 락 + 알림** — 같은 이메일 재신청 일시 제한. 신청자에게 결과 알림.
8. **의사결정 화면에 컨텍스트 모두** — 추천인/IP/도메인/중복을 같은 화면에서 즉시 확인.
9. **외부 도메인은 시각 경고** — @gmail.com 등은 빨간 "외부 도메인" 칩. 의식적 클릭 한 번 더.

---

## Backend API 가이드 (Spring 연결)

### `POST /api/auth/login`
```ts
// Next.js Route Handler가 Spring을 프록시
const r = await fetch(`${process.env.SPRING_API}/auth/login`, {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
const { access, refresh, status } = await r.json();

cookies().set("ud2_at", access, {
  httpOnly: true, secure: true, sameSite: "lax",
  maxAge: 60 * 30, path: "/",
});
cookies().set("ud2_rt", refresh, {
  httpOnly: true, secure: true, sameSite: "lax",
  maxAge: 60 * 60 * 24 * 14, path: "/",
});

if (status === "pending") return new NextResponse(null, { status: 403 });
return NextResponse.json({ ok: true });
```

### `POST /api/auth/signup`
- Body: `{ inviteCode, name, email, password }`
- 응답: `{ status: "pending" }` 후 클라가 `/pending`으로 이동
- 백엔드: 초대코드 검증 → 사용횟수 +1 → 유저 생성 (status=pending) → 관리자에게 알림

### `GET /api/auth/me`
- 현재 사용자 status 조회 (pending 화면에서 폴링)
- 응답: `{ id, name, email, status: "pending" | "active" | "rejected", role }`

### `POST /api/admin/members/:id/approve`
- Authorization 검증: role === "admin" 필수
- 응답: `{ ok: true, member: {...} }`
- 백엔드: status active로 변경 + audit_log 기록 + 신청자에게 알림

### `POST /api/admin/members/:id/reject`
- 동일. status=rejected + 30일 락 추가

### `middleware.ts`
```ts
const PUBLIC = ["/login", "/signup", "/pending"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("ud2_at")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!));
    if (payload.status === "pending") return NextResponse.redirect(new URL("/pending", req.url));
    if (payload.role !== "admin" && pathname.startsWith("/admin")) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = { matcher: ["/((?!_next|api|favicon).*)"] };
```

---

## Design Tokens

### Colors
```ts
// 베이스
white: "#ffffff",
stone: {
  50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1",
  400: "#a8a29e", 500: "#78716c", 700: "#44403c", 800: "#292524",
  900: "#1c1917", 950: "#0c0a09"
},
// 액센트 (Tailwind amber)
amber: {
  50: "#fffbeb", 100: "#fef3c7", 300: "#fcd34d", 400: "#fbbf24",
  500: "#f59e0b", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03"
},
// 상태색
emerald: { 100: "#d1fae5", 400: "#34d399", 600: "#059669", 700: "#047857", 950: "#022c22" },
red: { 100: "#fee2e2", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 950: "#450a0a" },
blue: { 100: "#dbeafe", 400: "#60a5fa", 500: "#3b82f6", 700: "#1d4ed8" },
```

### Typography
```ts
fontFamily: {
  sans: "'SUIT Variable', 'Pretendard Variable', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
}
// 사이즈 (px)
text: { 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30 }
fontWeight: { medium: 500, bold: 700, extrabold: 800, black: 900 }
```

### Spacing & Border
- Border: 항상 **2px solid** (1px X)
- Border radius: `4 / 6 / 8 / 10 / 12 / 16px`
- Padding 카드: `p-6` ~ `p-10`
- Gap: 2 / 3 / 4 / 5

### Shadow
블러된 그림자 X. 하단 색 오프셋만 사용:
```ts
// 버튼 (primary)
boxShadow: "0 4px 0 0 #b45309"  // amber-700
// 버튼 active 상태
boxShadow: "0 1px 0 0 #b45309"
// 카드 (큰 강조)
boxShadow: "0 6px 0 0 #1c1917"  // stone-900
// 카드 (모달)
boxShadow: "0 8px 0 0 #1c1917"
// 포커스 글로우
boxShadow: "0 0 0 3px rgba(245, 158, 11, 0.22)"
```

---

## Assets

### 폰트
- **SUIT Variable**: `https://cdn.jsdelivr.net/gh/sun-typeface/SUIT/fonts/variable/woff2/SUIT-Variable.css`
- **Pretendard Variable**: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css`
- **JetBrains Mono**: Google Fonts (`https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap`)

실제 프로젝트에서는 `next/font/local` 또는 `next/font/google`로 옮기세요.

### 픽셀 스프라이트
6종 모두 `v2/primitives.jsx`에 인라인 정의되어 있습니다. 그대로 옮기거나, 다음 명령으로 SVG 파일로 export 가능:
- `Hero` — 14×14 마스코트 (로그인 우측)
- `Hourglass` — 12×14 모래시계 (대기 화면)
- `Key` — 16×10 열쇠 (가입 STEP 1)
- `Shield` — 12×14 방패 (관리자 / 가입 우측)
- `Scroll` — 14×10 두루마리 (가입 STEP 2)
- `Gem` — 8×8 보석 (EXP 인디케이터)

### 이모지 (현재 인라인)
🏰 🔑 🔓 📜 🛡️ ⏳ 🔍 🎉 🚫 📣 📊 ⚙️ 🌱 🔥 ⚔️ 📖 💎 ⏰ — Apple/Twemoji 시스템 이모지 그대로 사용

---

## Files

이 폴더에 포함된 파일:
- `UD2 인증 화면 v2.html` — 메인 진입점, **7개 화면 + TS 핸드오프 코드**를 design canvas에 모아둠
- `v2/tokens.jsx` — 디자인 토큰
- `v2/primitives.jsx` — 픽셀 엔진 + 모든 공통 컴포넌트 (Pix, Hero, Hourglass, Key, Shield, Scroll, Locked, Gem, Logo, Btn, Field, GameBar, ChipG, CharBox, I)
- `v2/screens/login.jsx` — ① 로그인
- `v2/screens/signup.jsx` — ② 회원가입 (4+4 분할, 2-step)
- `v2/screens/pending.jsx` — ③ 승인 대기 ("관문 앞에서 대기 중…")
- `v2/screens/admin.jsx` — ④ 관리자 멤버 승인 + 초대코드 발급 패널 (개편)
- `v2/screens/not-member-modal.jsx` — ⑤ "길드원이 아니에요!" 모달
- `v2/screens/guild-join.jsx` — ⑥ 길드 가입 폼 `/guild-join`
- `v2/snippets-extra.jsx` — **TypeScript 핸드오프 코드** (API 명세 + DB 스키마 + 플로우 다이어그램)
- `design-canvas.jsx` — 화면들을 한 페이지에 모아 보여주는 캔버스 (실제 구현에선 불필요)

브라우저에서 `UD2 인증 화면 v2.html`을 직접 열어 동작/픽셀 디테일을 확인하면서 작업하세요.

---

## Open Questions / Decisions Needed

이 항목들은 디자인에서 정하지 않은 부분입니다. 백엔드/PM과 확인 필요:

1. **초대코드 형식**: 디자인은 8자리(4+4) 가정. 실제 백엔드 발급 형식 확인 필요.
2. **JWT 만료 시간**: Access 30분 / Refresh 14일로 가정. 보안 요구사항에 따라 조정.
3. **승인 알림 채널**: 이메일 + 슬랙(`#ud2-onboarding`)? 백엔드와 합의 필요.
4. **거절 락 기간**: 디자인은 "30일"로 안내. 실제 정책 확인.
5. **관리자 권한 단계**: 디자인은 admin/member 2단계. 더 세분화 필요한가?
6. **레벨/EXP 시스템**: 로그인 화면에 보이는 Lv. 12 / 1,240 EXP / 🔥14는 실제 백엔드에서 어떻게 계산되는지? (이번 인증 플로우 범위 밖이지만 화면에 노출됨)
