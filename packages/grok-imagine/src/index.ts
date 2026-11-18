import { defineVideoModel } from "@hypit/execution/model";

const family = {
  package: "@hypit/grok-imagine", duration: [1, 15], defaultResolution: "480p",
  aspectRatios: ["1:1", "16:9", "9:16", "3:2", "2:3"], firstFrame: true, references: [7, 0, 0],
} as const;
export const grokImagineVideo = defineVideoModel({
  ...family, model: "grok-imagine-video", title: "Grok Imagine Video",
  textDuration: [6, 30], resolutions: ["480p", "720p", "1080p"],
});
export const grokImagine15Preview = defineVideoModel({
  ...family, model: "grok-imagine-video-1.5-preview", title: "Grok Imagine 1.5 Preview",
  aspectRatios: [...family.aspectRatios, "auto"], resolutions: ["480p", "720p"],
});
