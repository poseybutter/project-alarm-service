import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export function internalErrorResponse(
    scope: string,
    error: unknown,
    publicMessage = "요청을 처리하지 못했습니다.",
) {
    const requestId = randomUUID();
    console.error(`[${scope}:${requestId}]`, error);
    return NextResponse.json(
        { message: publicMessage, requestId },
        { status: 500 },
    );
}

