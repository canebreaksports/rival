import { SCHOOL } from "@/lib/data";

export function Dot({ k }: { k: string }) {
  return <span className="dot" style={{ background: SCHOOL[k]?.color }} aria-hidden="true" />;
}
