import { describe, expect, it } from "vitest";
import { launchUri, socialCaption, socialTarget } from "./socials.ts";
import { parseProject } from "./types.ts";

const sample = parseProject({
  id: "11111111-1111-1111-1111-111111111111",
  title: "Harbor brew",
  prompt: "Produce this video with Hypit.\nFormat: Talking-head UGC",
  aspectRatio: "9:16",
  duration: 20,
  style: "Talking-head UGC",
  status: "completed",
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:01.000Z",
  events: [],
  artifacts: [],
  review: "approved",
  destinations: [],
});

describe("socials", () => {
  it("builds a caption from title plus the first prompt line", () => {
    expect(socialCaption(sample)).toBe("Harbor brew\n\nProduce this video with Hypit.");
  });

  it("only appends text to X", () => {
    expect(launchUri(socialTarget("tiktok"), "hello")).toBe("https://www.tiktok.com/upload");
    expect(launchUri(socialTarget("x"), "hello")).toContain("text=hello");
  });
});
