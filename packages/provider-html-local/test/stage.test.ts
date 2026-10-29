import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { htmlVisual, compileHtmlProgram } from "@hypit/html-program";
import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";
import { stageHtmlProgram } from "../src/stage.js";

test("typed Surface inspection borrows the completed streamed file used by capture", async () => {
  const surface = { artifact: { kind: "blob" as const, resource: "res_streamed-surface" as const,
    size: 6, mediaType: "image/png" }, width: 1, height: 1, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, timing: { kind: "still" as const } };
  const space = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "surface", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [{ id: "surface", span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "surface", kind: "surface", surface, style: [] } }] });
  const document = compileHtmlProgram(sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-surface-"));
  let inspected = false;
  let streamFinished = false;
  try {
    await stageHtmlProgram({ document, directory, read: async () => (async function* () {
      // Readers may reuse their chunk buffer after each write.
      const chunk = new Uint8Array([1, 2, 3]);
      yield chunk;
      chunk.set([4, 5, 6]);
      yield chunk;
      streamFinished = true;
    })(), validateSurface: async (value, path) => {
      assert.ok(streamFinished);
      assert.deepEqual(value, surface);
      assert.equal(path, join(directory, "artifacts", "asset-0.png"));
      assert.deepEqual([...await readFile(path)], [1, 2, 3, 4, 5, 6]);
      inspected = true;
    } });
    assert.ok(inspected);
    assert.deepEqual(await readdir(join(directory, "artifacts")), ["asset-0.png"]);
    assert.match(await readFile(join(directory, "index.html"), "utf8"), /\.\/artifacts\/asset-0\.png/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("staging cancels and joins sibling reads before exposing a failure", async () => {
  const space = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "images", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: ["a", "b", "c", "d"].map((id) => ({ id, span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id, kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [],
        artifact: { kind: "blob" as const, resource: `res_${id}` as const, size: 1, mediaType: "image/png" } },
    })) });
  const document = compileHtmlProgram(sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-cancel-"));
  let active = 0;
  let started = 0;
  try {
    await assert.rejects(stageHtmlProgram({ document, directory, read: async (artifact, signal) => {
      active++;
      started++;
      try {
        if (artifact.resource === "res_a") { await delay(10); throw new Error("source unavailable"); }
        await delay(60_000, undefined, { signal });
        return new Uint8Array([0]);
      } finally { active--; }
    }, maxConcurrentArtifacts: 2 }), /source unavailable/u);
    assert.equal(active, 0);
    assert.equal(started, 2, "a failure must stop unclaimed Artifact work");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("document staging bounds complete Artifact lifecycles without changing deterministic paths", async () => {
  const space = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const ids = Array.from({ length: 12 }, (_, index) => String(index).padStart(2, "0"));
  const track = sealPresentVisualTrack({ id: "images", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: ids.map((id) => ({ id, span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id, kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [],
        artifact: { kind: "blob" as const, resource: `res_${id}` as const, size: 1, mediaType: "image/png" } },
    })) });
  const document = compileHtmlProgram(sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-bounded-"));
  let active = 0;
  let peak = 0;
  let reads = 0;
  try {
    await stageHtmlProgram({ document, directory, maxConcurrentArtifacts: 3, read: async () => {
      active++;
      reads++;
      peak = Math.max(peak, active);
      try {
        await delay(5);
        return new Uint8Array([1]);
      } finally { active--; }
    } });
    assert.equal(reads, ids.length);
    assert.equal(peak, 3);
    assert.deepEqual(await readdir(join(directory, "artifacts")),
      ids.map((_, index) => `asset-${index}.png`).sort());
    const html = await readFile(join(directory, "index.html"), "utf8");
    for (let index = 0; index < ids.length; index++) assert.ok(html.includes(`./artifacts/asset-${index}.png`));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("document staging reads only Artifacts whose compiler usage overlaps the whole render selection", async () => {
  const space = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const first = { kind: "blob" as const, resource: "res_first-selection" as const, size: 1, mediaType: "image/png" };
  const late = { kind: "blob" as const, resource: "res_late-selection" as const, size: 1, mediaType: "image/png" };
  const always = { kind: "blob" as const, resource: "res_always-selection" as const, size: 1, mediaType: "image/png" };
  const track = sealPresentVisualTrack({ id: "images", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [
      { id: "first-a", span: { startFrame: 0, endFrameExclusive: 5 },
        root: { id: "first-a", kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [], artifact: first } },
      { id: "first-b", span: { startFrame: 5, endFrameExclusive: 10 },
        root: { id: "first-b", kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [], artifact: first } },
      { id: "late", span: { startFrame: 20, endFrameExclusive: 30 },
        root: { id: "late", kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [], artifact: late } },
      { id: "opaque", span: { startFrame: 20, endFrameExclusive: 30 },
        root: { id: "opaque", kind: "program" as const, style: [], slots: [],
          program: htmlVisual({ html: `<img src="hypit-artifact://${always.resource}">` }, [always]) } },
    ] });
  const document = compileHtmlProgram(sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === first.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 10 }] }, "adjacent uses merge canonically");
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-selection-"));
  const reads: string[] = [];
  try {
    await stageHtmlProgram({ document, directory,
      frameSelection: [{ startFrame: 2, endFrameExclusive: 3 }],
      read: async artifact => { reads.push(artifact.resource); return new Uint8Array([1]); } });
    assert.deepEqual(reads, [always.resource, first.resource], "opaque dependencies remain conservative");
    assert.deepEqual(await readdir(join(directory, "artifacts")), ["asset-0.png", "asset-1.png"]);
    const html = await readFile(join(directory, "index.html"), "utf8");
    assert.match(html, /data-hypit-artifact-src="\.\/artifacts\/asset-1\.png"/u);
    assert.match(html, /data-hypit-artifact-src="\.\/artifacts\/asset-2\.png"/u,
      "unselected compiler media keep an inert deterministic path without reading bytes");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("document staging rejects an invalid concurrency bound", async () => {
  const { composition, timeline } = (() => {
    const timeline = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
    return { timeline, composition: sealComposition({ id: "empty", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [] } }, audio: { contributions: [] } }, timeline) };
  })();
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-invalid-bound-"));
  try {
    await assert.rejects(stageHtmlProgram({
      document: compileHtmlProgram(composition), directory,
      maxConcurrentArtifacts: 0, read: async () => new Uint8Array(),
    }), /concurrency must be a positive safe integer/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("document staging drains readers and preserves an external cancellation reason", async () => {
  const space = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "images", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: ["a", "b"].map((id) => ({ id, span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id, kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [],
        artifact: { kind: "blob" as const, resource: `res_${id}` as const, size: 1, mediaType: "image/png" } },
    })) });
  const document = compileHtmlProgram(sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-external-cancel-"));
  const controller = new AbortController();
  const reason = new Error("caller stopped staging");
  let active = 0;
  let started = 0;
  try {
    const staging = stageHtmlProgram({ document, directory, maxConcurrentArtifacts: 2,
      signal: controller.signal, read: async (_artifact, signal) => {
        active++;
        started++;
        try {
          await delay(60_000, undefined, { signal });
          return new Uint8Array([1]);
        } finally { active--; }
      } });
    while (started < 2) await delay(1);
    controller.abort(reason);
    await assert.rejects(staging, error => error === reason);
    assert.equal(active, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("staging gives opaque Resource identities portable local names and writes complete streams", async () => {
  const resource = `res_${"x".repeat(247)}:img` as const;
  const space = sealTimeline({ id: "space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "image", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [{ id: "image", span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "image", kind: "image", picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, style: [],
        artifact: { kind: "blob", resource, size: 5, mediaType: "image/png" } } }] });
  const document = compileHtmlProgram(sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 64, height: 64, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-identity-"));
  try {
    await stageHtmlProgram({ document, directory, read: async artifact => {
      assert.equal(artifact.resource, resource);
      return (async function* () { yield new Uint8Array([1, 2]); yield new Uint8Array([3, 4, 5]); })();
    } });
    const files = await readdir(join(directory, "artifacts"));
    assert.equal(files.length, 1);
    assert.match(files[0]!, /^[a-z0-9-]+\.png$/u);
    assert.deepEqual([...await readFile(join(directory, "artifacts", files[0]!))], [1, 2, 3, 4, 5]);
    const html = await readFile(join(directory, "index.html"), "utf8");
    assert.ok(html.includes(`./artifacts/${files[0]}`));
    assert.doesNotMatch(document.html, new RegExp(resource, "u"),
      "the portable document addresses Programme-local identities rather than Result-store resources");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
