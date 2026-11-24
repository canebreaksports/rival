import { WeekView } from "@/components/WeekView";
import { Footer } from "@/components/Footer";
import { FanBar } from "@/components/FanBar";
import Link from "next/link";
import { gameSummaries } from "@/lib/summaries";

export default function Home() {
  return <section>
    <h1>PIT<span>T</span>ED</h1>
    <div className="byline">Your school vs. theirs. Every game week.</div>
    <div className="tag">College Football · Rivalry Week</div>
    <FanBar />
    <WeekView games={gameSummaries()} />
    <Link className="btn ghost" href="/leaderboard" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 14 }}>School Leaderboard</Link>
    <Footer />
  </section>;
}
