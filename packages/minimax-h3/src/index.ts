import { defineVideoModel } from "@hypit/execution/model";

export const minimaxH3 = defineVideoModel({
  package: "@hypit/minimax-h3", model: "minimax-h3", title: "MiniMax H3",
  duration: [4, 15], resolutions: ["768p", "2k"], defaultResolution: "2k",
  aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], frameRatios: [],
  firstFrame: true, lastFrame: true, references: [9, 3, 3],
});
