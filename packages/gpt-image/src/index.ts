import { defineImageModel } from "@hypit/execution/model";

const family = {
  package: "@hypit/gpt-image", resolutions: ["1K", "2K", "4K"], defaultResolution: "1K",
  backgrounds: ["auto", "opaque", "transparent"], formats: ["png", "jpeg", "webp"], outputs: 1,
} as const;
const ratios = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"];
export const gptImage2 = defineImageModel({
  ...family, model: "gpt-image-2", title: "GPT Image 2",
  aspectRatios: [...ratios, "3:1", "1:3"], references: 16, mask: true,
  quality: ["low", "medium", "high", "auto"],
});
const v25 = { ...family, aspectRatios: [...ratios, "27:16", "16:27", "9:8", "8:9"], references: 16 } as const;
export const gptImage25Flare = defineImageModel({
  ...v25, model: "gpt-image-2.5-flare", title: "GPT Image 2.5 Flare",
});
export const gptImage25Sunburst = defineImageModel({
  ...v25, model: "gpt-image-2.5-sunburst", title: "GPT Image 2.5 Sunburst",
});
