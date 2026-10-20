import assert from "node:assert/strict";
import test from "node:test";

import { createLocalMediaProvider } from "../../src/index.js";
import { localMediaToolchainProgram } from "../../src/program.js";
import { endpointOffers } from "@hypit/endpoint";

test("the local media Provider declares its external toolchain without owning a second daemon", () => {
  const program = localMediaToolchainProgram({
    id: "media",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "media");
  assert.equal(program.installation, undefined);
  assert.equal(program.start, undefined);
});

test("local media opts only reusable display materialization into transient execution", () => {
  const provider = createLocalMediaProvider({});
  assert.deepEqual(endpointOffers(provider).filter((offer) => offer.transient === true)
    .map((offer) => offer.capability.name), [
    "inspect-media",
    "normalize-media",
    "transform-media",
    "extract-media-audio",
    "extract-media-frame",
    "render-still-video",
  ]);
  assert.deepEqual(endpointOffers(provider).filter((offer) => offer.transient !== true)
    .map((offer) => offer.capability.name), [
    "project-speech-evidence-audio",
    "render-timeline-audio",
    "mux-program-media",
  ]);
});
