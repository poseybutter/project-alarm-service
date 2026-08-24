import { NextResponse } from "next/server";
import { ApiError, signup } from "@/lib/api";
import { internalErrorResponse } from "@/lib/server/apiResponse";
import {
    consumeRateLimit,
    rateLimitResponse,
    requestRateLimitKey,
} from "@/lib/server/rateLimit";

export async function POST(req: Request) {
    let payload: {
        email?: string;
        password?: string;
        name?: string;
        invitationCode?: string;
    };
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json(
            { message: "잘못된 요청 형식이에요" },
            { status: 400 },
        );
    }

    const email = payload.email?.trim();
    const password = payload.password;
    const name = payload.name?.trim();
    const invitationCode = payload.invitationCode?.trim();

    if (!email || !password || !name || !invitationCode) {
        return NextResponse.json(
            { message: "모든 항목을 입력해주세요" },
            { status: 400 },
        );
    }

    const rate = consumeRateLimit(
        requestRateLimitKey(req, "auth-signup", email),
        { limit: 5, windowMs: 60 * 60 * 1000 },
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    try {
        await signup(email, password, name, invitationCode);
        return NextResponse.json({
            ok: true,
            message: "가입 신청이 완료되었어요. 승인을 기다려주세요.",
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return NextResponse.json(
                { message: "가입 정보를 확인하거나 잠시 후 다시 시도해주세요." },
                { status: err.status },
            );
        }
        return internalErrorResponse("auth-signup", err, "가입에 실패했어요.");
    }
}
