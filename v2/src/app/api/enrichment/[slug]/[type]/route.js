import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(request, { params }) {
  const { slug, type } = await params;

  if (!["poi", "accommodation"].includes(type)) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  const filePath = path.resolve(
    process.cwd(),
    "..",
    "roadbooks",
    slug,
    "data",
    `${type}-enrichment.json`
  );

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
