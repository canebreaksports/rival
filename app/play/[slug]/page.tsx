import { notFound } from "next/navigation";
import { readSet, readSets } from "@/lib/sets";
import { DATA } from "@/lib/data";
import { WeeklyRun } from "@/components/WeeklyRun";

export const dynamicParams = false;
export const generateStaticParams = () => readSets().map(s => ({ slug: s.slug }));

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = readSet(slug);
  if (!set) notFound();
  return <WeeklyRun set={set} games={DATA.schedule.games} />;
}
