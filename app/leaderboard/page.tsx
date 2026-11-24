import type { Metadata } from "next";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = { title: "PITTED · School Leaderboard", description: "Which fan base plays PITTED the most? Entries by school." };
export default function LeaderboardPage() { return <Leaderboard /> }
