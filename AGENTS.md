# AGENTS.md

AI 작업자(Claude Code·Codex·Cursor 등) 공통 규칙의 원본입니다.
규칙은 이 파일에서만 고칩니다. 도구별 파일(`CLAUDE.md`)은 이 파일을 불러오기만 합니다.
세부 기준은 아래 문서에 있고, 여기서는 위치만 가리킵니다.

## 1. 절대 규칙

1. 확인하지 못한 값(이슈 번호·날짜·운영 DB 상태·검증 결과)은 추측으로 채우지 않고 사용자에게 묻습니다.
2. push, PR 생성·머지, 이슈·코멘트 등 GitHub 상태 변경은 사용자 승인 후에만 합니다. 승인은 그 작업에만 유효합니다.
3. `.env*` 등 시크릿 파일은 직접 고치지 않고 필요한 값만 안내합니다. 비밀값을 파일·커밋·PR에 쓰지 않습니다.
4. 운영 DB에 직접 적용하지 않습니다. SQL은 `db/` 파일로 만들고 적용은 사용자가 합니다.
5. 실행하지 않은 검증은 완료로 표시하지 않습니다.

## 2. 작업 흐름

| 단계 | 할 일 | 멈추고 확인받을 때 |
| --- | --- | --- |
| 시작 | `git status`·브랜치 확인, 관련 [ADR](docs/adr/) 읽기 | 기존 변경이 있거나 브랜치가 맞지 않을 때 |
| 계획 | DB 스키마·인증·권한·API 계약 변경은 구현 전에 계획 제시 | 항상 (승인 후 구현) |
| 구현 | 요청 범위 안의 파일만 수정, 범위 밖 문제는 보고만 | 범위가 커지거나 전제가 틀렸을 때 |
| 검증 | `npm run check` + [리뷰 체크리스트](docs/ai/리뷰-체크리스트.md) | 실패하거나 `미확인` 항목이 남을 때 |
| 커밋·PR | [CONTRIBUTING.md](CONTRIBUTING.md) > 2. Git과 GitHub 형식 | push·PR 생성 전 |

## 3. 작업별로 먼저 읽을 문서

| 작업 | 문서 |
| --- | --- |
| 모든 작업 | [docs/adr/](docs/adr/) — 이미 정한 설계 결정 |
| 코드 작성·폴더·네이밍 | [CONTRIBUTING.md](CONTRIBUTING.md) > 3. 폴더 구조, 4. 코드 작성 규칙 |
| 브랜치·커밋·PR·Stack | [CONTRIBUTING.md](CONTRIBUTING.md) > 2. Git과 GitHub |
| DB·RLS·RPC | [CONTRIBUTING.md](CONTRIBUTING.md) > 4 > Supabase 와 보안, DB 마이그레이션 |
| PR 전 자체 검수 | [docs/ai/리뷰-체크리스트.md](docs/ai/리뷰-체크리스트.md) |
| 전체 문서 위치 | [docs/README.md](docs/README.md) |

## 4. 저장소 특이사항

- PR 본문은 `.github/pull_request_template.md` 구조로 직접 작성합니다 (`gh pr create`는 템플릿을 자동 적용하지 않음).
- 리뷰 봇 코멘트는 현재 코드로 직접 확인한 뒤 반영하고, 반영 커밋으로 스레드에 답합니다.
- `package-lock.json`에서 `@emnapi/*`만 빠지는 diff는 플랫폼 노이즈입니다. 되돌리고, 의존성 변경이 없으면 `npm ci`를 씁니다.
- 커밋에 Co-Authored-By 트레일러를 넣지 않습니다.
- 답변·문서·커밋·PR은 한국어로 작성합니다.
- 아래 Next.js 블록은 `next dev`가 관리합니다. 지우지 않습니다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
