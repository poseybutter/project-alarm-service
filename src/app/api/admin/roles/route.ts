import { NextResponse, type NextRequest } from "next/server";
import {
  deleteRole,
  listRoleCatalog,
  saveRole,
} from "@/features/admin/server/roleRepository";
import { adminErrorResponse, readTeamId } from "@/features/admin/server/http";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listRoleCatalog(readTeamId(request.url)),
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  return save(request);
}

export async function PATCH(request: NextRequest) {
  return save(request);
}

async function save(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.teamId !== "string" ||
      typeof body.key !== "string" ||
      typeof body.name !== "string" ||
      !Array.isArray(body.permissions)
    ) {
      return NextResponse.json(
        { message: "잘못된 역할 저장 요청입니다." },
        { status: 400 },
      );
    }
    const result = await saveRole({
      id: typeof body.id === "string" ? body.id : undefined,
      teamId: body.teamId,
      key: body.key.trim(),
      name: body.name,
      description:
        typeof body.description === "string" ? body.description : undefined,
      permissions: body.permissions,
    });
    return NextResponse.json(result, {
      status: request.method === "POST" ? 201 : 200,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { message: "삭제할 역할을 선택해 주세요." },
        { status: 400 },
      );
    }
    await deleteRole(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
