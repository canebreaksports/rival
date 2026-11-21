import type { Metadata } from "next";
import { StatsClient } from "@/components/StatsClient";
export const metadata: Metadata = { title: "RIVAL · Stats", robots: { index: false, follow: false } };
export default function StatsPage() { return <StatsClient /> }
