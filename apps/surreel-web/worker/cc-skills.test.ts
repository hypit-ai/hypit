import { describe, expect, it } from "vitest";
import {
  CC_SKILL_NAMES,
  ccSkillContext,
  formatRoute,
  readConsulted,
  requiredSkills,
  skillsForKind,
} from "./cc-skills.ts";
import { videoInput, videoModelId, VIDEO_MODEL } from "./fal.ts";

describe("surreel-cc skills", () => {
  it("ships every production pack from surreel-cc", () => {
    expect(CC_SKILL_NAMES.sort()).toEqual([
      "ad-story-framework",
      "gpt-image-people",
      "h3-video",
      "seedance-home-video",
      "ugc-ad-formats",
      "ugc-realistic",
    ]);
    expect(skillsForKind("image")).toEqual(expect.arrayContaining(["gpt-image-people", "ugc-realistic"]));
    expect(skillsForKind("video")).toEqual(
      expect.arrayContaining(["ugc-realistic", "ugc-ad-formats", "h3-video", "seedance-home-video", "ad-story-framework"]),
    );
  });

  it("points talking-head at gpt-image-people and ugc-realistic before generate", () => {
    const route = formatRoute("talking-head");
    expect(route.imageSkills).toEqual(["gpt-image-people", "ugc-realistic"]);
    expect(route.videoSkills).toEqual(["ugc-realistic", "ugc-ad-formats"]);
    const context = ccSkillContext("talking-head");
    expect(context).toContain("# Skill: gpt-image-people");
    expect(context).toContain("# Skill: ugc-realistic");
    expect(context).toContain("# Skill: ugc-ad-formats");
    expect(requiredSkills("talking-head")).toEqual(["gpt-image-people", "ugc-realistic", "ugc-ad-formats"]);
  });

  it("refuses a plan that does not name the pointed packs", () => {
    expect(() => readConsulted({ still: "A kitchen still.", motion: "They talk." }, "talking-head")).toThrow(
      /gpt-image-people/,
    );
    expect(() =>
      readConsulted({ imageSkill: "h3-video", videoSkill: "ugc-realistic" }, "talking-head"),
    ).toThrow(/image packs/);
    const consulted = readConsulted(
      { imageSkill: "gpt-image-people", videoSkill: "ugc-realistic" },
      "talking-head",
    );
    expect(consulted).toEqual({ imageSkill: "gpt-image-people", videoSkill: "ugc-realistic" });
  });

  it("sends photoreal talking takes to Seedance 2 Fast only", () => {
    expect(videoModelId("ugc-realistic", true)).toBe(VIDEO_MODEL);
    expect(videoModelId("h3-video", false)).toBe("bytedance/seedance-2.0/fast/text-to-video");
    expect(VIDEO_MODEL).toBe("bytedance/seedance-2.0/fast/image-to-video");
    expect(VIDEO_MODEL).not.toContain("h3-max");
    expect(
      videoInput(VIDEO_MODEL, {
        prompt: "She lifts the tin.",
        imageUrl: "https://example.com/still.png",
        aspectRatio: "9:16",
        duration: 20,
      }),
    ).toEqual({
      prompt: "She lifts the tin.",
      image_url: "https://example.com/still.png",
      aspect_ratio: "9:16",
      duration: "15",
      resolution: "720p",
      generate_audio: true,
    });
  });
});
