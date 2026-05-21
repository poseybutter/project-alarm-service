/**
 * 관리자 전용 레이아웃.
 *
 * Next.js 의 root layout (src/app/layout.tsx) 은 항상 적용되므로
 * 여기서 하단 네비게이션을 제거할 수는 없다.
 * 대신 Nav 컴포넌트가 pathname.startsWith("/admin") 일 때 스스로 렌더를 건너뛴다.
 *
 * 이 layout 은 admin 화면 공통 컨테이너 자리를 잡아두는 역할 —
 * 추후 사이드바/헤더를 여기로 옮기면 admin 전 화면이 공유한다.
 */
export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <div className="min-h-screen bg-white">{children}</div>;
}
