import { NextResponse, type NextRequest } from "next/server";
import { getIntegrationOverview } from "@/features/admin/server/adminRepository";
import { adminErrorResponse, readTeamId } from "@/features/admin/server/http";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await getIntegrationOverview(readTeamId(request.url)),
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
