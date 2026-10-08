# 점수 쓰기는 SECURITY DEFINER RPC 로만

## 상태

적용 중

## 맥락

일반 업무 데이터는 클라이언트가 Supabase 를 직접 조회·수정한다 (RLS 전제). 그러나 EXP·레벨·출석 같은 점수 데이터까지 클라이언트가 직접 쓰면 변조가 가능하고, 적립 규칙(중복 출석 방지, 완료 보상 계산)이 클라이언트 코드에 흩어진다.

## 결정

- 점수(EXP·레벨·출석) 쓰기는 DB `SECURITY DEFINER` RPC(`rpcAttendanceCheck`, `rpcSetQuestDone` 등)가 단일 출처다.
- 클라이언트의 점수 테이블 직접 쓰기는 RLS 로 차단한다.
- 적립·레벨업 규칙은 RPC(DB) 안에서만 계산한다. 관련 마이그레이션: `db/V12_score_logic_server.sql`, `db/V55_score_rpc_hardening.sql`.

## 결과

- 점수 변조가 DB 경계에서 차단되고, 규칙이 한 곳에 모인다.
- 클라이언트는 RPC 반환값(적립 여부·레벨업)을 그대로 표시만 한다.
- 규칙 변경 시 DB 마이그레이션이 필요하다 (배포 절차가 코드보다 무거움을 감수).
