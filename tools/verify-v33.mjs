import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

async function rows(client, table, columns) {
  const result = [];
  const selectedColumns = columns.split(",").map((column) => column.trim());
  const orderColumns = selectedColumns.includes("id") ? ["id"] : selectedColumns;
  for (let from = 0; ; from += 1000) {
    let query = client.from(table).select(columns);
    for (const column of orderColumns) query = query.order(column);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < 1000) return result;
  }
}

const env = loadLocalEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment variables are not configured.");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const [briefings, memberships, teams] = await Promise.all([
  rows(supabase, "briefings", "id,team_id,week_start"),
  rows(supabase, "team_memberships", "id,team_id,status"),
  rows(supabase, "teams", "id,status"),
]);

const teamStatusById = new Map(teams.map((team) => [team.id, team.status]));
const teamWeekKeys = new Set();
let duplicateTeamWeek = 0;
for (const briefing of briefings) {
  const key = `${briefing.team_id ?? "<null>"}:${briefing.week_start}`;
  if (teamWeekKeys.has(key)) duplicateTeamWeek += 1;
  teamWeekKeys.add(key);
}

const audit = {
  briefing_without_team: briefings.filter((row) => !row.team_id).length,
  duplicate_team_week: duplicateTeamWeek,
  active_membership_on_archived_team: memberships.filter(
    (membership) =>
      membership.status === "active" &&
      teamStatusById.get(membership.team_id) !== "active",
  ).length,
};

console.log(
  JSON.stringify(
    {
      counts: {
        briefings: briefings.length,
        memberships: memberships.length,
        teams: teams.length,
      },
      audit,
    },
    null,
    2,
  ),
);

if (Object.values(audit).some((count) => count !== 0)) {
  process.exitCode = 1;
}
