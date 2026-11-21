import { WeekView } from "@/components/WeekView";
import { Footer } from "@/components/Footer";
import { FanBar } from "@/components/FanBar";
import { gameSummaries } from "@/lib/summaries";

export default function Home() {
  return <section>
    <h1>RI<span>V</span>AL</h1>
    <div className="tag">College Football · SEC Edition</div>
    <FanBar />
    <WeekView games={gameSummaries()} />
    <Footer />
  </section>;
}
