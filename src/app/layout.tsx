import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
    title: "UD2팀",
    description: "UD2팀 업무 관리",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body className="bg-stone-50 pb-20">
                {children}
                <Nav />
            </body>
        </html>
    );
}
