import { SCHOOL } from "@/lib/schools";

export function Dot({ k }: { k: string }) {
  return <span className="dot" style={{ background: SCHOOL[k]?.color }} aria-hidden="true" />;
}
