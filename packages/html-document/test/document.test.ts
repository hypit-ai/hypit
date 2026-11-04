import assert from "node:assert/strict";
import test from "node:test";
import { compileHtmlPictureProgram } from "@hypit/html-program";
import { sealAudioProgram } from "@hypit/audio-program";
import { exactTemporalValueFromFrames } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  assertHtmlDocument,
  compileHtmlDocument,
  materializeHtmlDocument,
} from "../src/index.js";

function fixture() {
  const frameRate = { numerator: 30_000, denominator: 1_001 };
  const frameCount = 60;
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
  const program = compileHtmlPictureProgram({
    id: "document",
    frameRate,
    frameCount,
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    root: { id: "root", kind: "box" as const, spans: [{ startFrame: 0, endFrameExclusive: frameCount }], children: [
      { id: "image", kind: "image", spans: [{ startFrame: 0, endFrameExclusive: frameCount }], picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, artifact: picture, style: [] },
      { id: "second-image", kind: "image", spans: [{ startFrame: 0, endFrameExclusive: frameCount }], picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, artifact: secondPicture, style: [] },
    ], style: [] },
  });
  const audio = sealAudioProgram({
    domain: { id: "document:audio", duration: exactTemporalValueFromFrames(frameCount, { frameRate }) },
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [{ kind: "silence", id: "silence" }], output: { node: "silence" } },
  });
  return {
    pictures: [picture, secondPicture],
    program,
    audio,
  };
}

test("HTML Document composes independently compiled picture, sound and shared playback", () => {
  const { program, audio, pictures } = fixture();
  const document = compileHtmlDocument(program, audio);
  assert.doesNotThrow(() => assertHtmlDocument(document));
  assert.equal(document.program.frameCount, 60);
  assert.equal(document.audio.sampling.sampleRate, 48_000);
  assert.deepEqual(document.audio.domain.duration,
    exactTemporalValueFromFrames(60, { frameRate: document.program.frameRate }));
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
  const { program, audio } = fixture();
  const original = compileHtmlDocument(program, audio);
  const reboundResource = fixtureResource("html-document:rebound-picture");
  const rebound = {
    ...original,
    program: {
      ...original.program,
      artifacts: original.program.artifacts.map((entry) => ({
        ...entry,
        artifact: { ...entry.artifact, resource: reboundResource },
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

test("HTML Document rejects picture and sound that disagree on exact duration", () => {
  const { program, audio } = fixture();
  const document = compileHtmlDocument(program, audio);
  const invalid = { ...document, audio: {
    ...document.audio,
    domain: { ...document.audio.domain,
      duration: exactTemporalValueFromFrames(1, { frameRate: { numerator: 1, denominator: 1 } }) },
  } };
  assert.throws(() => assertHtmlDocument(invalid), /same exact duration/u);
});

test("HTML Document inserts extracted author scripts as literal text", () => {
  const { program, audio } = fixture();
  const document = compileHtmlDocument(program, audio);
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
