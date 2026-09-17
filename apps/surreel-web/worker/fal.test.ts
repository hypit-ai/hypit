import { describe, expect, it } from "vitest";
import { videoInput, VIDEO_MODEL } from "./fal.ts";

describe("fal video input", () => {
  it("sends Seedance 2 Fast duration enum string and never a 30s or auto request", () => {
    const thirty = videoInput(VIDEO_MODEL, {
      prompt: "Talk.",
      imageUrl: "https://example.com/still.png",
      aspectRatio: "9:16",
      duration: 30,
    });
    expect(thirty.duration).toBe("15");
    expect(thirty.duration).not.toBe("auto");
    expect(thirty.generate_audio).toBe(true);
    expect(thirty).not.toHaveProperty("image_urls");
    expect(thirty).not.toHaveProperty("prompt_expansion_mode");

    const ten = videoInput(VIDEO_MODEL, {
      prompt: "Talk.",
      aspectRatio: "9:16",
      duration: 10,
    });
    expect(ten.duration).toBe("10");
    expect(ten.aspect_ratio).toBe("9:16");
  });
});
