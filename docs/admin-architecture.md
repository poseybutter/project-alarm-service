# 관리자 영역 아키텍처

## 목표

관리자 UI를 기존 사용자 화면과 분리하고, 권한이 필요한 변경은 브라우저의 Supabase 직접 쿼리가 아니라 서버 API에서 처리한다. 현재 운영 환경에서는 Next.js Route Handler가 애플리케이션 경계를 담당하며, 이후 Spring Boot로 이전할 때도 프론트 API 계약을 유지한다.

## 현재 구조

```text
Browser
  -> /admin/*                 Next.js 관리자 UI
  -> /api/admin/*             인증·권한·입력 검증
      -> adminRepository      관리자 유스케이스와 데이터 접근
          -> Supabase         service role (서버 전용)
```

- 관리자 UI: `src/app/admin`, `src/features/admin/components`
- API: `src/app/api/admin`
- 권한과 데이터 접근: `src/features/admin/server`
- DB 기반: `db/V29_admin_foundation.sql`, `db/V30_admin_team_crud.sql`,
  `db/V31_identity_membership_foundation.sql`
- 서버 전용 키는 `adminRepository` 아래에서만 사용한다.
- 클라이언트가 보낸 `team` 값은 신뢰하지 않고 매 요청마다 관리 가능 범위를 다시 확인한다.

## 권한 모델

| 구분        | 저장 위치               | 범위                  |
| ----------- | ----------------------- | --------------------- |
| 조직 관리자 | `organization_admins`                  | 모든 팀, 팀 CRUD      |
| 팀 관리자   | `team_memberships.role = admin`         | 해당 `team_id`        |
| 구성원      | `team_memberships.role = member/viewer` | 관리자 영역 접근 불가 |

V31 전환 기간에는 기존 쓰기 경로가 `players`를 계속 사용하고 DB 트리거가
`profiles`, `team_memberships`, `access_requests`를 동기화한다. 서버의 로그인 및
관리자 권한 판정은 정규화 테이블을 먼저 읽되, V31 미적용 환경에서는 `players`로
폴백한다.

조직 관리자와 팀 관리자를 분리한다. 팀 관리자를 추가해도 조직 관리자로 승격되지 않는다. V29 최초 실행 시 기존 활성 관리자를 조직 관리자 초기값으로 한 번 이관한다.

서버는 다음 방어 규칙을 강제한다.

- 활성 상태가 아닌 계정은 관리자 권한을 얻지 못한다.
- 자신을 정지하거나 자신의 관리자 역할을 해제할 수 없다.
- 팀의 마지막 활성 관리자를 강등하거나 정지할 수 없다.
- 팀 관리자는 다른 팀의 구성원, 로그, 연동 정보를 읽을 수 없다.
- 미배정 접근 요청은 조직 관리자만 처리할 수 있다.
- 관리자 변경은 `admin_audit_logs`에 이전·이후 상태와 함께 기록한다.

## API 계약

| Method    | Path                      | 역할                                |
| --------- | ------------------------- | ----------------------------------- |
| GET       | `/api/admin/bootstrap`    | 사용자, 관리 범위, 조직 관리자 여부 |
| GET       | `/api/admin/dashboard`    | 운영 지표, 팀 현황, 최근 변경       |
| GET/PATCH | `/api/admin/requests`     | 접근 요청 조회·승인·거절            |
| GET/PATCH | `/api/admin/members`      | 구성원 조회·역할·상태 변경          |
| GET/POST/PATCH/DELETE | `/api/admin/teams` | 팀 조회·생성·수정·보관·삭제       |
| GET       | `/api/admin/logs`         | 관리자 감사 로그                    |
| GET       | `/api/admin/integrations` | Calendar·Chat·브리핑 연동 현황      |

조회 범위는 `?team=<team_id>`로 전달한다. 조직 범위는 파라미터를 생략한다. 오류 응답은 아래 형태를 유지한다.

```json
{
  "message": "사용자에게 표시할 오류 메시지",
  "requestId": "서버 로그 추적 ID"
}
```

## DB 적용 순서

1. `V28_public_table_rls_policies.sql`을 적용한다.
2. `V29_admin_foundation.sql`을 적용한다.
3. `V30_admin_team_crud.sql`을 적용한다.
4. `V31_identity_membership_foundation.sql`을 적용한다.
5. `V31_identity_membership_audit.sql`을 실행하고 모든 `issue_count`가 0인지 확인한다.
   로컬에서는 `node tools/verify-v31.mjs`로 같은 핵심 정합성을 읽기 전용으로
   재검증할 수 있다.
6. 기존 조직 관리자 이메일이 `organization_admins`에 들어갔는지 확인한다.
7. 관리자 화면에서 구성원 역할을 한 번 변경하고 감사 로그와
   `team_memberships`가 함께 갱신되는지 확인한다.

V29~V31은 기존 `players`, `tasks`, `projects` 데이터를 삭제하거나 이동하지 않는다.
V31은 정규화 테이블을 추가하고 호환 트리거로 동기화할 뿐 기존 업무·리포트
쿼리의 기준 테이블을 변경하지 않는다.

## Spring Boot 이전

Spring은 관리자 UI와 DB를 동시에 다시 만들지 않는다. API 계약을 유지한 채 서버 구현만 교체한다.

권장 모듈 경계:

```text
admin-domain
  member, team, access-request, permission, audit

admin-application
  GetDashboard
  ReviewAccessRequest
  ChangeMemberRole
  ChangeMemberStatus
  CreateTeam
  UpdateTeam
  ArchiveTeam
  DeleteTeam

admin-adapter-in-web
  AdminDashboardController
  AdminRequestController
  AdminMemberController
  AdminTeamController

admin-adapter-out-persistence
  JPA repositories
  Supabase PostgreSQL adapters

security
  Google/Supabase token verification
  OrganizationAdminPolicy
  TeamAdminPolicy
```

이전 순서:

1. Spring에서 `/api/admin/*`와 같은 DTO·상태 코드를 구현한다.
2. 계약 테스트로 Next Route Handler 응답과 Spring 응답을 비교한다.
3. Next Route Handler의 저장소 호출을 Spring 내부 API 호출로 교체한다.
4. 승인·구성원 변경부터 트래픽을 전환한다.
5. 조회 API를 전환한 뒤 `adminRepository`의 Supabase 구현을 제거한다.

프론트 컴포넌트는 이 과정에서 변경하지 않는 것이 원칙이다.

## 정규화 전환 단계

V31에서 사용자 프로필과 팀 소속의 분리를 시작한다.

- `profiles`: 사용자 1명당 1행, 인증 계정과 프로필·계정 상태
- `team_memberships`: 사용자와 팀의 N:M 관계, 기본 팀과 팀별 역할
- `access_requests`: 신청 팀·역할, 승인 결과, 검토자와 처리 시각

현재 호환 단계의 원칙:

1. 업무·리포트 등 기존 기능은 계속 `players`를 읽는다.
2. 기존 관리자 변경 API도 `players`에 쓰고 V31 트리거가 신규 테이블을 갱신한다.
3. 로그인과 관리자 권한 판정은 신규 테이블을 우선 사용한다.
4. V31 미적용 또는 스키마 캐시 지연 시에는 `players` 읽기로 폴백한다.
5. 정합성 검증이 끝나기 전에는 `players`나 기존 외래 키를 제거하지 않는다.

다음 전환은 `roles`, `permissions`, `role_permissions`를 추가해 역할과 권한을
분리하고, 클라이언트에 현재 팀 컨텍스트와 팀 전환 UI를 도입하는 것이다. 이후
쓰기 경로를 `team_memberships` 중심으로 전환한 뒤 마지막 단계에서만 레거시
`players.team_id`, `players.role` 의존성을 제거한다.

`roles` 계층은 팀 관리자와 조직 관리자를 혼합하지 않는다. 조직 관리자는 계속
`organization_admins`에서 별도로 관리하고, 팀 역할은 소속 단위로 평가한다.
