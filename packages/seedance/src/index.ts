import { defineVideoModel } from "@hypit/execution/model";

const family = {
  package: "@hypit/seedance",
  firstFrame: true, lastFrame: true, classifiedVisuals: true, audio: false, webSearch: true, seed: true,
  aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
  defaultResolution: "720p", defaultAspectRatio: "9:16", defaultFrameRatio: "9:16",
} as const;

const v2 = { ...family, duration: [4, 15], references: [9, 3, 3], audioNeedsVisual: true } as const;
const v25 = {
  ...family, duration: [4, 30], promptLimit: 30_000,
  frameRatios: ["adaptive"], defaultFrameRatio: "adaptive",
} as const;

export const seedance2 = defineVideoModel({
  ...v2, model: "seedance-2", title: "Seedance 2.0", resolutions: ["480p", "720p", "1080p", "4k"],
});
export const seedance2Fast = defineVideoModel({
  ...v2, model: "seedance-2-fast", title: "Seedance 2.0 Fast", resolutions: ["480p", "720p"],
});
export const seedance2Mini = defineVideoModel({
  ...v2, model: "seedance-2-mini", title: "Seedance 2.0 Mini", resolutions: ["480p", "720p"],
});
export const seedance25 = defineVideoModel({
  ...v25, model: "seedance-2.5", title: "Seedance 2.5", resolutions: ["480p", "720p", "1080p", "4k"],
  references: [30, 10, 10], automaticDuration: true,
});
export const seedance25Flash = defineVideoModel({
  ...v25, model: "seedance-2.5-flash", title: "Seedance 2.5 Flash", resolutions: ["480p", "720p"],
  references: [10, 5, 5],
});

export const seedanceModels = [seedance2, seedance2Fast, seedance2Mini, seedance25, seedance25Flash] as const;
