# 보안 운영 설정

## 연동 토큰 암호화

운영 환경에는 32바이트 난수를 Base64로 인코딩한
`INTEGRATION_TOKEN_ENCRYPTION_KEY`를 설정한다. 키는 저장소에 커밋하지 않는다.

```sh
openssl rand -base64 32
```

키를 설정하면 새 Google Calendar 토큰과 Google Chat Webhook URL은
AES-256-GCM으로 암호화되어 저장된다. 기존 평문 값도 다음 사용 시 자동으로
암호화된다. 이미 암호화된 데이터가 있는
상태에서 키를 잃으면 복구할 수 없으므로 배포 플랫폼의 암호화된 Secret 저장소와
별도 복구 절차로 관리한다. 같은 데이터베이스를 사용하는 Production, Preview,
로컬 환경에는 반드시 동일한 키를 설정한다.

## 배포 순서

민감 테이블의 기존 클라이언트 접근 정책을 먼저 제거하면 구버전 앱이 중단될 수
있으므로 다음 순서를 지킨다.

1. `db/V35_sensitive_agent_data_boundaries.sql`을 적용한다.
2. 이 보안 변경이 포함된 애플리케이션을 배포한다.
3. 배포 성공 직후 `db/V36_enforce_sensitive_agent_data_boundaries.sql`을 적용한다.
4. `db/V37_block_viewer_briefing_writes.sql`을 적용한다.
5. 아래 쿼리 결과가 비어 있는지 확인한다.

```sql
select *
from private.security_rls_audit
where risk_level <> 'ok';
```

`V35`는 새 레벨업 알림 이벤트와 보존 함수를 추가하는 호환 변경이다. `V36`은
민감 데이터 접근을 service role을 사용하는 서버 API로만 제한하는 강제 변경이다.

## 데이터 보존

`public.purge_expired_agent_security_data()`를 service role로 주기적으로 실행한다.
현재 정책은 레벨업 이벤트·완료된 에이전트 제안·개인 알림 발송 이력을
180일, 동기화된 캘린더 이벤트를 90일, 인증·관리자 감사 로그를 365일간
보존한다.

유지보수 현황 링크는 `NEXT_PUBLIC_MAINTENANCE_STATUS_URL`로 설정한다. 이 값은
브라우저에서 보이는 공개 설정이므로 접근 권한은 대상 문서 서비스에서도 별도로
제한해야 한다.

## GitHub

공개 저장소에서는 Secret scanning, Push protection, Dependabot security updates,
CodeQL과 기본 브랜치 보호를 활성화한다. 개인 이메일 대신 GitHub noreply 이메일을
사용한다.
