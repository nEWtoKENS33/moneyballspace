import { NextResponse } from "next/server";
import { closeRound, getSnapshot } from "@/lib/roundStore";
import type { RoundId } from "@/lib/types";

function toJsonSafe(value: any): any {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "") as RoundId;

  if (id !== "main" && id !== "hourly") {
    return NextResponse.json({ error: "Invalid round id" }, { status: 400 });
  }

  await closeRound(id);
  return NextResponse.json(toJsonSafe(getSnapshot()));
}
