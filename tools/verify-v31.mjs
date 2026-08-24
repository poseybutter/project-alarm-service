import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const env = {};
  const source = fs.readFileSync(".env.local", "utf8");

  for (const line of source.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }

  return env;
}

async function selectRows(client, table, columns) {
  const { data, error } = await client.from(table).select(columns);
  if (error) throw error;
  return data ?? [];
}

async function countRows(client, table, applyFilters = (query) => query) {
  const query = applyFilters(
    client.from(table).select("id", { count: "exact", head: true }),
  );
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

const env = loadLocalEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Supabase environment variables are not configured.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [profiles, memberships, requests, players] = await Promise.all([
  selectRows(supabase, "profiles", "id,email"),
  selectRows(
    supabase,
    "team_memberships",
    "profile_id,team_id,is_default,legacy_player_id",
  ),
  selectRows(supabase, "access_requests", "profile_id,status"),
  selectRows(supabase, "players", "id,email,team_id,status"),
]);

const profileByEmail = new Map(
  profiles.map((profile) => [profile.email.toLowerCase(), profile]),
);
const membershipKeys = new Set(
  memberships.map(
    (membership) => `${membership.profile_id}|${membership.team_id}`,
  ),
);
const playerIds = new Set(players.map((player) => String(player.id)));
const pendingProfileIds = new Set(
  requests
    .filter((request) => request.status === "pending")
    .map((request) => request.profile_id),
);
const defaultMembershipCounts = new Map();

for (const membership of memberships) {
  if (!membership.is_default) continue;
  defaultMembershipCounts.set(
    membership.profile_id,
    (defaultMembershipCounts.get(membership.profile_id) ?? 0) + 1,
  );
}

const audit = {
  active_player_without_profile: players.filter(
    (player) =>
      player.email &&
      (player.status ?? "active") === "active" &&
      !profileByEmail.has(player.email.toLowerCase()),
  ).length,
  assigned_player_without_membership: players.filter((player) => {
    if (
      !player.email ||
      !player.team_id ||
      !["active", "suspended"].includes(player.status ?? "active")
    ) {
      return false;
    }
    const profile = profileByEmail.get(player.email.toLowerCase());
    return (
      profile && !membershipKeys.has(`${profile.id}|${player.team_id}`)
    );
  }).length,
  profile_with_multiple_default_memberships: Array.from(
    defaultMembershipCounts.values(),
  ).filter((count) => count > 1).length,
  pending_player_without_access_request: players.filter((player) => {
    if (!player.email || player.status !== "pending") return false;
    const profile = profileByEmail.get(player.email.toLowerCase());
    return profile && !pendingProfileIds.has(profile.id);
  }).length,
  membership_with_missing_legacy_player: memberships.filter(
    (membership) =>
      membership.legacy_player_id !== null &&
      !playerIds.has(String(membership.legacy_player_id)),
  ).length,
};

const counts = {
  profiles: await countRows(supabase, "profiles"),
  team_memberships: await countRows(supabase, "team_memberships"),
  access_requests: await countRows(supabase, "access_requests"),
  pending_access_requests: await countRows(supabase, "access_requests", (q) =>
    q.eq("status", "pending"),
  ),
};

console.log(JSON.stringify({ counts, audit }, null, 2));

if (Object.values(audit).some((count) => count !== 0)) {
  process.exitCode = 1;
}
