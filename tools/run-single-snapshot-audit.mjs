import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) {
    throw new Error(".env.local is missing.");
  }

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

export async function runSingleSnapshotAudit(functionName) {
  const env = loadLocalEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc(functionName);
  if (error) {
    throw new Error(`${functionName} failed (${error.code ?? "unknown"}).`);
  }

  const audit = Object.fromEntries(
    (data ?? []).map((row) => [String(row.issue), Number(row.issue_count)]),
  );
  console.log(JSON.stringify({ audit }, null, 2));

  if (Object.values(audit).some((count) => !Number.isFinite(count) || count !== 0)) {
    process.exitCode = 1;
  }
}
