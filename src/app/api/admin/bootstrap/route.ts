import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/features/admin/server/adminRepository";
import { adminErrorResponse, readTeamId } from "@/features/admin/server/http";

export async function GET(request: NextRequest) {
  try {
    const bootstrap = await requireAdminSession(readTeamId(request.url));
    return NextResponse.json(bootstrap);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
