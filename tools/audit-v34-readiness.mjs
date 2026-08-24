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
  const { data, error } = await client.from(table).select(columns);
  if (error) throw error;
  return data ?? [];
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code) : "unknown";
    const message = "message" in error ? String(error.message) : String(error);
    return `${code}: ${message}`;
  }
  return String(error);
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

const tableConfigs = [
  { table: "tasks", player: true, project: true },
  { table: "quests", player: true, project: true },
  { table: "attendance", player: true, project: false },
  { table: "accessibility", player: true, project: true },
];

const [players, projects] = await Promise.all([
  rows(supabase, "players", "id,team_id,name"),
  rows(supabase, "projects", "id,team_id,name"),
]);
const playerById = new Map(players.map((row) => [row.id, row]));
const projectById = new Map(projects.map((row) => [row.id, row]));
const playerByTeamName = new Map(
  players.map((row) => [`${row.team_id}:${row.name}`, row]),
);
const projectByTeamName = new Map(
  projects.map((row) => [`${row.team_id}:${row.name}`, row]),
);

function countDuplicateTeamNames(data) {
  const counts = new Map();
  for (const row of data) {
    const key = `${row.team_id}:${row.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

const report = {
  reference_catalog: {
    duplicate_player_name_in_team: countDuplicateTeamNames(players),
    duplicate_project_name_in_team: countDuplicateTeamNames(projects),
  },
};
for (const config of tableConfigs) {
  const columns = ["id", "team_id"];
  if (config.player) columns.push("member", "player_id");
  if (config.project) columns.push("proj", "project_id");

  try {
    const data = await rows(supabase, config.table, columns.join(","));
    const audit = {
      rows: data.length,
      missing_player_id: 0,
      unresolved_player_name: 0,
      orphan_player_id: 0,
      player_team_mismatch: 0,
      member_name_mismatch: 0,
      missing_project_id: 0,
      unresolved_project_name: 0,
      orphan_project_id: 0,
      project_team_mismatch: 0,
      project_name_mismatch: 0,
    };

    for (const row of data) {
      if (config.player) {
        if (row.member && !row.player_id) {
          audit.missing_player_id += 1;
          if (!playerByTeamName.has(`${row.team_id}:${row.member}`)) {
            audit.unresolved_player_name += 1;
          }
        }
        if (row.player_id) {
          const player = playerById.get(row.player_id);
          if (!player) audit.orphan_player_id += 1;
          else {
            if (player.team_id !== row.team_id) audit.player_team_mismatch += 1;
            if (row.member && player.name !== row.member) {
              audit.member_name_mismatch += 1;
            }
          }
        }
      }

      if (config.project) {
        if (row.proj && !row.project_id) {
          audit.missing_project_id += 1;
          if (!projectByTeamName.has(`${row.team_id}:${row.proj}`)) {
            audit.unresolved_project_name += 1;
          }
        }
        if (row.project_id) {
          const project = projectById.get(row.project_id);
          if (!project) audit.orphan_project_id += 1;
          else {
            if (project.team_id !== row.team_id) {
              audit.project_team_mismatch += 1;
            }
            if (row.proj && project.name !== row.proj) {
              audit.project_name_mismatch += 1;
            }
          }
        }
      }
    }
    report[config.table] = audit;
  } catch (error) {
    report[config.table] = {
      schema_error: errorMessage(error),
    };
  }
}

console.log(JSON.stringify(report, null, 2));

const hasIssue = Object.values(report).some((tableReport) =>
  Object.entries(tableReport).some(
    ([key, value]) => key !== "rows" && (key === "schema_error" || value !== 0),
  ),
);
if (hasIssue) process.exitCode = 1;
