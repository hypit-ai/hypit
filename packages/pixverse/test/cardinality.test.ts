import assert from "node:assert/strict";
import test from "node:test";

import { sealPixverseRequest } from "../src/index.js";

const references = (count: number, role: "image" | "video") => Array.from({ length: count }, (_, index) => ({
  role,
  artifact: {
    kind: "blob" as const,
    resource: `res_pixverse_${role}_${index}` as `res_${string}`,
    size: 1,
    mediaType: role === "image" ? "image/png" : "video/mp4",
  },
}));

test("PixVerse owns variant and modality-specific reference limits", () => {
  const base = { prompt: ["animate"], duration: [5], quality: ["720p"], aspectRatio: ["16:9"] } as const;
  assert.equal(sealPixverseRequest("pixverse-v6", { ...base, referenceImage: references(10, "image") })
    .ports.referenceImage?.length, 10);
  assert.throws(() => sealPixverseRequest("pixverse-v6", { ...base, referenceImage: references(11, "image") }),
    /at most 10/u);
  assert.equal(sealPixverseRequest("pixverse-c1", { ...base, referenceImage: references(7, "image") })
    .ports.referenceImage?.length, 7);
  assert.throws(() => sealPixverseRequest("pixverse-c1", { ...base, referenceImage: references(8, "image") }),
    /at most 7/u);

  const videoBase = { prompt: ["recreate"], quality: ["720p"], aspectRatio: ["auto"] } as const;
  assert.equal(sealPixverseRequest("pixverse-v6", { ...videoBase, referenceVideo: references(2, "video") })
    .ports.referenceVideo?.length, 2);
  assert.throws(() => sealPixverseRequest("pixverse-v6", { ...videoBase, referenceVideo: references(3, "video") }),
    /at most 2/u);
});
