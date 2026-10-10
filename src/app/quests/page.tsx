import AuthGuard from "@/components/AuthGuard";
import QuestsPage from "@/features/quests/components/QuestsPage";

// 라우트는 조립만 담당 — 도메인 구현은 features/quests
export default function Page() {
    return (
        <AuthGuard>
            <QuestsPage />
        </AuthGuard>
    );
}
