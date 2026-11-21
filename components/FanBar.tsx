"use client";
// Home: shows "Your team: X · Change", or the picker when no school has been chosen yet.
import { useEffect, useState } from "react";
import { getFan, setFan, type Fan } from "@/lib/fan";
import { teamName, TEAM } from "@/lib/teams";
import { track } from "@/lib/track";
import { SchoolPicker } from "./SchoolPicker";

export function FanBar() {
  const [fan, setF] = useState<Fan | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  useEffect(() => setF(getFan()), []);
  if (fan === undefined) return null;
  const pick = (k: string) => { const f = setFan(k); setF(f); setEditing(false); track({ e: "pick", pid: f.pid, school: k }) };
  if (!fan || editing) return <SchoolPicker onPick={pick} current={fan?.school} />;
  return <div className="fanbar">
    <span className="dot" style={{ background: TEAM[fan.school]?.color ?? "var(--dim)" }} aria-hidden="true" /> Your team: <b>{teamName(fan.school)}</b>
    <button className="linkbtn" onClick={() => setEditing(true)}>Change</button>
  </div>;
}
