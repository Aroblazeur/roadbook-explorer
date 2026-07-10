#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load env
const envPath = path.resolve(".env.local");
const lines = fs.readFileSync(envPath, "utf-8").split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sql = `
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'departure') then
    alter table public.stage_variants add column departure text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'arrival') then
    alter table public.stage_variants add column arrival text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'elevation_gain_m') then
    alter table public.stage_variants add column elevation_gain_m integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'elevation_loss_m') then
    alter table public.stage_variants add column elevation_loss_m integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'map_embed_url') then
    alter table public.stage_variants add column map_embed_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'notes') then
    alter table public.stage_variants add column notes jsonb not null default '[]'::jsonb;
  end if;
end;
$$;
`;

async function main() {
  const { error } = await supabase.rpc("exec_sql", { sql_text: sql });
  if (error) {
    console.log("RPC not available, trying direct query...");
    const { error: qErr } = await supabase.from("stage_variants").select("id").limit(0);
    if (qErr) {
      console.error("Error:", qErr.message);
      console.log("\nPlease run this SQL manually in the Supabase SQL Editor:");
      console.log(sql);
    } else {
      console.log("Connected! Columns may already exist.");
    }
  } else {
    console.log("Migration completed successfully.");
  }
}
main();
