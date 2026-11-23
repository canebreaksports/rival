// GET  /api/approvals/questions — every question review (admin password required; see proxy.ts).
// POST /api/approvals/questions — {slug, items: [{sig, s: "ok"|"work"|"reject"|null, note?}]}.
import { NextResponse } from "next/server";
import { approvalState, questionReviews, setQuestionReviews, type QStatus } from "@/lib/approvals";
import { storageConfigured } from "@/lib/track-server";

export const dynamic = "force-dynamic";
const S = new Set(["ok", "work", "reject"]);

export async function GET() {
  return NextResponse.json({ configured: storageConfigured(), reviews: await questionReviews() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!storageConfigured()) return NextResponse.json({ error: "storage not connected" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { slug?: unknown; items?: unknown } | null;
  const items = (Array.isArray(body?.items) ? body!.items : []).flatMap((x: unknown) => {
    const i = x as { sig?: unknown; s?: unknown; note?: unknown };
    return typeof i?.sig === "string" && (i.s === null || S.has(i.s as string)) ? [{ sig: i.sig, s: i.s as QStatus | null, note: typeof i.note === "string" ? i.note : undefined }] : [];
  }).slice(0, 30);
  if (typeof body?.slug !== "string" || !items.length) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await setQuestionReviews(body.slug, items);
  return NextResponse.json({ ok: true, reviews: await questionReviews(), ...(await approvalState()) }, { headers: { "Cache-Control": "no-store" } });
}
