# 문서 지도

저장소 문서는 이 표가 전부입니다. 처음 왔다면 위에서부터 읽습니다.

| 문서 | 내용 | 언제 읽나 |
| --- | --- | --- |
| [README.md](../README.md) | 서비스 소개·기술 스택·로컬 실행 | 처음 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 작업 규칙 원본 — Git·폴더·코드·DB·검증 | 코드를 고치기 전 |
| [AGENTS.md](../AGENTS.md) | AI 작업 규칙 원본 (`CLAUDE.md`는 이 파일을 불러옴) | AI로 작업할 때 |
| [docs/adr/](adr/) | 설계 결정과 근거 | 구조·DB·권한을 바꾸기 전 |
| [docs/ai/리뷰-체크리스트.md](ai/리뷰-체크리스트.md) | AI 자체 검수 기준 | PR 전 |
| [docs/admin-architecture.md](admin-architecture.md) | 관리자 영역 구조와 서버 API 경계 | 관리자 기능을 바꿀 때 |
| [docs/agent-notification-plan.md](agent-notification-plan.md) | 아침 알림 에이전트 설계 | 알림 기능을 바꿀 때 |
| [design_handoff_auth_flow/](../design_handoff_auth_flow/README.md) | 인증 화면 디자인 핸드오프 | 인증 화면을 바꿀 때 |
| [db/](../db/) | SQL 마이그레이션 (`V<번호>_<설명>.sql`, 번호순 적용) | DB를 바꿀 때 |

## 문서 운영 원칙

- 규칙은 한 문서에만 둡니다. 다른 문서에서는 위치만 링크합니다 (복사하면 한쪽만 고쳐져 어긋남).
- 문서와 코드가 다르면 같은 PR에서 문서를 고칩니다.
- 새 문서를 만들면 이 표에 한 줄 추가합니다.
