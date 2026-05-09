# 🧩 UD2팀 업무 관리 앱

> UD2 퍼블리싱팀 전용 업무 관리 웹앱  
> 업무 등록 → 자동 취합 → 주간 브리핑까지 한 곳에서

**🔗 배포 URL:** https://project-alarm-service.vercel.app  
**🔒 접근:** 허가된 UD2팀 구글 계정만 로그인 가능  
**📱 PWA:** 홈 화면 / 작업 표시줄에 앱으로 설치 가능

---

## 📌 주요 기능

### 🏠 홈
- 본인 EXP / 레벨 / 출석 체크 현황
- 활동 잔디 히트맵 (출석 + 업무 완료 + 퀘스트 완료 합산)
- 오늘의 퀘스트 CRUD (추가 / 수정 / 삭제 / 완료)
  - 내 업무를 드래그해서 퀘스트로 추가 가능
  - 프로젝트 react-select 검색 연동
- 내 미완료 업무 목록 (상태 변경 가능)
- 레벨업 시 confetti 애니메이션 + 팀 전체 구글챗 알림
- 완료/퀘스트/출석 시 EXP 팝업 애니메이션

### 📋 업무 관리
- 업무 추가 / 수정 / 삭제
- 담당자 / 구분 / 우선순위 / 기간 / 공수 설정
- **작업 계획 토글** — 다음 주 예정 업무 등록, 주간 브리핑에 자동 포함
- DayPicker로 기간 선택 (연/월 드롭다운 지원)
- 상태 변경 (대기 → 시작 전 → 진행중 → 완료)
- 완료 시 EXP 자동 지급 + 활동 잔디 반영
- **이번 주(수~수) 기준** 필터링 (작업 계획 타입은 항상 표시)
- Realtime 동기화
- **권한:** 본인 업무만 수정/삭제 (관리자는 전체)

### 📊 리포트
- 주간 / 월간 탭 전환
- **주간 전달사항** — 관리자가 Tiptap 에디터로 작성 (B/I/H1/H2/목록 지원)
- **주간 브리핑** — 등록된 업무 기반 자동 생성
  - 프로젝트 / 유지보수 / 기타 / 작업 계획 섹션 자동 취합
  - 수요일 오전 10시 이후 편집 가능
  - 리더가 수동 잠금/해제 가능
  - 섹션별 Copy 버튼 (노션 붙여넣기 지원)
  - 자동 생성으로 복원 버튼
- **담당 배정** — 배정현황 / 배정대기 관리
  - URL 하이퍼링크 지원
  - 배정대기 사업기간 메모
  - Copy 버튼으로 전체 복사
- 팀원별 상세 아코디언

### 👤 프로필
- 레벨 / EXP / 출석 체크
- 획득한 칭호 배지 표시
- EXP 랭킹 (이번 달 기준)
- 이번 주 팀원별 공수 바
- 지난 업무 조회 (기간 / 프로젝트 / 상태 필터)
- 칭호 / 성장 탭
- 프로필 이미지 업로드 (인스타그램 스타일 액션 시트)

### 🗂️ 관리
- **프로젝트 관리**
  - 팀 전체 프로젝트 목록 (담당자 / 언어 / PM / 개발자 / 디자이너 / 빈도 / 이전담당 / 비고)
  - 아코디언 UI + 검색 / 담당자 / 언어 필터 + 가나다순 / 담당자순 정렬
  - react-select 검색 연동
- **접근성 관리**
  - 팀 전체 접근성 인증 현황
  - 상태: 신청필요 / 신청완료 / 취득·갱신완료 / 신청불필요
  - D-14 이내 빨간 강조, D-15~45 주황 강조
  - 신규 프로젝트 NEW 배지
  - pg_cron으로 만료 D-60에 자동 신청필요 변경
  - GAS 알림: 신청필요 상태 D-45 이내 개인 DM 발송

---

## 🎮 게이미피케이션

업무를 재미있게! 메이플스토리에서 영감받은 레벨 시스템이에요.

### ⚔️ 레벨 시스템

| 레벨 | 이름 | 필요 EXP |
|------|------|----------|
| Lv.1 | 🌱 풋내기 모험가 | 0 |
| Lv.2 | 🗡️ 수련 중인 검사 | 500 |
| Lv.3 | 🛡️ 던전 탐험가 | 1,500 |
| Lv.4 | ✨ 이름난 용병 | 3,000 |
| Lv.5 | 🔥 보스 사냥꾼 | 7,000 |
| Lv.6 | 💎 아케인 리버 개척자 | 15,000 |
| Lv.7 | 🌟 메이플 월드의 전설 | 35,000 |
| Lv.8 | 👑 검은 마법사의 숙적 | 70,000 |

### 💰 EXP 획득 방법

| 행동 | 획득 EXP |
|------|----------|
| 업무 완료 | +50 EXP |
| 긴급 업무 완료 | +100 EXP |
| 출석 체크 | +20 EXP |
| 퀘스트 완료 | +10 EXP |

> 레벨업 시 confetti 애니메이션 + 구글챗 팀 전체 축하 알림! 🎊

### 🏆 칭호 시스템

| 칭호 | 조건 |
|------|------|
| 🌱 첫 완료 | 첫 번째 업무 완료 |
| 🔥 꾸준러 | 3일 연속 출석 |
| ⚡ 주간 챔피언 | 7일 연속 출석 |
| ⏰ 마감지킴이 | D-day 전 완료 5건 |
| 💪 업무 달인 | 완료 10건 |
| 🏆 베테랑 | 완료 30건 |
| 🚨 긴급 해결사 | 긴급 업무 5건 완료 |
| ⭐ 중급 탐험가 | 레벨 5 달성 |

### 🌿 활동 잔디
- 출석 체크 / 업무 완료 / 퀘스트 완료 합산
- GitHub 잔디처럼 16주 히트맵으로 시각화
- 활동량에 따라 색상이 진해짐 (연초록 → 진초록)
- Realtime 반영

### 🏆 주간 MVP
- 매주 월요일 앱 접속 시 지난주 MVP 자동 선정
- 주간 EXP + 완료 업무 수 합산 기준
- confetti 오버레이로 축하 표시

---

## 🤖 자동화 (GAS)

Google Apps Script로 구글챗 자동 알림을 운영해요.

### 📨 아침 알림 (평일 오전 8-9시)
- **개인 DM**으로 발송
- 오늘의 퀘스트 목록 (마감일 포함)
- 진행중인 업무 목록 (🚨 D-day / ⚠️ D-3 이내 강조)
- 주말 / 한국 공휴일 자동 제외

### 🌐 접근성 만료 알림
- **개인 DM**으로 발송
- 신청필요 상태 + D-45 이내 자동 발송
- D-day 또는 기한 초과 🚨, D-3 이내 ⚠️

### 🎊 레벨업 알림
- 레벨업 시 **팀 전체 채팅**으로 자동 발송

---

## 🛠 기술 스택

| 분야 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS |
| 데이터베이스 | Supabase (PostgreSQL) |
| 인증 | Supabase Auth (Google OAuth) |
| 실시간 | Supabase Realtime |
| 배포 | Vercel |
| 자동화 | Google Apps Script |
| 에디터 | Tiptap |
| 날짜 선택 | React DayPicker |
| 검색 Select | react-select |
| 드래그앤드롭 | @dnd-kit/core |
| 애니메이션 | Framer Motion + canvas-confetti |
| PWA | manifest.json + 아이콘 |
| 아이콘 | Remix Icon |

---

## 📁 프로젝트 구조

```
pubteam/src/
├── app/
│   ├── page.tsx              # 홈 (퀘스트, 내 업무, EXP, 잔디)
│   ├── tasks/page.tsx        # 업무 관리 (수~수 기준 필터)
│   ├── report/page.tsx       # 리포트 (브리핑, 배정현황)
│   ├── profile/page.tsx      # 프로필 (내정보, 지난업무, 성장)
│   ├── manage/page.tsx       # 관리 (프로젝트, 접근성)
│   ├── login/page.tsx        # 구글 로그인
│   └── auth/callback/page.tsx
├── components/
│   ├── Nav.tsx               # 하단 네비게이션 (5탭)
│   ├── Header.tsx            # 공통 헤더
│   ├── AuthProvider.tsx      # 인증 컨텍스트
│   ├── AuthGuard.tsx         # 로그인 보호
│   ├── UserMenu.tsx          # 헤더 드롭다운
│   ├── Avatar.tsx            # 팀원 아바타 (전역 캐시)
│   ├── AttendanceHeatmap.tsx # 활동 잔디 히트맵
│   ├── LevelUpOverlay.tsx    # 레벨업 오버레이
│   ├── MvpOverlay.tsx        # 주간 MVP 오버레이
│   ├── ExpPopup.tsx          # EXP 획득 팝업
│   ├── DragQuestModal.tsx    # 드래그 퀘스트 모달
│   ├── DatePickerCaption.tsx # 커스텀 날짜 캡션
│   ├── TiptapSectionEditor.tsx # 브리핑 에디터
│   ├── Spinner.tsx           # 로딩 스피너
│   ├── NotificationButton.tsx
│   └── NotificationDrawer.tsx
├── lib/
│   ├── supabase.ts           # Supabase 클라이언트
│   ├── auth.ts               # 인증 유틸 (GUEST 처리)
│   ├── maple.ts              # EXP/레벨/잔디 로직
│   ├── types.ts              # 공통 타입
│   ├── constants.ts          # 공통 상수
│   ├── utils.ts              # 유틸 함수 (normalizeProject 등)
│   ├── reactSelectStyles.ts  # react-select 공통 스타일
│   └── googleChat.ts         # 구글챗 웹훅
└── app/api/notify/route.ts   # 구글챗 API Route
```

---

## 🗄 Supabase 테이블

| 테이블 | 설명 |
|--------|------|
| `tasks` | 업무 목록 (is_plan 작업계획 포함) |
| `players` | 팀원 EXP / 레벨 / 칭호 / 주간 EXP |
| `projects` | 프로젝트 목록 (멀티 담당자, 메타데이터) |
| `accessibility` | 웹 접근성 인증 관리 (is_new, 상태 4종) |
| `quests` | 오늘의 퀘스트 (task_id 연동) |
| `briefings` | 주간 브리핑 저장본 (잠금 지원) |
| `assignments` | 배정현황 / 배정대기 |
| `attendance` | 활동 잔디 기록 (activity_count) |

모든 테이블 RLS 활성화. GAS는 `service_role key`로 RLS 우회.

---

## 👥 권한 구조

| 역할 | 조건 | 권한 |
|------|------|------|
| `admin` | players.role = 'admin' | 전체 수정/삭제, 브리핑 잠금, 전달사항 편집 |
| `member` | players.role = 'member' | 본인 업무/퀘스트 수정, 프로젝트/접근성 추가 |
| `guest` | @example.com 도메인, MEMBER_EMAILS 미포함 | 읽기 전용 |

---

## ⚙️ 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_MEMBER_EMAILS=이메일:이름,이메일:이름,...
GOOGLE_CHAT_WEBHOOK=
```

---

## 🚀 로컬 실행

```bash
git clone https://github.com/poseybutter/project-alarm-service.git
cd project-alarm-service/pubteam
npm install

# .env.local 파일 생성 후 환경변수 입력
npm run dev
```

---

## 📱 PWA 설치

**Chrome (Windows / Mac)**
```
주소창 오른쪽 ⊕ 클릭 → 설치
작업 표시줄 / Dock에 고정 가능
```

**iPhone (Safari만 지원)**
```
공유 버튼(□↑) → 홈 화면에 추가
```

**Android**
```
Chrome 메뉴(⋮) → 앱 설치
```

---

## 🐛 버그 신고 / 기능 제안

[Issues 탭](https://github.com/poseybutter/project-alarm-service/issues)에서 제보해주세요!

| 라벨 | 설명 | 예시 |
|------|------|------|
| 🐛 `bug` | 버그, 오류 | Safari에서 select 색상 안 보임 |
| ✨ `feature` | 새 기능 요청 | 다크모드 지원 |
| 💄 `design` | UI/디자인 개선 | 모바일 레이아웃 깨짐 |
| 📚 `docs` | 문서, 설명 | 기능 안내 텍스트 수정 |

---

## 👥 팀원

| 이름 | 역할 |
|------|------|
| [TEAM_MEMBER_1](https://github.com/hyunseokzzang) | 리더 / 관리자 |
| TEAM_MEMBER_4 | 개발 / 관리자 |
| TEAM_MEMBER_2 | 팀원 |
| TEAM_MEMBER_3 | 팀원 |