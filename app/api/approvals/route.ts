// GET  /api/approvals — which weekly sets are green-lit (public: the game uses it to gate sets).
// POST /api/approvals — {slugs: string[], approve: boolean} from /coach/publish (admin password required; see proxy.ts).
import { NextResponse } from "next/server";
import { approvalState, setApproval } from "@/lib/approvals";
import { storageConfigured } from "@/lib/track-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await approvalState(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!storageConfigured()) return NextResponse.json({ error: "storage not connected" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { slugs?: unknown; approve?: unknown } | null;
  const slugs = Array.isArray(body?.slugs) ? body!.slugs.filter((s): s is string => typeof s === "string").slice(0, 100) : [];
  if (!slugs.length || typeof body?.approve !== "boolean") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const n = await setApproval(slugs, body.approve);
  return NextResponse.json({ ok: true, changed: n, ...(await approvalState()) }, { headers: { "Cache-Control": "no-store" } });
}
