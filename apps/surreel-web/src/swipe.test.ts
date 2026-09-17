import { describe, expect, it } from "vitest";
import { nearestIndex, rubber, shortestSpin, swipeCommit, wrapOffset } from "./swipe.ts";

describe("swipe", () => {
  it("commits a right swipe as previous and a left swipe as next", () => {
    expect(swipeCommit(120, 0)).toBe(1);
    expect(swipeCommit(-120, 0)).toBe(-1);
    expect(swipeCommit(12, 0)).toBe(0);
  });

  it("rubber-bands past the limit without snapping back instantly", () => {
    expect(rubber(220)).toBe(220);
    expect(rubber(320)).toBeGreaterThan(220);
    expect(rubber(320)).toBeLessThan(320);
  });

  it("picks the nearest visible card", () => {
    expect(
      nearestIndex(
        [
          { index: 0, x: 200, width: 220 },
          { index: 1, x: 360, width: 180 },
          { index: 2, x: 80, width: 160 },
        ],
        90,
      ),
    ).toBe(2);
  });

  it("wraps the wheel the short way around", () => {
    expect(wrapOffset(6, 7)).toBe(-1);
    expect(shortestSpin(6.2, 0, 7)).toBeCloseTo(7, 5);
    expect(shortestSpin(0.2, 6, 7)).toBeCloseTo(-1, 5);
    expect(wrapOffset(0, 1)).toBe(0);
    expect(shortestSpin(0, 1, 2)).toBe(-1);
  });
});
