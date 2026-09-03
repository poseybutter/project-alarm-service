import { NextResponse, type NextRequest } from "next/server";
import {
  addTeamMembership,
  listAdminMembers,
  removeTeamMembership,
  reorderTeamMembers,
  updateAdminMember,
} from "@/features/admin/server/adminRepository";
import { adminErrorResponse, readTeamId } from "@/features/admin/server/http";

type ReorderEntry = { membershipId: string; playerId: number; sortOrder: number };

/** 순서 변경 페이로드 런타임 검증. 실패 시 사용자에게 보여줄 메시지를 반환한다. */
function parseReorderOrder(
  value: unknown,
): { order: ReorderEntry[] } | { message: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { message: "순서 목록이 비어 있거나 올바르지 않습니다." };
  }

  const order: ReorderEntry[] = [];
  const membershipIds = new Set<string>();
  const playerIds = new Set<number>();
  const sortOrders = new Set<number>();

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) {
      return { message: "순서 목록 항목이 올바르지 않습니다." };
    }
    const entry = raw as Record<string, unknown>;

    const membershipId =
      typeof entry.membershipId === "string" ? entry.membershipId.trim() : "";
    const playerId = Number.isInteger(entry.playerId)
      ? (entry.playerId as number)
      : 0;
    if (!membershipId && playerId <= 0) {
      return { message: "구성원 식별자가 없는 항목이 있습니다." };
    }
    if (membershipId && membershipIds.has(membershipId)) {
      return { message: "중복된 구성원이 포함되어 있습니다." };
    }
    if (playerId > 0 && playerIds.has(playerId)) {
      return { message: "중복된 구성원이 포함되어 있습니다." };
    }

    if (!Number.isInteger(entry.sortOrder)) {
      return { message: "순서 값은 정수여야 합니다." };
    }
    const sortOrder = entry.sortOrder as number;
    if (sortOrder < 0 || sortOrder >= value.length) {
      return { message: "순서 값은 0부터 연속된 정수여야 합니다." };
    }
    if (sortOrders.has(sortOrder)) {
      return { message: "중복된 순서 값이 있습니다." };
    }

    if (membershipId) membershipIds.add(membershipId);
    if (playerId > 0) playerIds.add(playerId);
    sortOrders.add(sortOrder);
    order.push({ membershipId, playerId, sortOrder });
  }

  // 위 검사로 0..n-1 순열이 보장된다. 구성원 전체 일치 여부는 DB RPC가 검증한다.
  return { order };
}

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
      action?: unknown;
      id?: unknown;
      membershipId?: unknown;
      teamId?: unknown;
      role?: unknown;
      roleId?: unknown;
      status?: unknown;
      order?: unknown;
    };

    if (body.action === "reorder") {
      if (typeof body.teamId !== "string" || !body.teamId.trim()) {
        return NextResponse.json(
          { message: "잘못된 순서 변경 요청입니다." },
          { status: 400 },
        );
      }
      const parsed = parseReorderOrder(body.order);
      if ("message" in parsed) {
        return NextResponse.json({ message: parsed.message }, { status: 400 });
      }
      await reorderTeamMembers({
        teamId: body.teamId,
        order: parsed.order,
      });
      return NextResponse.json({ ok: true });
    }

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
