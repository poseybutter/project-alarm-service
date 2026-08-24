import { NextResponse } from "next/server";
import { AdminApiError } from "./adminRepository";

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json(
      { message: error.message, requestId: error.requestId },
      { status: error.status },
    );
  }

  const requestId = crypto.randomUUID();
  console.error(`[admin-api:${requestId}]`, error);
  return NextResponse.json(
    { message: "관리자 요청을 처리하지 못했습니다.", requestId },
    { status: 500 },
  );
}

export function readTeamId(url: string) {
  const value = new URL(url).searchParams.get("team");
  return value?.trim() || null;
}
