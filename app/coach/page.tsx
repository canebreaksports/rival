import type { Metadata } from "next";
import { gameSummaries } from "@/lib/summaries";
import { CoachClient } from "@/components/CoachClient";

// Preview Mode (spec §3). Not linked from the public site and not indexed. Stage 2 puts it behind sign-in.
export const metadata: Metadata = { title: "RIVAL by Canebreak · Coach", robots: { index: false, follow: false } };

export default function CoachPage() {
  return <CoachClient games={gameSummaries()} />;
}
