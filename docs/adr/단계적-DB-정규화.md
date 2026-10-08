# players 호환을 유지하는 단계적 DB 정규화

## 상태

진행 중

## 맥락

초기 스키마는 `players` 테이블이 사용자·팀 소속·점수를 모두 담는 비정규 구조였다. 멀티 팀 멤버십을 지원하려면 `profiles`(사용자) / `team_memberships`(소속·역할) / `access_requests`(가입 신청) 분리가 필요하지만, 업무·리포트 조회 전반이 `players`에 의존하고 있어 일괄 교체는 위험하다.

## 결정

- 정규 테이블(`profiles`, `team_memberships`, `access_requests`)을 추가하되, 호환 트리거로 `players`와 양방향 동기화한다.
- 호환 단계에서는 **legacy `players` 갱신을 권위(authoritative)로 취급**하고, 정규 테이블 기록 실패는 로그만 남긴다 (`adminRepository`의 `isIdentitySchemaUnavailable` 처리).
- 업무·리포트 조회가 정규 테이블 기준으로 안정화된 뒤 레거시 컬럼을 순서대로 제거한다.

## 결과

- 멀티 팀 멤버십(#49)을 기존 화면을 깨지 않고 도입했다.
- 과도기 동안 두 스키마를 모두 이해해야 하고, 동기화 트리거 유지비가 든다.
- 제거 순서는 마이그레이션 파일(`db/V61_atomic_membership_ops.sql` 이후)로 추적한다.
