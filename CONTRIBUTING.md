# 기여 가이드

이 문서는 이 저장소의 작업 규칙 원본입니다. 사람과 AI 작업자 모두 이 문서를 따릅니다.
AI 작업자의 권한 경계는 [`docs/ai/AI-협업-가이드.md`](docs/ai/AI-협업-가이드.md)를 함께 적용합니다.

## 1. 기본 원칙

- 하나의 PR은 하나의 목적만 가집니다. 목적이 다른 변경은 이슈와 PR을 분리합니다.
- 규칙의 원본은 저장소 안 문서입니다. 문서와 코드가 어긋나면 같은 PR에서 문서를 함께 고칩니다.
- 커밋 메시지, 코드 주석, 저장소 문서는 한국어로 작성합니다.

## 2. Git과 GitHub

### 작업 타입

| 타입       | 용도                            |
| ---------- | ------------------------------- |
| `feat`     | 새로운 기능 또는 기존 기능 확장 |
| `fix`      | 버그 수정                       |
| `refactor` | 동작을 유지하는 코드 구조 개선  |
| `test`     | 테스트 추가 또는 수정           |
| `docs`     | 문서 추가 또는 수정             |
| `ci`       | CI·CD와 자동화 변경             |
| `chore`    | 설정, 의존성과 기타 유지보수    |

### 제목과 브랜치

- 커밋·PR 제목: `type: 작업 요약` — 간결한 한국어 명사형 (`추가`, `수정`. `추가했습니다` 지양)
- 흐름 (1인 운영 기준): `develop`에 직접 push → push 마다 CI 검증 → 배포 시점에 `develop` → `main` 승격 PR.
  승격 PR에서 리뷰(CodeRabbit)·CodeQL·의존성 검사·제목 검증이 수행되고, 머지가 곧 운영 배포입니다.
- `main` 직접 push 는 금지합니다. 승격 PR은 squash 하지 않습니다 (두 브랜치의 공통 조상 유지).
- 범위가 크거나 되돌릴 가능성이 있는 작업은 지금처럼 `<type>/<작업요약>` 브랜치(영문 kebab-case)로 분리해 `develop` PR을 거칠 수 있습니다.
- 버전·릴리스: `main` push 시 자동화(`notify.yml`)가 `package.json` 버전 기준으로 태그·GitHub Release·알림을 만듭니다.
  버전은 릴리스 목적의 승격 PR에서만 올리고, 이미 태그로 존재하는 버전은 다시 쓰지 않습니다.

### PR

- PR 본문은 [`.github/pull_request_template.md`](.github/pull_request_template.md)의 섹션 구조를 그대로 따릅니다.
- 체크박스는 사실대로만 체크합니다. 직접 확인하지 않은 항목은 미체크로 두고 확인 필요 경로를 적습니다.
- CI 실패와 CodeRabbit의 actionable 코멘트를 처리한 뒤 머지합니다.
- 관련 이슈가 있으면 `Closes #번호`, 없으면 "없음"과 작업 배경을 적습니다.

## 3. 폴더 구조

| 경로 | 책임 |
| --- | --- |
| `src/app/` | App Router 라우트 — 페이지 조립과 Route Handler(HTTP 경계)만. 도메인 로직을 두지 않습니다 |
| `src/features/<도메인>/` | 도메인별 코드. `components/`(화면) · `hooks/`(상태) · `api/`(클라이언트 호출) · `server/`(서버 전용) 하위 구조 |
| `src/components/` | 특정 도메인에 묶이지 않는 공용 UI 컴포넌트 |
| `src/hooks/` | 공용 훅 |
| `src/shared/` | 타입·상수·유틸·스타일. `shared/server/`는 서버 전용 공용 모듈 |
| `src/infrastructure/` | 외부 서비스 어댑터 (supabase, google-calendar, google-chat, security) |
| `db/` | SQL 마이그레이션 (`V<번호>_<설명>.sql`) |

### 의존 방향

- 공용 계층(`components/`, `hooks/`, `shared/`)은 `features/`를 import 하지 않습니다. 도메인 코드가 공용 모듈을 조합합니다.
- `server/` 디렉터리의 코드는 클라이언트 컴포넌트에서 import 하지 않습니다.
- 두 도메인 이상에서 쓰이면 `src/components/`·`src/shared/`로 올리되, 올릴 때 도메인 의존을 끊습니다.

### 파일과 네이밍

- React 컴포넌트는 `PascalCase.tsx`, 훅은 `use`로 시작하는 `camelCase.ts`, 그 외 모듈은 `camelCase.ts`.
- 파일 하나는 하나의 주요 책임을 담당합니다. 작은 전용 하위 컴포넌트는 같은 파일에 둘 수 있습니다.
- import 순서: 외부 패키지 → 공용 모듈(`@/components`, `@/shared`) → 도메인 모듈(`@/features`).

### 점진 이행 규칙

현재 `src/app/` 라우트 밑에 큰 도메인 컴포넌트들이 남아 있습니다 (예: `app/manage/`, `app/report/`).
한 번에 옮기지 않습니다 — 다음 규칙으로 수렴시킵니다.

- 새 파일은 처음부터 `src/features/<도메인>/`에 만듭니다.
- 기존 파일은 **기능 수정으로 크게 손댈 때** 함께 `features/`로 이동합니다. 단순 버그 수정에서는 옮기지 않습니다.
- 이동만 하는 커밋과 수정 커밋은 분리합니다 (diff 가독성).

## 4. 코드 작성 규칙

이 저장소에서 반복 확인된 패턴을 원본으로 사용합니다. 새 코드는 인접 코드의 기존 패턴을 먼저 확인하고 따릅니다.

### 서버 경계

- 점수(EXP·레벨·출석) 쓰기는 DB `SECURITY DEFINER` RPC가 단일 출처입니다. 클라이언트에서 직접 쓰지 않습니다. ([ADR: 점수 쓰기 RPC 단일화](docs/adr/점수-쓰기-RPC-단일화.md))
- 관리자 변경과 민감한 연동 데이터는 Next.js Route Handler(서버)를 통해서만 접근합니다.
- 일반 업무 데이터 조회는 클라이언트가 Supabase를 직접 조회합니다 (RLS 전제).

### React

- 신규 데이터 조회는 TanStack Query(`useQuery`)로 작성합니다. 조회 함수는 `features/<도메인>/api/`(순수, setState 없음),
  훅은 `features/<도메인>/hooks/`에 두고, queryKey 에 `teamId` 를 포함해 팀 전환을 자동 처리합니다 (예: `features/quests`, `features/home`).
- 내부 `/api/*` 호출은 `shared/api/client.ts` 의 `apiFetch` 를 경유합니다 (에러 정규화 일원화).
- effect 안에서 동기 setState를 호출하지 않습니다. prop 변경에 따른 상태 리셋은 렌더 중 `prev` 비교 패턴을 사용합니다.
- 아직 전환하지 않은 수제 조회 코드는 세대 가드(`seqRef`/`generationRef`)를 유지하되, 크게 손댈 때 `useQuery` 로 전환합니다.
- Supabase realtime 구독은 팀 필터를 겁니다. DELETE 는 페이로드에 PK만 있어 무필터로 받되 리페치 쿼리를 팀 스코프로 유지합니다.
- 이미지는 `next/image`를 사용합니다. 원격 호스트는 `next.config.ts`의 `remotePatterns`에 추가합니다.

### 주석

- 간결한 명사형으로 적습니다. 장황한 서술형은 지양합니다.
  (`// 연속 실행 경합 방지 — PR 단위 직렬화` ○ / `// 연속 실행이 겹치면 옛 값이 남을 수 있어서 직렬화한다` ✕)
- 코드로 드러나는 내용은 반복하지 않고, "왜"가 필요한 결정·제약에만 답니다.

### Supabase 와 보안

- 새 테이블은 RLS 를 켜고 팀 스코프 정책을 함께 만듭니다. 정책 없는 테이블을 남기지 않습니다.
- 환경 변수는 `NEXT_PUBLIC_*` 만 클라이언트에 노출됩니다. service role key·`CRON_SECRET` 은 서버 전용이며, `.env.local` 과 실제 값은 커밋하지 않습니다.
- 날짜·주차 경계는 Asia/Seoul(KST) 기준입니다. 브라우저 로컬 시간대에 의존하는 비교를 넣지 않습니다.

### DB 마이그레이션

- `db/V<번호>_<설명>.sql` 순번 파일로 관리합니다. 적용된 파일은 수정하지 않고 새 번호로 추가합니다.
- 스키마 변경 PR은 영향 범위 섹션에 적용 순서와 롤백 방법을 기재합니다.

## 5. 테스트와 검증

- PR 전에 `npm run check` 를 실행합니다 (lint → typecheck → test → build 를 순차 실행).
- 화면 변경은 주요 상태(로딩·빈 목록·오류)와 팀 전환 시나리오를 직접 확인합니다.
- CI(`.github/workflows/ci.yml`)는 같은 네 단계에 더해 prod 의존성 취약점 검사(`npm audit --omit=dev`)를 수행합니다.
  문서만 바뀐 변경은 CI 를 건너뜁니다. PR 제목 형식은 별도 워크플로가 검증하고 타입 라벨을 자동 부여합니다.

## 6. 문서

- 개발 규칙·아키텍처·설계 결정은 저장소 `docs/`의 md 파일이 원본입니다. PR 리뷰를 거치지 않는 Wiki에는 새 규칙 문서를 추가하지 않습니다.
- 구조에 영향을 주는 설계 결정은 [`docs/adr/`](docs/adr/)에 ADR로 기록합니다 (현황과 근거, 선택지, 결과).
- `docs/` 안의 md 파일명은 직관적인 한글로 짓습니다 (예: `테스트-계정-전략.md`). 폴더 인덱스 용도의 `README.md`만 예외입니다.
- 민감 정보(실명·이메일·토큰·운영 URL 내부 경로)는 문서에 포함하지 않습니다.
