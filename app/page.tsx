import { WeekView } from "@/components/WeekView";
import { Footer } from "@/components/Footer";
import { FanBar } from "@/components/FanBar";
import { gameSummaries } from "@/lib/summaries";

export default function Home() {
  return <section>
    <h1>PIT<span>T</span>ED</h1>
    <div className="byline">Your school vs. theirs. Every game week.</div>
    <div className="tag">College Football · SEC Edition</div>
    <FanBar />
    <WeekView games={gameSummaries()} />
    <Footer />
  </section>;
}
