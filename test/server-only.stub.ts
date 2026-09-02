// vitest 전용 스텁.
// 서버 모듈은 "server-only" 를 import 해 클라이언트 번들 유입을 막는데,
// 이 패키지는 Next 번들러 밖(vitest)에서는 해석되지 않는다.
// vitest.config.ts 의 resolve.alias 가 이 빈 모듈로 치환한다.
export {};
