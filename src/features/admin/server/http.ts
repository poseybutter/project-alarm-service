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

/**
 * 요청 본문을 JSON 객체로 읽는다. 잘못된 JSON·객체가 아닌 본문은
 * 서버 오류(500)가 아니라 400 으로 응답하도록 AdminApiError 를 던진다.
 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AdminApiError("요청 본문이 올바른 JSON이 아닙니다.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AdminApiError("요청 본문 형식이 올바르지 않습니다.", 400);
  }
  return body as Record<string, unknown>;
}
