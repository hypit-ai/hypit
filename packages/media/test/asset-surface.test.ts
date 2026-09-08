import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  decodeMediaAudioSurface,
  decodeMediaImageSurface,
  decodeMediaVideoSurface,
} from "@hypit/media";

const range = { start: 0, end: 80 };

for (const fixture of [
  { label: "Image", decode: decodeMediaImageSurface, src: "./reference.png", mediaType: "image/png" },
  { label: "Audio", decode: decodeMediaAudioSurface, src: "./reference.wav", mediaType: "audio/wav" },
  { label: "Video", decode: decodeMediaVideoSurface, src: "./reference.mp4", mediaType: "video/mp4" },
] as const) {
  test(`${fixture.label} Surface publishes the resolved BlobArtifact`, async () => {
    const artifact = {
      kind: "blob" as const,
      resource: fixtureResource(`media:${fixture.label.toLowerCase()}`),
      size: 2_048,
      mediaType: fixture.mediaType,
    };
    const requests: unknown[] = [];
    const result = await fixture.decode({
      sourceName: "main.svml",
      element: {
        kind: "element",
        name: `media:${fixture.label}`,
        attributes: { id: "reference", src: fixture.src },
        children: [],
        range,
      },
      resolveReference: () => undefined,
      resolveAsset: (request) => {
        requests.push(request);
        return { artifact };
      },
    });

    assert.deepEqual(requests, [{ from: fixture.src, mediaType: fixture.mediaType, range }]);
    assert.deepEqual(result.records, [{ id: "reference", type: {
      module: { name: "@hypit/artifact", version: "1" }, name: "BlobArtifact",
    }, value: artifact, range }]);
  });
}

test("Video Surface rejects ambiguous extensions and non-video resolved artifacts", async () => {
  const decode = (attributes: Readonly<Record<string, string>>, mediaType = "video/mp4") => decodeMediaVideoSurface({
    sourceName: "main.svml",
    element: { kind: "element", name: "media:Video", attributes, children: [], range },
    resolveReference: () => undefined,
    resolveAsset: (request) => ({ artifact: {
      kind: "blob", resource: fixtureResource("media:video-invalid"), size: 10, mediaType,
    } }),
  });

  await assert.rejects(async () => await decode({ id: "video", src: "./clip.bin" }), /known video extension/u);
  await assert.rejects(async () => await decode({ id: "video", src: "./clip.mp4" }, "image/png"), /video artifact/u);
  await assert.rejects(async () => await decode({ id: "video", src: "./clip.bin", "media-type": "image/png" }), /video media type/u);
});
