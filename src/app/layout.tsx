import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { AuthProvider } from "@/components/AuthProvider";

/** 배포 후 아이콘이 폰에 안 바뀌면 숫자만 올려서 캐시 무효화 */
const ICON_CACHE = "v=2";

export const metadata: Metadata = {
    title: "UD2팀 업무 관리",
    description: "UD2 퍼블리싱팀 전용 업무 관리 앱",
    manifest: `/manifest.json?${ICON_CACHE}`,
    icons: {
        icon: [
            {
                url: `/icons/app-icon-256.png?${ICON_CACHE}`,
                sizes: "256x256",
                type: "image/png",
            },
            {
                url: `/icons/app-icon-512.png?${ICON_CACHE}`,
                sizes: "512x512",
                type: "image/png",
            },
        ],
        /** iOS 홈 화면은 180×180이 일반적 (192 PNG 없음 → app-icon-180 사용) */
        apple: `/icons/app-icon-180.png?${ICON_CACHE}`,
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "UD2",
    },
    formatDetection: {
        telephone: false,
    },
    openGraph: {
        type: "website",
        title: "UD2팀 업무 관리",
        description: "UD2 퍼블리싱팀 전용 업무 관리 앱",
    },
};

export const viewport: Viewport = {
    themeColor: "#ff6600",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <head>
                {/* metadata.icons 외에 sizes·캐시 무효화용 (모바일 PWA 아이콘 갱신) */}
                <link
                    rel="apple-touch-icon"
                    sizes="180x180"
                    href={`/icons/app-icon-180.png?${ICON_CACHE}`}
                />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta
                    name="apple-mobile-web-app-status-bar-style"
                    content="default"
                />
                <meta name="apple-mobile-web-app-title" content="UD2" />
                <link
                    href="https://cdn.jsdelivr.net/npm/remixicon@4.0.0/fonts/remixicon.css"
                    rel="stylesheet"
                />
            </head>
            <body className="bg-[#f7f6f3]">
                <AuthProvider>
                    {children}
                    <Nav />
                </AuthProvider>
            </body>
        </html>
    );
}
