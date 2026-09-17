import { describe, expect, it } from "vitest";
import { captionCues, composeFalMotion, composeFalStill, cuesToVtt, hypitSkill, needsCaptions, needsVoice, readClipPlans, readCraftPlan, skillContext } from "./hypit.ts";

describe("hypit skills", () => {
  it("loads the talking-head playbook and every listed craft", () => {
    const pack = hypitSkill("talking-head");
    expect(pack.crafts).toEqual(["image-direction", "voice-direction", "video-direction", "captions"]);
    const context = skillContext(pack);
    expect(context).toContain("UGC and talking-head");
    expect(context).toContain("# Craft: image-direction");
    expect(context).toContain("# Craft: voice-direction");
    expect(context).toContain("# Craft: video-direction");
    expect(context).toContain("# Craft: captions");
    expect(needsVoice(pack)).toBe(true);
    expect(needsCaptions(pack)).toBe(true);
    expect(context.length).toBeLessThan(16_000);
  });

  it("reads voice lines from arrays and nested keys", () => {
    const pack = hypitSkill("talking-head");
    const plan = readCraftPlan(
      {
        Still: { prompt: "A person at a kitchen counter facing the lens." },
        motion: "Handheld talk, small pose change on the cut.",
        voice: ["Try the oat tin.", "No health claims."],
        captions: ["TRY THE OAT TIN"],
      },
      pack,
    );
    expect(plan.voice).toContain("Try the oat tin.");
    expect(plan.still).toContain("kitchen counter");
  });

  it("refuses a plan that skips a required craft", () => {
    const pack = hypitSkill("talking-head");
    expect(() => readCraftPlan({ still: "A person at a counter.", motion: "They talk." }, pack)).toThrow(/voice/);
  });

  it("keeps caption craft off the Seedance plate", () => {
    const still = composeFalStill({
      still: "A person at a kitchen counter facing the lens in window light.",
      motion: "Handheld talk.",
    });
    const motion = composeFalMotion(
      {
        still: "Counter still.",
        motion: "Handheld talk.",
        voice: "Try the oat tin.",
        captions: "TRY THE OAT TIN",
      },
      15,
    );
    expect(still).toContain("Clean plate");
    expect(motion).toContain("Spoken performance");
    expect(motion).toContain("Clean plate");
    expect(motion).not.toContain("TRY THE OAT TIN");
    expect(motion).not.toContain("Burn large readable captions");
    expect(motion).toContain("15 seconds");
    expect(motion).toContain("Never speed up");
  });

  it("splits a 30s plan into two unhurried clips", () => {
    const pack = hypitSkill("talking-head");
    const clips = readClipPlans(
      {
        still: "A person at a kitchen counter facing the lens in window light.",
        clips: [
          { motion: "They lift the tin and talk to camera.", voice: "Try the oat tin.", captions: "TRY THE OAT TIN" },
          { motion: "They pour and finish the thought.", voice: "No health claims.", captions: "NO HEALTH CLAIMS" },
        ],
      },
      pack,
      [15, 15],
    );
    expect(clips).toHaveLength(2);
    expect(clips[0]?.motion).toContain("15 seconds");
    expect(clips[0]?.motion).toContain("Try the oat tin.");
    expect(clips[0]?.motion).not.toContain("No health claims.");
    expect(clips[1]?.motion).toContain("No health claims.");
    expect(clips[1]?.motion).not.toContain("Try the oat tin.");
  });

  it("does not replay a 30s monologue inside each 15s clip", () => {
    const pack = hypitSkill("talking-head");
    const voice = Array.from({ length: 60 }, (_, index) => `word${index + 1}`).join(" ");
    const clips = readClipPlans(
      {
        still: "A person at a kitchen counter facing the lens in window light.",
        motion: "Handheld talk for the whole pitch.",
        voice,
        captions: voice,
      },
      pack,
      [15, 15],
    );
    expect(clips[0]?.voice).not.toBe(voice);
    expect(clips[1]?.voice).not.toBe(voice);
    expect(clips[0]?.motion).not.toContain("word45");
    expect(clips[1]?.motion).not.toContain("word1");
  });

  it("times Hypit caption cues for the edit pass", () => {
    const cues = captionCues("TRY THE OAT TIN\nNo health claims.", 15);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe("TRY THE OAT TIN");
    expect(cues[1]?.end).toBeLessThanOrEqual(15);
    expect(cuesToVtt(cues)).toContain("WEBVTT");
    expect(cuesToVtt(cues)).toContain("TRY THE OAT TIN");
  });
});
