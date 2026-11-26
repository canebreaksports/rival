import Link from "next/link";
import { WeekView } from "@/components/WeekView";
import { Footer } from "@/components/Footer";
import { FanBar } from "@/components/FanBar";
import { gameSummaries } from "@/lib/summaries";
import { ComeBack } from "@/components/ComeBack";
import { DATA } from "@/lib/data";
import Logo from "@/components/Logo";

export default function Home() {
  return <section>
    <Logo />
    <div className="byline">Your school vs. theirs. Every game week.</div>
    <div className="tag">College Football · Rivalry Week</div>
    <FanBar />
    <Link className="btn ghost" href="/leaderboard" style={{ display: "block", textAlign: "center", textDecoration: "none", margin: "10px 0" }}>School Leaderboard</Link>
    <ComeBack games={DATA.schedule.games} />
    <WeekView games={gameSummaries()} />
    <Footer />
  </section>;
}
