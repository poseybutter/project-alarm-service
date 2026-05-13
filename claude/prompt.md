project-alarm-service/pubteam/src/app/report/ReportPage.tsx 파일을 분석해서
주간 전달사항 편집/저장 기능의 버그를 수정해줘.

## 버그 증상
1. 편집 모드에서 저장 버튼 클릭 시 saveNotice가 호출되지 않음
   - 콘솔에 아무것도 안 찍힘
   - 클릭 시 페이지 스크롤이 위로 튕김
2. 지난 주차(wOff < 0)에서 저장 시 이번 주(wOff=0) 화면으로 이동됨

## 원인 파악 및 수정 방향
1. 저장 버튼 주변에 form 태그가 있거나, 상위 버튼들에 type="button"이
   없어서 암묵적 form submit이 발생하는 것으로 의심
   - 파일 전체에서 button 태그 중 type 속성 없는 것 전부 type="button" 추가
   - 저장 버튼 onClick에 e.preventDefault() + e.stopPropagation() 추가
   - form 태그 있으면 onSubmit에 e.preventDefault() 추가

2. saveNotice 내 loadBriefing 완료 후 wOff가 초기화되는 문제
   - saveNotice 완료 후 wOff 값 유지
   - loadBriefing은 현재 wOff 기준으로만 동작하게

## 수정 범위
- ReportPage.tsx만 수정
- saveNotice 페이로드 로직 변경 없음
- 빌드 에러 없이 동작
- npx tsc --noEmit 통과 확인
