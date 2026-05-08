/**
 * 접근성 만료 알림용 조회 조건 스니펫
 *
 * sendAccessibilityExpiryAlert 함수에서 아래 조건으로 교체하세요.
 */
function sendAccessibilityExpiryAlert() {
  var accList = sbGet("accessibility?inspection_status=eq.신청필요&end_date=not.is.null") || [];

  var urgent = accList.filter(function(a) {
    var diff = getDday(a.end_date);
    return a.member === member && diff !== null && diff <= 45 && diff >= 0;
  });

  // 나머지 알림 로직은 기존 코드 유지
  return urgent;
}
