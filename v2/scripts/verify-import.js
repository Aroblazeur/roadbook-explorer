#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(".env.local");
const lines = fs.readFileSync(envPath, "utf-8").split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const slug = "perinexus";

  const { data: rb } = await supabase.from("roadbooks").select("*").eq("slug", slug).single();
  if (!rb) { console.log("Roadbook not found"); return; }
  console.log(`Roadbook: id=${rb.id}, title="${rb.title}", is_public=${rb.is_public}, slug=${rb.slug}`);

  const { data: stages } = await supabase.from("stages").select("*").eq("roadbook_id", rb.id).order("stage_number");
  console.log(`Stages: ${stages.length}`);
  for (const s of stages) {
    console.log(`  #${s.stage_number}: "${s.title}" dep="${s.departure}" arr="${s.arrival}" dist=${s.distance_km} accom="${s.accommodation_name}" notes=${JSON.stringify(s.notes).length}`);
    const { data: pois } = await supabase.from("stage_pois").select("id,name").eq("stage_id", s.id);
    if (pois.length) console.log(`    POIs: ${pois.map(p => p.name).join(", ")}`);
    const { data: vars } = await supabase.from("stage_variants").select("id,label").eq("stage_id", s.id);
    if (vars.length) console.log(`    Variants: ${vars.map(v => v.label).join(", ")}`);
  }

  const { count: totalPois } = await supabase.from("stage_pois").select("*", { count: "exact", head: true });
  const { count: totalVars } = await supabase.from("stage_variants").select("*", { count: "exact", head: true });
  console.log(`\nTotal POIs: ${totalPois}`);
  console.log(`Total variants: ${totalVars}`);
}
main();
