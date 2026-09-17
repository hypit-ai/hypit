import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  composeHypitBrief,
  findPublicHttpUrl,
  formatReady,
  hypitFormat,
  hypitFormats,
  queueReady,
  readPublicHttpUrl,
  titleFromAnswers,
} from "./formats.ts";

const formatSkills = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../worker/format-skills.json"), "utf8"),
) as Array<{ id: string; playbook: string; crafts: string[]; imageSkills: string[]; videoSkills: string[] }>;

describe("formats", () => {
  it("titles from the first required answer", () => {
    const format = hypitFormat("talking-head");
    expect(titleFromAnswers(format, { say: "Harbor brew in a kitchen. Cut wide." })).toBe("Harbor brew in a kitchen");
    expect(titleFromAnswers(format, {})).toBe(format.title);
  });

  it("titles a URL-only brief from the host", () => {
    const format = hypitFormat("talking-head");
    expect(titleFromAnswers(format, { say: "https://www.harborbrew.example/oat" })).toBe("harborbrew.example");
  });

  it("requires the first field before queueing unless a URL is present", () => {
    const format = hypitFormat("talking-head");
    expect(formatReady(format, {})).toBe(false);
    expect(queueReady(format, {})).toBe(false);
    expect(formatReady(format, { say: "A tin on the counter." })).toBe(true);
    expect(queueReady(format, {}, "https://harborbrew.example/oat")).toBe(true);
    expect(queueReady(format, { say: "https://harborbrew.example/oat" })).toBe(true);
  });

  it("accepts public http URLs and rejects credentials", () => {
    expect(readPublicHttpUrl("https://harborbrew.example/oat")).toBe("https://harborbrew.example/oat");
    expect(readPublicHttpUrl("harborbrew.example/oat")).toBe("https://harborbrew.example/oat");
    expect(findPublicHttpUrl("Watch https://youtu.be/dQw4w9wg now")).toBe("https://youtu.be/dQw4w9wg");
    expect(readPublicHttpUrl("https://user:pass@example.com/x")).toBeUndefined();
    expect(readPublicHttpUrl("file:///etc/passwd")).toBeUndefined();
  });

  it("composes a Hypit brief without invented facts", () => {
    const format = hypitFormat("talking-head");
    const brief = composeHypitBrief({
      format,
      answers: { say: "Show the tin.", facts: "Harbor Brew. No health claims." },
      aspectRatio: "9:16",
      duration: 20,
    });
    expect(brief).toContain("Format: Talking-head UGC");
    expect(brief).toContain("What should they say?: Show the tin.");
    expect(brief).toContain("20-second 9:16 video as 2 clips (10 + 10s)");
    expect(brief).not.toContain("Who is on camera?");
  });

  it("composes a URL brief on the same format and crafts", () => {
    const format = hypitFormat("talking-head");
    const brief = composeHypitBrief({
      format,
      answers: { say: "https://harborbrew.example/oat" },
      aspectRatio: "9:16",
      duration: 20,
      referenceUrl: "https://harborbrew.example/oat",
    });
    expect(brief).toContain("Source URL: https://harborbrew.example/oat");
    expect(brief).toContain("Crafts: image-direction, voice-direction, video-direction, captions.");
    expect(brief).toContain("Surreel still packs: gpt-image-people, ugc-realistic.");
    expect(brief).toContain("Surreel motion packs: ugc-realistic, ugc-ad-formats.");
    expect(brief).toContain("same path as a written brief");
    expect(brief).not.toContain("What should they say?: https://");
  });

  it("keeps every Hypit format aligned with the packed playbook and crafts", () => {
    expect(formatSkills.map((item) => item.id)).toEqual(hypitFormats.map((item) => item.id));
    for (const format of hypitFormats) {
      const packed = formatSkills.find((item) => item.id === format.id);
      expect(packed).toBeDefined();
      expect(format.playbook.endsWith(packed!.playbook)).toBe(true);
      expect(packed!.crafts).toEqual(format.crafts);
      expect(packed!.imageSkills).toEqual(format.imageSkills);
      expect(packed!.videoSkills).toEqual(format.videoSkills);
    }
  });
});
