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

function countDuplicateTeamNames(data) {
  const counts = new Map();
  for (const row of data) {
    const key = `${row.team_id}:${row.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
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

const [players, projects, tasks, quests, attendance, accessibility, exceptions] =
  await Promise.all([
    rows(supabase, "players", "id,team_id,name"),
    rows(supabase, "projects", "id,team_id,name"),
    rows(supabase, "tasks", "id,team_id,member,player_id,proj,project_id"),
    rows(supabase, "quests", "id,team_id,member,player_id,proj,project_id"),
    rows(supabase, "attendance", "id,team_id,member,player_id"),
    rows(
      supabase,
      "accessibility",
      "id,team_id,member,player_id,proj,project_id",
    ),
    rows(
      supabase,
      "relation_migration_exceptions",
      "table_name,row_id,relation_type",
    ),
  ]);

const playerById = new Map(players.map((row) => [row.id, row]));
const projectById = new Map(projects.map((row) => [row.id, row]));
const exceptionKeys = new Set(
  exceptions.map(
    (row) => `${row.table_name}:${row.row_id}:${row.relation_type}`,
  ),
);
const currentExceptionKeys = new Set();

const audit = {
  untracked_player_reference: 0,
  invalid_player_reference: 0,
  untracked_project_reference: 0,
  invalid_project_reference: 0,
  duplicate_player_name_in_team: countDuplicateTeamNames(players),
  duplicate_project_name_in_team: countDuplicateTeamNames(projects),
  stale_migration_exception: 0,
};

const tableConfigs = [
  { table: "tasks", data: tasks, player: true, project: true },
  { table: "quests", data: quests, player: true, project: true },
  { table: "attendance", data: attendance, player: true, project: false },
  {
    table: "accessibility",
    data: accessibility,
    player: true,
    project: true,
  },
];

for (const config of tableConfigs) {
  for (const row of config.data) {
    if (config.player && row.member && !row.player_id) {
      const key = `${config.table}:${row.id}:player`;
      currentExceptionKeys.add(key);
      if (!exceptionKeys.has(key)) audit.untracked_player_reference += 1;
    }

    if (config.player && row.player_id) {
      const player = playerById.get(row.player_id);
      if (
        !player ||
        player.team_id !== row.team_id ||
        player.name !== row.member
      ) {
        audit.invalid_player_reference += 1;
      }
    }

    if (config.project && row.proj && !row.project_id) {
      const key = `${config.table}:${row.id}:project`;
      currentExceptionKeys.add(key);
      if (!exceptionKeys.has(key)) audit.untracked_project_reference += 1;
    }

    if (config.project && row.project_id) {
      const project = projectById.get(row.project_id);
      if (
        !project ||
        project.team_id !== row.team_id ||
        project.name !== row.proj
      ) {
        audit.invalid_project_reference += 1;
      }
    }
  }
}

audit.stale_migration_exception = exceptions.filter(
  (row) =>
    !currentExceptionKeys.has(
      `${row.table_name}:${row.row_id}:${row.relation_type}`,
    ),
).length;

const trackedExceptions = {
  player: exceptions.filter((row) => row.relation_type === "player").length,
  project: exceptions.filter((row) => row.relation_type === "project").length,
};

console.log(
  JSON.stringify(
    {
      counts: {
        players: players.length,
        projects: projects.length,
        tasks: tasks.length,
        quests: quests.length,
        attendance: attendance.length,
        accessibility: accessibility.length,
      },
      tracked_exceptions: trackedExceptions,
      audit,
    },
    null,
    2,
  ),
);

if (Object.values(audit).some((count) => count !== 0)) {
  process.exitCode = 1;
}
