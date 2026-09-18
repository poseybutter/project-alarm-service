import { NextResponse, type NextRequest } from "next/server";
import {
    createServiceSupabaseClient,
    getServerUserRole,
} from "@/infrastructure/supabase/server";
import { internalErrorResponse } from "@/shared/server/apiResponse";
import { encryptField } from "@/shared/server/fieldEncryption";
import { loadNormalizedIdentity } from "@/features/identity/server/identityRepository";

type CredentialRow = {
    id: number;
    profile_id: string;
    label: string;
    login_id: string | null;
    encrypted_pw: string | null;
    notes: string | null;
    sort_order: number;
};

type MemberInfo = {
    profileId: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
};

/** GET — 팀원 자격증명 목록 (PW 마스킹) */
export async function GET(req: NextRequest) {
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim();
    if (!teamId) {
        return NextResponse.json({ message: "teamId is required" }, { status: 400 });
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || !role) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const svc = createServiceSupabaseClient();

        // 팀 멤버십 + 프로필 조회
        const { data: memberships, error: mErr } = await svc
            .from("team_memberships")
            .select("profile_id, profiles!inner(id, display_name, email, avatar_url)")
            .eq("team_id", teamId)
            .eq("status", "active");

        if (mErr) throw mErr;

        const memberMap = new Map<string, MemberInfo>();
        for (const m of memberships ?? []) {
            const p = m.profiles as unknown as {
                id: string;
                display_name: string;
                email: string;
                avatar_url: string | null;
            };
            memberMap.set(String(m.profile_id), {
                profileId: String(p.id),
                displayName: String(p.display_name),
                email: String(p.email),
                avatarUrl: p.avatar_url ? String(p.avatar_url) : null,
            });
        }

        // 자격증명 조회
        const { data: creds, error: cErr } = await svc
            .from("member_credentials")
            .select("id, profile_id, label, login_id, encrypted_pw, notes, sort_order")
            .eq("team_id", teamId)
            .order("sort_order");

        if (cErr) throw cErr;

        const members = [...memberMap.values()].map((member) => ({
            ...member,
            credentials: (creds as CredentialRow[] ?? [])
                .filter((c) => String(c.profile_id) === member.profileId)
                .map((c) => ({
                    id: c.id,
                    label: c.label,
                    loginId: c.login_id,
                    hasPassword: Boolean(c.encrypted_pw),
                    notes: c.notes,
                    sortOrder: c.sort_order,
                })),
        }));

        return NextResponse.json({ members });
    } catch (error) {
        return internalErrorResponse("mc-list", error);
    }
}

type CreateBody = {
    teamId?: string;
    profileId?: string;
    label?: string;
    loginId?: string;
    password?: string;
    notes?: string;
};

/** POST — 자격증명 추가 (관리자만) */
export async function POST(req: NextRequest) {
    let body: CreateBody;
    try {
        body = (await req.json()) as CreateBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const profileId = body.profileId?.trim();
    const label = body.label?.trim();
    if (!teamId || !profileId || !label) {
        return NextResponse.json(
            { message: "teamId, profileId, label are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || role !== "admin") {
        return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        const encryptedPw = body.password?.trim()
            ? encryptField(body.password.trim())
            : null;

        const { data, error } = await svc
            .from("member_credentials")
            .insert({
                team_id: teamId,
                profile_id: profileId,
                label,
                login_id: body.loginId?.trim() || null,
                encrypted_pw: encryptedPw,
                notes: body.notes?.trim() || null,
            })
            .select("id")
            .single();

        if (error) throw error;

        // 감사 로그
        void svc.from("member_credential_audit_logs").insert({
            team_id: teamId,
            credential_id: data.id,
            action: "create",
            actor_email: user.email,
        });

        return NextResponse.json({ ok: true, id: data.id });
    } catch (error) {
        return internalErrorResponse("mc-create", error);
    }
}

type UpdateBody = {
    teamId?: string;
    id?: number;
    label?: string;
    loginId?: string;
    password?: string;
    notes?: string;
};

/** PATCH — 자격증명 수정 (관리자만) */
export async function PATCH(req: NextRequest) {
    let body: UpdateBody;
    try {
        body = (await req.json()) as UpdateBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const id = body.id;
    if (!teamId || !id) {
        return NextResponse.json(
            { message: "teamId and id are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || role !== "admin") {
        return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        const update: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (body.label !== undefined) update.label = body.label.trim();
        if (body.loginId !== undefined) update.login_id = body.loginId.trim() || null;
        if (body.notes !== undefined) update.notes = body.notes.trim() || null;
        if (body.password !== undefined) {
            update.encrypted_pw = body.password.trim()
                ? encryptField(body.password.trim())
                : null;
        }

        const { error } = await svc
            .from("member_credentials")
            .update(update)
            .eq("id", id)
            .eq("team_id", teamId);

        if (error) throw error;

        void svc.from("member_credential_audit_logs").insert({
            team_id: teamId,
            credential_id: id,
            action: "update",
            actor_email: user.email,
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse("mc-update", error);
    }
}

type DeleteBody = { teamId?: string; id?: number };

/** DELETE — 자격증명 삭제 (관리자만) */
export async function DELETE(req: NextRequest) {
    let body: DeleteBody;
    try {
        body = (await req.json()) as DeleteBody;
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    const teamId = body.teamId?.trim();
    const id = body.id;
    if (!teamId || !id) {
        return NextResponse.json(
            { message: "teamId and id are required" },
            { status: 400 },
        );
    }

    const { user, role } = await getServerUserRole(teamId);
    if (!user?.email || role !== "admin") {
        return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    try {
        const svc = createServiceSupabaseClient();

        void svc.from("member_credential_audit_logs").insert({
            team_id: teamId,
            credential_id: id,
            action: "delete",
            actor_email: user.email,
        });

        const { error } = await svc
            .from("member_credentials")
            .delete()
            .eq("id", id)
            .eq("team_id", teamId);

        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return internalErrorResponse("mc-delete", error);
    }
}
