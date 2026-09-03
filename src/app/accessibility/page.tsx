import { redirect } from "next/navigation";

// 접근성 관리는 /manage 의 접근성 탭으로 통합됐다.
// 기존 링크·북마크가 404 가 되지 않도록 리다이렉트만 남긴다.
export default function AccessibilityPage() {
    redirect("/manage");
}
