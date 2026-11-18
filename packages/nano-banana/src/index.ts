import { defineImageModel } from "@hypit/execution/model";

const baseRatios = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const family = { package: "@hypit/nano-banana", aspectRatios: [...baseRatios, "1:4", "4:1", "1:8", "8:1"] } as const;
const size = { resolutions: ["1K", "2K", "4K"], defaultResolution: "1K", formats: ["png", "jpg"] };
export const nanoBanana2 = defineImageModel({
  ...family, ...size, model: "nano-banana-2", title: "Nano Banana 2", references: 14,
});
export const nanoBanana2Lite = defineImageModel({
  ...family, model: "nano-banana-2-lite", title: "Nano Banana 2 Lite", references: 10,
});
export const nanoBananaPro = defineImageModel({
  ...family, ...size, model: "nano-banana-pro", title: "Nano Banana Pro", references: 8, aspectRatios: baseRatios,
});
