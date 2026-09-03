import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { decodeGeminiGenerateSurface, geminiCapabilities } from "@hypit/gemini";
import { artifactTypes } from "@hypit/artifact";
import { textTypes } from "@hypit/text";

test("Gemini Surface builds one provider-neutral need with ordered media edges", async () => {
  const fragmentResult = await decodeGeminiGenerateSurface({
    sourceName: "main.svml",
    element: {
      kind: "element", name: "gemini:Generate",
      attributes: {
        id: "read", model: "gemini-3.1-pro",
        instruction: { kind: "reference", path: "instruction" },
        prompt: { kind: "reference", path: "prompt" },
      },
      children: [{
        kind: "element", name: "gemini:Reference",
        attributes: { media: { kind: "reference", path: "video" } }, children: [], range: { start: 20, end: 40 },
      }], range: { start: 0, end: 50 },
    },
    resolveAsset: () => { throw new Error("not used"); },
    resolveReference: (path) => path === "video" ? {
      path, ref: { kind: "record", id: "video" }, type: artifactTypes.blob,
      record: { id: "video", type: artifactTypes.blob, value: {
        kind: "blob", digest: fixtureDigest("gemini-video"), size: 10, mediaType: "video/mp4",
      } },
    } : {
      path, ref: { kind: "record", id: path }, type: textTypes.text,
      record: { id: path, type: textTypes.text, value: { kind: "inline", value: { value: path } } },
    },
  });
  assert.equal(fragmentResult.fragments.length, 1);
  const operation = fragmentResult.fragments[0]!.operations.find((item) => item.id === "generate");
  assert.deepEqual(operation?.producer, { module: geminiCapabilities["gemini-3.1-pro"].module, name: "request-gemini-3.1-pro" });
  assert.deepEqual(fragmentResult.components[0]?.outputs, { text: "read.text" });
});
