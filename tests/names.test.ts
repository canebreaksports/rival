import { describe, expect, it } from "vitest";
import { matchOne, matchNames } from "@/lib/names";

const PEOPLE = ["Jeremy Hill", "Leonard Fournette", "Derrius Guice", "Clyde Edwards-Helaire", "Najee Harris", "Damien Harris",
  "Carnell 'Cadillac' Williams", "BenJarvus Green-Ellis", "T. J. Yeldon", "Jalen Hurd"].map(name => ({ name }));

describe("Name Them matching", () => {
  it("forgives small spelling mistakes on longer names", () => {
    expect(matchOne("Clyde Edwards-Heilare", PEOPLE)).toEqual({ status: "hit", name: "Clyde Edwards-Helaire" });
    expect(matchOne("Edwards Helaire", PEOPLE)).toEqual({ status: "hit", name: "Clyde Edwards-Helaire" });
    expect(matchOne("Helaire", PEOPLE)).toEqual({ status: "hit", name: "Clyde Edwards-Helaire" });
    expect(matchOne("fournete", PEOPLE)).toEqual({ status: "hit", name: "Leonard Fournette" });
    expect(matchOne("Fornette", PEOPLE)).toEqual({ status: "hit", name: "Leonard Fournette" });
    expect(matchOne("green ellis", PEOPLE)).toEqual({ status: "hit", name: "BenJarvus Green-Ellis" });
  });
  it("keeps short names strict", () => {
    expect(matchOne("Hall", PEOPLE).status).toBe("miss"); // not Hill
    expect(matchOne("Hill", PEOPLE)).toEqual({ status: "hit", name: "Jeremy Hill" });
    expect(matchOne("Hurt", PEOPLE).status).toBe("miss"); // not Hurd
  });
  it("asks which one when a last name is shared, and accepts the first name", () => {
    expect(matchOne("Harris", PEOPLE)).toEqual({ status: "ambiguous", options: ["Najee Harris", "Damien Harris"] });
    expect(matchOne("Najee Harris", PEOPLE)).toEqual({ status: "hit", name: "Najee Harris" });
    expect(matchOne("Damian Harris", PEOPLE)).toEqual({ status: "hit", name: "Damien Harris" });
  });
  it("handles nicknames, repeats and misses", () => {
    expect(matchOne("Cadillac", PEOPLE)).toEqual({ status: "hit", name: "Carnell 'Cadillac' Williams" });
    expect(matchOne("Fournette", PEOPLE, new Set(["Leonard Fournette"]))).toEqual({ status: "dup", name: "Leonard Fournette" });
    expect(matchOne("Saquon Barkley", PEOPLE).status).toBe("miss");
    expect(matchOne("", PEOPLE).status).toBe("miss");
  });
  it("batch matching still works for lists", () => {
    const hit = matchNames("bo jackson, cadillac, harris, najee harris, yeldon", PEOPLE);
    expect([...hit].sort()).toEqual(["Carnell 'Cadillac' Williams", "Najee Harris", "T. J. Yeldon"]);
  });
});
