import { defineImageModel } from "@hypit/execution/model";

const family = {
  package: "@hypit/seedream", aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21"],
  references: 10, imagesAndOutputs: 15, watermark: true,
} as const;
export const seedream5Lite = defineImageModel({
  ...family, model: "seedream-5-lite", title: "Seedream 5 Lite", outputs: 15,
  quality: ["basic", "high", "ultra"], defaultQuality: "basic", formats: ["png", "jpeg"], nsfwCheck: true,
});
export const seedream5Pro = defineImageModel({
  ...family, model: "seedream-5-pro", title: "Seedream 5 Pro", outputs: 10,
  resolutions: ["1K", "2K"], defaultResolution: "2K",
});
