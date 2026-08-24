import { NextResponse, type NextRequest } from "next/server";
import {
  listAdminMembers,
  updateAdminMember,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse, readTeamId } from "@/features/admin/server/http";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      members: await listAdminMembers(readTeamId(request.url)),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      teamId?: unknown;
      role?: unknown;
      status?: unknown;
    };
    if (!Number.isInteger(body.id) || typeof body.teamId !== "string") {
      return NextResponse.json(
        { message: "잘못된 구성원 변경 요청입니다." },
        { status: 400 },
      );
    }
    const role =
      body.role === "admin" || body.role === "member" ? body.role : undefined;
    const status =
      body.status === "active" || body.status === "suspended"
        ? body.status
        : undefined;
    return NextResponse.json({
      member: await updateAdminMember({
        id: body.id as number,
        teamId: body.teamId,
        role,
        status,
      }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
