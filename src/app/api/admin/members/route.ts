import { NextResponse, type NextRequest } from "next/server";
import {
  addTeamMembership,
  listAdminMembers,
  removeTeamMembership,
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      teamId?: unknown;
      role?: unknown;
    };
    if (typeof body.email !== "string" || typeof body.teamId !== "string") {
      return NextResponse.json(
        { message: "잘못된 멤버십 추가 요청입니다." },
        { status: 400 },
      );
    }
    const role =
      body.role === "admin" || body.role === "viewer" ? body.role : "member";
    return NextResponse.json({
      membership: await addTeamMembership({
        email: body.email,
        teamId: body.teamId,
        role,
      }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      membershipId?: unknown;
      teamId?: unknown;
      role?: unknown;
      roleId?: unknown;
      status?: unknown;
    };
    const membershipId =
      typeof body.membershipId === "string" ? body.membershipId : undefined;
    // Allow id=0 when membershipId is present (new-schema member without legacy player row)
    const validId =
      Number.isInteger(body.id) &&
      (body.id !== 0 || membershipId !== undefined);
    if (!validId || typeof body.teamId !== "string") {
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
        membershipId,
        teamId: body.teamId,
        role,
        roleId: typeof body.roleId === "string" ? body.roleId : undefined,
        status,
      }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      membershipId?: unknown;
      teamId?: unknown;
    };
    if (
      typeof body.membershipId !== "string" ||
      typeof body.teamId !== "string"
    ) {
      return NextResponse.json(
        { message: "잘못된 멤버십 제거 요청입니다." },
        { status: 400 },
      );
    }
    await removeTeamMembership({
      membershipId: body.membershipId,
      teamId: body.teamId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
