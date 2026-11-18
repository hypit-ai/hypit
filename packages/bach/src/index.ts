import { defineVideoModel } from "@hypit/execution/model";

export const bachPro = defineVideoModel({
  package: "@hypit/bach", model: "bach-1.0-pro", title: "Bach 1.0 Pro",
  duration: [5, 16], fractionalDuration: true, resolutions: ["1080p"], defaultResolution: "1080p",
  aspectRatios: ["4:3", "3:4", "16:9", "9:16", "21:9", "1:1", "auto"],
  frameRatios: ["auto"], defaultFrameRatio: "auto", firstFrame: true, lastFrame: true,
  references: [9, 3, 3], audioNeedsVisual: true, audio: true, seed: true,
});
