import { NextResponse, type NextRequest } from "next/server";
import {
  listAccessRequests,
  reviewAccessRequest,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse, readTeamId } from "@/features/admin/server/http";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      requests: await listAccessRequests(readTeamId(request.url)),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      decision?: unknown;
      teamId?: unknown;
      role?: unknown;
    };
    if (
      !Number.isInteger(body.id) ||
      (body.decision !== "approve" && body.decision !== "reject")
    ) {
      return NextResponse.json(
        { message: "잘못된 승인 요청입니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      request: await reviewAccessRequest({
        id: body.id as number,
        decision: body.decision,
        teamId: typeof body.teamId === "string" ? body.teamId : undefined,
        role: body.role === "admin" ? "admin" : "member",
      }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
