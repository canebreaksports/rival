import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readSet, readSets } from "@/lib/sets";
import { DATA } from "@/lib/data";
import { WeeklyRun } from "@/components/WeeklyRun";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamicParams = false;
export const generateStaticParams = () => readSets().map(s => ({ slug: s.slug }));

export default async function CoachPlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = readSet(slug);
  if (!set) notFound();
  return <WeeklyRun set={set} games={DATA.schedule.games} preview />;
}
