import assert from "node:assert/strict";
import test from "node:test";
import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";
import { htmlVisualElement } from "@hypit/html-program";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  assertHtmlDocument,
  compileHtmlDocument,
  materializeHtmlDocument,
} from "../src/index.js";

function fixture() {
  const timeline = sealTimeline({
    id: "document-clock",
    frameCount: 60,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const picture = {
    kind: "blob" as const,
    resource: fixtureResource("html-document:picture"),
    size: 10,
    mediaType: "image/png",
  };
  const secondPicture = {
    ...picture,
    resource: fixtureResource("html-document:second-picture"),
  };
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,

    id: "picture",
    presents: [{
      id: "picture",
      span: { startFrame: 0, endFrameExclusive: timeline.frameCount },
      root: htmlVisualElement({ id: "root", kind: "box", children: [
        { id: "image", kind: "image", picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, artifact: picture, style: [] },
        { id: "second-image", kind: "image", picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, artifact: secondPicture, style: [] },
      ], style: [] }),
    }],
  });
  return {
    timeline,
    pictures: [picture, secondPicture],
    composition: sealComposition({ id: "document", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1920, height: 1080, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, timeline),
  };
}

test("HTML Document composes independently compiled picture, sound and shared playback", () => {
  const { composition, pictures, timeline } = fixture();
  const document = compileHtmlDocument(composition);
  assert.doesNotThrow(() => assertHtmlDocument(document));
  assert.equal(document.program.frameCount, 60);
  assert.equal(document.audio.frameCount, 60);
  assert.deepEqual(document.program.artifacts.map((entry) => entry.artifact), pictures);
  assert.equal(new Set(document.program.artifacts.map((entry) => entry.id)).size, pictures.length);

  const html = materializeHtmlDocument(document, (artifact) => `/materials/${artifact.resource}`, {
    autoplay: false,
    loop: false,
    muted: false,
    responsive: false,
  });
  assert.match(html, /window\.__hypitDocument/u);
  assert.match(html, /hypit\.html-document\.command@1/u);
  assert.match(html, /\/materials\//u);
  assert.match(html, /"autoplay":false/u);
});

test("document-local identities survive recursive Result material rebinding", () => {
  const { composition, timeline } = fixture();
  const original = compileHtmlDocument(composition);
  const reboundResource = fixtureResource("html-document:rebound-picture");
  const rebound = {
    ...original,
    program: {
      ...original.program,
      artifacts: original.program.artifacts.map((entry) => ({
        ...entry,
        artifact: { ...entry.artifact, resource: reboundResource },
      })),
      surfaces: original.program.surfaces.map((binding) => ({
        ...binding,
        surface: { ...binding.surface,
          artifact: { ...binding.surface.artifact, resource: reboundResource } },
      })),
    },
  };
  const resolved: string[] = [];
  const html = materializeHtmlDocument(rebound, (artifact) => {
    resolved.push(artifact.resource);
    return `/rebound/${artifact.resource}`;
  });
  assert.ok(resolved.length > 0);
  assert.ok(resolved.every((resource) => resource === reboundResource));
  assert.match(html, /\/rebound\//u);
});

test("HTML Document rejects picture and sound that disagree on their frame clock", () => {
  const { composition, timeline } = fixture();
  const document = compileHtmlDocument(composition);
  const invalid = { ...document, audio: {
    ...document.audio,
    frameRate: { numerator: 60, denominator: 1 },
    sampleFrames: 48_000,
  } };
  assert.throws(() => assertHtmlDocument(invalid), /same frame clock/u);
});

test("HTML Document inserts extracted author scripts as literal text", () => {
  const { composition, timeline } = fixture();
  const document = compileHtmlDocument(composition);
  const token = "window.__hypitLiteral='$&-$`-$\'';";
  const withLiteral = {
    ...document,
    program: {
      ...document.program,
      html: document.program.html.replace("</body>", () => `<script>${token}</script></body>`),
    },
  };
  const html = materializeHtmlDocument(withLiteral, (artifact) => `/materials/${artifact.resource}`);
  assert.ok(html.includes(token));
});
