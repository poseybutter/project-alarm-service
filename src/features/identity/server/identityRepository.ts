import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type DatabaseError = { code?: string };

export type NormalizedProfile = {
  id: string;
  authUserId: string | null;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  accountStatus: "active" | "pending" | "suspended" | "rejected";
};

export type NormalizedMembership = {
  id: string;
  profileId: string;
  teamId: string;
  role: "admin" | "member" | "viewer";
  status: "active" | "suspended";
  isDefault: boolean;
  legacyPlayerId: number | null;
};

export type NormalizedIdentity = {
  profile: NormalizedProfile | null;
  memberships: NormalizedMembership[];
};

export function isIdentitySchemaUnavailable(error: unknown) {
  const code = (error as DatabaseError | null)?.code;
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST205"
  );
}

export async function loadNormalizedIdentity(
  client: SupabaseClient,
  email: string,
): Promise<NormalizedIdentity | null> {
  const { data: profileRow, error: profileError } = await client
    .from("profiles")
    .select(
      "id, auth_user_id, email, display_name, avatar_url, account_status",
    )
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (profileError && isIdentitySchemaUnavailable(profileError)) return null;
  if (profileError) throw profileError;
  if (!profileRow) return { profile: null, memberships: [] };

  const { data: membershipRows, error: membershipError } = await client
    .from("team_memberships")
    .select(
      "id, profile_id, team_id, role, status, is_default, legacy_player_id",
    )
    .eq("profile_id", profileRow.id)
    .order("is_default", { ascending: false })
    .order("joined_at", { ascending: true });

  if (membershipError && isIdentitySchemaUnavailable(membershipError)) {
    return null;
  }
  if (membershipError) throw membershipError;

  return {
    profile: {
      id: String(profileRow.id),
      authUserId: profileRow.auth_user_id
        ? String(profileRow.auth_user_id)
        : null,
      email: String(profileRow.email),
      displayName: String(profileRow.display_name),
      avatarUrl: profileRow.avatar_url ? String(profileRow.avatar_url) : null,
      accountStatus: profileRow.account_status as NormalizedProfile["accountStatus"],
    },
    memberships: (membershipRows ?? []).map((row) => ({
      id: String(row.id),
      profileId: String(row.profile_id),
      teamId: String(row.team_id),
      role: row.role as NormalizedMembership["role"],
      status: row.status as NormalizedMembership["status"],
      isDefault: Boolean(row.is_default),
      legacyPlayerId:
        typeof row.legacy_player_id === "number" ? row.legacy_player_id : null,
    })),
  };
}
