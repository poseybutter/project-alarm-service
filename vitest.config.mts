import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    resolve: {
        tsconfigPaths: true,
        alias: {
            // 서버 모듈의 import "server-only" 는 Next 번들러 밖에서 해석되지 않는다.
            // 서버 리포지토리를 직접 테스트할 수 있도록 빈 모듈로 치환한다.
            "server-only": fileURLToPath(
                new URL("./test/server-only.stub.ts", import.meta.url),
            ),
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
});
