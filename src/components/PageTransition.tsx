"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * framer-motion 의 motion.div 가 SSR HTML 과 클라이언트 첫 paint 에서
 * inline style 이 어긋나 hydration mismatch 가 발생한다.
 * → 첫 마운트는 plain fragment 로, 마운트 완료 후에만 motion 을 적용한다.
 */
export default function PageTransition({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <AnimatePresence mode="sync" initial={false}>
            <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{}}
                transition={{ duration: 0.15, ease: "easeOut" }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
