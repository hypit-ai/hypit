import { defineVideoModel } from "@hypit/execution/model";

const family = {
  package: "@hypit/pixverse", duration: [1, 15], resolutions: ["360p", "540p", "720p", "1080p"],
  defaultResolution: "720p", aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9", "auto"],
  firstFrame: true, lastFrame: true, audio: false,
} as const;

export const pixverseV6 = defineVideoModel({
  ...family, model: "pixverse-v6", title: "PixVerse V6", references: [10, 2, 0], sourceDuration: true,
});
export const pixverseC1 = defineVideoModel({
  ...family, model: "pixverse-c1", title: "PixVerse C1", references: [7, 0, 0],
});
