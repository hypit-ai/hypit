import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { parseStructuredElement } from "@narratage/markup";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@narratage/markup";
import { textTypes } from "@narratage/text";

import geminiPackage from "../packages/gemini-omni/src/activation.js";
import { decodeGeminiOmniVideoSurface } from "../packages/gemini-omni/src/surface.js";
import grokPackage from "../packages/grok-imagine/src/activation.js";
import {
  decodeGrokImaginePreviewVideoSurface,
  decodeGrokImagineVideoSurface,
} from "../packages/grok-imagine/src/surface.js";
import minimaxPackage from "../packages/minimax-h3/src/activation.js";
import {
  decodeMinimaxFrameVideoSurface,
  decodeMinimaxReferenceVideoSurface,
  decodeMinimaxTextVideoSurface,
} from "../packages/minimax-h3/src/surface.js";
import nanoPackage from "../packages/nano-banana/src/activation.js";
import {
  decodeNanoBananaImageSurface,
  decodeNanoBananaProImageSurface,
} from "../packages/nano-banana/src/surface.js";
import seedreamPackage from "../packages/seedream/src/activation.js";
import {
  decodeSeedreamReferenceImageSurface,
  decodeSeedreamTextImageSurface,
} from "../packages/seedream/src/surface.js";

const references = new Map<string, SurfaceResolvedReference>([
  ["prompt", {
    path: "prompt",
    ref: { kind: "component-output", component: "prompt", output: "text" },
    type: textTypes.text,
  }],
  ...["person.image", "ending.image", "voice.audio", "gesture.video"].map((path) => [path, {
    path,
    ref: {
      kind: "component-output" as const,
      component: path.split(".")[0]!,
      output: path.split(".")[1]!,
    },
    type: artifactTypes.blob,
  }] as const),
]);

async function decode(source: string, handler: StructuredSurfaceHandler) {
  const element = parseStructuredElement({ name: "model.svml", text: source }, 0).element;
  return await handler({
    sourceName: "model.svml",
    element,
    resolveReference: (path) => references.get(path),
    resolveAsset: () => { throw new Error("no assets in this test"); },
  });
}

function componentInput(result: Awaited<ReturnType<typeof decode>>, name: string) {
  return result.components[0]!.inputs[name];
}

test("Nano Banana variants own explicit prompt/reference Surfaces", async () => {
  for (const [handler, tag] of [
    [decodeNanoBananaImageSurface, "Image"],
    [decodeNanoBananaProImageSurface, "ProImage"],
  ] as const) {
    const result = await decode(`<nano:${tag} id="shot" prompt={prompt} aspect-ratio="9:16" resolution="2K" output-format="png">
      <nano:Reference image={person.image}/>
    </nano:${tag}>`, handler);
    assert.deepEqual(componentInput(result, "prompt:text"), references.get("prompt")!.ref);
    assert.deepEqual(componentInput(result, "image-0001:artifact"), references.get("person.image")!.ref);
    assert.deepEqual(result.components[0]!.outputs, { image: "shot.image" });
  }
  assert.deepEqual(nanoPackage.modules[0]!.manifest.surfaces.map((surface) => surface.tag), ["Image", "ProImage"]);
  assert.equal(nanoPackage.hostFacets.length, 2);
});

test("Seedream keeps text and reference image authoring as two visible modes", async () => {
  const textOnly = await decode(
    '<seedream:TextImage id="scene" prompt={prompt} aspect-ratio="9:16" quality="high" output-format="png" nsfw-check="true"/>',
    decodeSeedreamTextImageSurface,
  );
  assert.equal(Object.keys(textOnly.components[0]!.inputs).some((name) => name.endsWith(":artifact")), false);

  const reference = await decode(`<seedream:ReferenceImage id="scene" prompt={prompt} aspect-ratio="9:16" quality="high" output-format="png" nsfw-check="true">
    <seedream:Reference image={person.image}/>
  </seedream:ReferenceImage>`, decodeSeedreamReferenceImageSurface);
  assert.deepEqual(componentInput(reference, "image-0001:artifact"), references.get("person.image")!.ref);
  await assert.rejects(
    decode('<seedream:ReferenceImage id="bad" prompt={prompt} aspect-ratio="9:16" quality="high" output-format="png" nsfw-check="true"/>', decodeSeedreamReferenceImageSurface),
    /requires at least one Reference/u,
  );
  assert.equal(seedreamPackage.hostFacets.length, 2);
});

test("MiniMax exposes text, frame and multimodal reference graphs without dynamic mode guessing", async () => {
  const plain = await decode(
    '<h3:TextVideo id="plain" prompt={prompt} duration="6" resolution="768P" aspect-ratio="9:16"/>',
    decodeMinimaxTextVideoSurface,
  );
  assert.deepEqual(plain.components[0]!.outputs, { video: "plain.video" });

  const frame = await decode(
    '<h3:FrameVideo id="frame" prompt={prompt} duration="6" resolution="2K" first-frame={person.image} last-frame={ending.image}/>',
    decodeMinimaxFrameVideoSurface,
  );
  assert.deepEqual(componentInput(frame, "media-0001:artifact"), references.get("person.image")!.ref);
  assert.deepEqual(componentInput(frame, "media-0002:artifact"), references.get("ending.image")!.ref);

  const reference = await decode(`<h3:ReferenceVideo id="refs" prompt={prompt} duration="8" resolution="768P" aspect-ratio="9:16">
    <h3:Reference image={person.image}/>
    <h3:Reference audio={voice.audio}/>
  </h3:ReferenceVideo>`, decodeMinimaxReferenceVideoSurface);
  assert.equal(Object.keys(reference.components[0]!.inputs).filter((name) => name.endsWith(":artifact")).length, 2);
  assert.deepEqual(minimaxPackage.modules[0]!.manifest.surfaces.map((surface) => surface.tag), [
    "TextVideo", "FrameVideo", "ReferenceVideo",
  ]);
});

test("Gemini Omni preserves media excerpts and opaque IDs in their proper request ports", async () => {
  const result = await decode(`<omni:Video id="omni" prompt={prompt} duration="8" aspect-ratio="9:16" resolution="1080p" seed="42">
    <omni:Image image={person.image}/>
    <omni:Excerpt video={gesture.video} start-sec="1.5" end-sec="4"/>
    <omni:AudioId value="voice-1"/>
    <omni:CharacterId value="person-1"/>
  </omni:Video>`, decodeGeminiOmniVideoSurface);
  assert.deepEqual(componentInput(result, "media-0001:artifact"), references.get("person.image")!.ref);
  assert.deepEqual(componentInput(result, "media-0002:artifact"), references.get("gesture.video")!.ref);
  const draft = result.records.find((record) => record.id === "omni.draft")!;
  assert.equal(draft.value.kind, "inline");
  assert.deepEqual((draft.value.value as { ports: Record<string, unknown> }).ports.audioIds, ["voice-1"]);
  assert.deepEqual((draft.value.value as { ports: Record<string, unknown> }).ports.characterIds, ["person-1"]);
  const excerpt = result.records.find((record) => record.id === "omni.media-0002.binding")!;
  assert.deepEqual((excerpt.value.value as { fields: unknown }).fields, { startSec: 1.5, endSec: 4 });
  assert.equal(geminiPackage.hostFacets.length, 1);
});

test("Grok standard and preview variants stay separate and continuation is explicit", async () => {
  const continuation = await decode(`<grok:Video id="continued" prompt={prompt} duration="6" aspect-ratio="9:16" resolution="720p" source-task-id="task-1">
    <grok:Reference image={person.image}/>
  </grok:Video>`, decodeGrokImagineVideoSurface);
  assert.deepEqual(componentInput(continuation, "image-0001:artifact"), references.get("person.image")!.ref);

  const preview = await decode(
    '<grok:PreviewVideo id="preview" prompt={prompt} duration="6" aspect-ratio="9:16" resolution="720p"/>',
    decodeGrokImaginePreviewVideoSurface,
  );
  assert.deepEqual(preview.components[0]!.outputs, { video: "preview.video" });
  await assert.rejects(
    decode('<grok:Video id="bad" prompt={prompt} duration="6" aspect-ratio="9:16" resolution="720p" source-task-id="task-1"/>', decodeGrokImagineVideoSurface),
    /requires at least one Reference/u,
  );
  assert.deepEqual(grokPackage.modules[0]!.manifest.surfaces.map((surface) => surface.tag), ["Video", "PreviewVideo"]);
  assert.equal(grokPackage.hostFacets.length, 2);
});
