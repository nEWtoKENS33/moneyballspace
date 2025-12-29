import { NextResponse } from "next/server";
import { syncRounds, getSnapshot } from "@/lib/roundStore";

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

export async function POST() {
  await syncRounds();
  return NextResponse.json(toJsonSafe(getSnapshot()));
}
