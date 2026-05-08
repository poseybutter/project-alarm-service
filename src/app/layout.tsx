import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
    title: "UD2팀 업무 관리",
    description: "UD2 퍼블리싱팀 전용 업무 관리 앱",
    manifest: "/manifest.json",
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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <head>
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#ff6600" />
                <link rel="apple-touch-icon" href="/icons/icon-192.png" />
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
