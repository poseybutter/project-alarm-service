import { NextResponse } from "next/server";
import { ApiError, signup } from "@/lib/api";

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

    try {
        await signup(email, password, name, invitationCode);
        return NextResponse.json({
            ok: true,
            message: "가입 신청이 완료되었어요. 승인을 기다려주세요.",
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return NextResponse.json(
                { message: err.message },
                { status: err.status },
            );
        }
        const message =
            err instanceof Error ? err.message : "가입에 실패했어요";
        return NextResponse.json({ message }, { status: 500 });
    }
}
