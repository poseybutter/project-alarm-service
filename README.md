# 팀 업무 관리 앱

팀의 업무 등록·주간 브리핑·알림 자동화를 하나의 웹앱에서 처리합니다.

**배포 URL:** https://project-alarm-service.vercel.app  
**접근:** 회사 구글 계정 로그인 → 관리자 승인 후 이용 가능 (PWA 설치 지원)

---

## 주요 기능

- 업무 등록·상태 변경·완료 처리 및 주간 브리핑 자동 취합
- 오늘의 퀘스트 CRUD, EXP·레벨 게이미피케이션
- 개인 모닝 브리핑 자동 발송 (Google Chat DM + Vercel Cron)
- 관리자 영역: 구성원 승인, 팀·역할 관리, 감사 로그

---

## 설계 결정

**클라이언트 직접 쿼리와 서버 경계 분리**  
일반 업무 데이터는 클라이언트가 Supabase를 직접 조회합니다. 단, 점수(EXP·레벨·출석) 쓰기는 `SECURITY DEFINER` RPC를 통해서만 처리하며 클라이언트의 직접 쓰기는 차단합니다. 관리자 변경은 Next.js Route Handler를 서버 경계로 처리합니다.

**단계적 DB 정규화**  
기존 `players` 테이블 의존성을 유지하면서 `profiles`, `team_memberships`, `access_requests`를 호환 트리거로 동기화합니다. 업무·리포트 조회가 안정화된 뒤 레거시 컬럼을 순서대로 제거합니다.

**Spring Boot 이전 준비**  
현재 Next.js Route Handler가 담당하는 관리자 API 계약(`/api/admin/*`)을 유지한 채, 서버 구현만 Spring Boot로 교체할 수 있도록 설계했습니다. 프론트 컴포넌트는 이 과정에서 변경하지 않습니다.

---

## 기술 스택

| 분야 | 기술 |
|------|------|
| 프레임워크 | Next.js (App Router) |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS |
| 데이터베이스 | Supabase (PostgreSQL + RLS) |
| 인증 | Supabase Auth (Google OAuth) |
| 실시간 | Supabase Realtime |
| 배포 | Vercel |
| 자동화 | Vercel Cron, GitHub Actions |
| 에디터 | Tiptap |

---

## 보안

- 로그인 세션과 팀 소속은 서버에서 검증합니다.
- 역할과 권한은 팀 단위로 평가합니다.
- 민감한 연동 데이터는 서버 Route Handler를 통해서만 접근합니다.
- 운영 Secret과 환경 파일은 저장소에 커밋하지 않습니다.

---

## 로컬 실행

```bash
git clone https://github.com/poseybutter/project-alarm-service.git
cd project-alarm-service
npm install
# .env.local 환경변수 설정 후
npm run dev
```

---

## 문서 (Wiki)

아키텍처 상세, ERD, 인증 흐름, DB 마이그레이션 전략, Spring Boot 이전 계획은 [Wiki](../../wiki)에서 확인할 수 있습니다.

---

## 버그 신고 / 기능 제안

[Issues 탭](https://github.com/poseybutter/project-alarm-service/issues)에서 제보해 주세요.
