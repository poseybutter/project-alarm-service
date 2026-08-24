import { NextResponse, type NextRequest } from "next/server";
import {
  createAdminTeam,
  deleteAdminTeam,
  listTeamsWithCounts,
  updateAdminTeam,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse } from "@/features/admin/server/http";

export async function GET() {
  try {
    return NextResponse.json({ teams: await listTeamsWithCounts() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
    };
    if (typeof body.id !== "string" || typeof body.name !== "string") {
      return NextResponse.json(
        { message: "팀 ID와 이름을 입력해 주세요." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        team: await createAdminTeam({
          id: body.id.trim(),
          name: body.name,
          description:
            typeof body.description === "string" ? body.description : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      status?: unknown;
    };
    if (
      typeof body.id !== "string" ||
      typeof body.name !== "string" ||
      (body.status !== "active" && body.status !== "archived")
    ) {
      return NextResponse.json(
        { message: "팀 ID, 이름과 상태를 확인해 주세요." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      team: await updateAdminTeam({
        id: body.id.trim(),
        name: body.name,
        description:
          typeof body.description === "string" ? body.description : undefined,
        status: body.status,
      }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id.trim()) {
      return NextResponse.json(
        { message: "삭제할 팀 ID를 입력해 주세요." },
        { status: 400 },
      );
    }
    await deleteAdminTeam(body.id.trim());
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
