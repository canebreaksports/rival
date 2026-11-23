// POST /api/approvals/order — {slug, order: string[]} from /coach/publish (admin password required; see proxy.ts).
// Saving an order un-approves the set: the owner re-approves it in its new order.
import { NextResponse } from "next/server";
import { approvalState, setOrder } from "@/lib/approvals";
import { storageConfigured } from "@/lib/track-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!storageConfigured()) return NextResponse.json({ error: "storage not connected" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { slug?: unknown; order?: unknown } | null;
  const order = Array.isArray(body?.order) ? body!.order.filter((s): s is string => typeof s === "string" && s.length < 400) : [];
  if (typeof body?.slug !== "string" || !order.length || order.length > 20) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!(await setOrder(body.slug, order))) return NextResponse.json({ error: "unknown set" }, { status: 404 });
  return NextResponse.json({ ok: true, ...(await approvalState()) }, { headers: { "Cache-Control": "no-store" } });
}
