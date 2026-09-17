import { describe, expect, it } from "vitest";
import { clipDurations, clipSeconds, paceVoices, splitLines, wordsOf } from "./timing.ts";

describe("timing", () => {
  it("keeps a 15s take as one clip and splits longer takes evenly", () => {
    expect(clipDurations(15)).toEqual([15]);
    expect(clipDurations(20)).toEqual([10, 10]);
    expect(clipDurations(30)).toEqual([15, 15]);
    expect(clipDurations(45)).toEqual([15, 15, 15]);
    expect(clipDurations(60)).toEqual([15, 15, 15, 15]);
  });

  it("never asks Seedance for more than 15 seconds", () => {
    expect(clipSeconds(30)).toBe(15);
    expect(clipSeconds(8)).toBe(8);
    expect(clipSeconds(4)).toBe(5);
  });

  it("splits spoken lines across clips instead of repeating the whole script", () => {
    expect(splitLines("Hook.\nOffer.\nClose.\nButton.", 2)).toEqual(["Hook.\nOffer.", "Close.\nButton."]);
  });

  it("caps a 30s monologue at two natural 15s word budgets", () => {
    const script = Array.from({ length: 60 }, (_, index) => `word${index + 1}`).join(" ");
    const parts = paceVoices([], script, [15, 15]);
    expect(parts).toHaveLength(2);
    expect(wordsOf(parts[0] ?? "")).toHaveLength(30);
    expect(wordsOf(parts[1] ?? "")).toHaveLength(30);
    expect(parts[0]).not.toBe(script);
    expect(parts[1]).not.toBe(script);
    expect(parts[0]).not.toEqual(parts[1]);
  });

  it("does not copy a long planner clip onto every slot", () => {
    const script = Array.from({ length: 60 }, (_, index) => `line${index + 1}`).join(" ");
    const parts = paceVoices([script], script, [15, 15]);
    expect(parts[0]).not.toBe(script);
    expect(wordsOf(parts[0] ?? "").length).toBeLessThanOrEqual(30);
    expect(wordsOf(parts[1] ?? "").length).toBeLessThanOrEqual(30);
  });
});
