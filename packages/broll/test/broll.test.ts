import {
  assertBrollProductIdentity,
  assertBrollProgramIdentity,
  compileBrollProduct,
  projectBrollAudio,
  projectBrollVisual,
  sealBrollProgram,
} from "@narratage/broll";
import type { MediaArtifactRef } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { sealComposition, sealVisualTrack } from "@narratage/composition";
import type { AudioTrack, Track } from "@narratage/composition";
import assert from "node:assert/strict";
import test from "node:test";

import type { BrollItem, BrollPairTransition } from "@narratage/broll";
import { compileHyperframesDocument } from "@narratage/hyperframes";
import { digestOf } from "@narratage/protocol";

const programSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 10,
  frameRate: { numerator: 30, denominator: 1 },
});

function artifact(id: string, mediaType = "video/mp4", durationSec = 4): MediaArtifactRef {
  return { digest: digestOf(`broll:${id}`), size: 100, mediaType, durationSec };
}

function item(overrides: Partial<BrollItem> & Pick<BrollItem, "id" | "span" | "z">): BrollItem {
  return {
    artifact: artifact(overrides.id),
    tieBreak: overrides.id,
    box: { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 },
    fit: "cover",
    playback: "native",
    ...overrides,
  };
}

function program(items: readonly BrollItem[], transitions: readonly BrollPairTransition[] = []) {
  return sealBrollProgram({
    contract: "svml.broll-program@1",
    id: "story-broll",
    items,
    transitions,
  });
}

test("B-roll owns local motion while every item remains an independently stacked Present", () => {
  const authored = program([
    item({
      id: "board",
      artifact: artifact("board", "image/png", 0),
      span: { startFrame: 0, endFrameExclusive: 300 },
      z: 30,
      playback: "freeze",
      enter: { operator: "pop", durationFrames: 15 },
      exit: { operator: "fade", durationFrames: 15 },
    }),
    item({
      id: "cutaway",
      span: { startFrame: 30, endFrameExclusive: 150 },
      z: 80,
      enter: { operator: "slide-down", durationFrames: 12 },
      exit: { operator: "slide-up", durationFrames: 12 },
      includeAudio: true,
      audioGain: 0.7,
    }),
  ]);
  assert.doesNotThrow(() => assertBrollProgramIdentity(authored, programSpace));
  const product = compileBrollProduct(programSpace, authored);
  assert.doesNotThrow(() => assertBrollProductIdentity(product, programSpace));
  const board = product.visualTrack.presents.find((present) => present.id === "board")!;
  const cutaway = product.visualTrack.presents.find((present) => present.id === "cutaway")!;
  assert.equal(board.stacking.order, 30);
  assert.equal(cutaway.stacking.order, 80);
  assert.deepEqual(board.elements[0]!.animation?.keyframes.map((keyframe) => keyframe.atFrame), [0, 15, 285, 300]);
  assert.deepEqual(cutaway.elements[0]!.animation?.keyframes.map((keyframe) => keyframe.atFrame), [0, 12, 108, 120]);
  assert.deepEqual(product.audioTrack.clips.map((clip) => clip.id), ["source:cutaway"]);

  const middle = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "middle-overlay",
    presents: [{
      id: "middle",
      span: { startFrame: 0, endFrameExclusive: 300 },
      stacking: { order: 50, tieBreak: "middle" },
      elements: [{ id: "root", order: 0, kind: "box", style: [] }],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: "interleaved-broll",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [projectBrollVisual(product), middle, projectBrollAudio(product)],
  }), programSpace);
  const boardAt = document.html.indexOf('data-svml-present-id="board"');
  const middleAt = document.html.indexOf('data-svml-present-id="middle"');
  const cutawayAt = document.html.indexOf('data-svml-present-id="cutaway"');
  assert.ok(boardAt < middleAt && middleAt < cutawayAt, "Presents from one B-roll Track must interleave with peers by absolute z");
});

test("push is lowered into complementary animations inside one B-roll-owned handoff", () => {
  const authored = program([
    item({ id: "a", span: { startFrame: 0, endFrameExclusive: 120 }, z: 70 }),
    item({ id: "b", span: { startFrame: 105, endFrameExclusive: 240 }, z: 71 }),
  ], [{
    id: "a-to-b",
    fromItemId: "a",
    toItemId: "b",
    span: { startFrame: 105, endFrameExclusive: 120 },
    operator: "push",
    direction: "left",
  }]);
  const product = compileBrollProduct(programSpace, authored);
  const from = product.visualTrack.presents.find((present) => present.id === "a")!;
  const to = product.visualTrack.presents.find((present) => present.id === "b")!;
  assert.deepEqual(from.elements[0]!.animation?.keyframes.map((keyframe) => keyframe.atFrame), [0, 105, 120]);
  assert.deepEqual(to.elements[0]!.animation?.keyframes.map((keyframe) => keyframe.atFrame), [0, 15, 135]);
  assert.match(String(from.elements[0]!.animation?.keyframes.at(-1)?.style[1]?.value), /translate3d\(-100%/u);
  assert.match(String(to.elements[0]!.animation?.keyframes[0]?.style[1]?.value), /translate3d\(100%/u);
});

test("page-turn and transition SFX remain B-roll-owned and lower to generic visual/audio facts", () => {
  const sfx = artifact("page-sfx", "audio/wav", 0.2);
  const authored = program([
    item({ id: "page-a", span: { startFrame: 0, endFrameExclusive: 90 }, z: 40 }),
    item({ id: "page-b", span: { startFrame: 75, endFrameExclusive: 180 }, z: 41 }),
  ], [{
    id: "turn",
    fromItemId: "page-a",
    toItemId: "page-b",
    span: { startFrame: 75, endFrameExclusive: 90 },
    operator: "page-turn",
    direction: "left",
    sfx: { artifact: sfx, gain: 0.8 },
  }]);
  const product = compileBrollProduct(programSpace, authored);
  assert.equal(product.audioTrack.clips[0]?.id, "transition:turn");
  assert.deepEqual(product.audioTrack.clips[0]?.span, { startFrame: 75, endFrameExclusive: 81 });
  assert.equal(product.audioTrack.clips[0]?.artifact.digest, sfx.digest);
  const document = compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: "page-turn",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [product.visualTrack, product.audioTrack],
  }), programSpace);
  assert.match(document.html, /perspective\(1200px\) rotateY/u);
  assert.doesNotMatch(document.html, new RegExp(sfx.digest.slice("sha256:".length), "u"),
    "HyperFrames is visual-only; the media pipeline renders this proven AudioTrack separately");
});

test("B-roll rejects a pair transition that is not both items' exact shared boundary", () => {
  const authored = program([
    item({ id: "a", span: { startFrame: 0, endFrameExclusive: 120 }, z: 70 }),
    item({ id: "b", span: { startFrame: 105, endFrameExclusive: 240 }, z: 71 }),
  ], [{
    id: "invalid",
    fromItemId: "a",
    toItemId: "b",
    span: { startFrame: 106, endFrameExclusive: 119 },
    operator: "push",
    direction: "down",
  }]);
  assert.throws(() => compileBrollProduct(programSpace, authored), /must be the outgoing and incoming boundary/);
});

test("a BrollProduct is validated against the explicitly connected ProgramSpace", () => {
  const product = compileBrollProduct(programSpace, program([
    item({ id: "bounded", span: { startFrame: 0, endFrameExclusive: 120 }, z: 20 }),
  ]));
  const present = product.visualTrack.presents[0]!;
  const invalidVisual = sealVisualTrack({
    ...product.visualTrack,
    presents: [{ ...present, span: { startFrame: 0, endFrameExclusive: 301 } }],
  });
  const tampered = {
    contract: product.contract,
    visualTrack: invalidVisual,
    audioTrack: product.audioTrack,
  };
  assert.throws(() => assertBrollProductIdentity(tampered, programSpace), /outside ProgramSpace/);
});
