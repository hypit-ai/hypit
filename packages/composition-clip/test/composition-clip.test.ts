import assert from "node:assert/strict";
import test from "node:test";

import { compileAudioProgram } from "@hypit/audio-program";
import { sealComposition, sealPresentVisualTrack, visualElements } from "@hypit/composition";
import { compileHtmlProgram } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";

import {
  createCompositionOccurrence,
  renderCompositionAudio,
  renderCompositionVisual,
} from "../src/index.js";

const picture = {
  colorPrimaries: "bt709" as const,
  colorTransfer: "srgb" as const,
  referenceWhiteNits: 100,
  alphaMode: "premultiplied" as const,
};

function window(timelineId: string, startFrame: number, endFrameExclusive: number) {
  return {
    id: "nested-window",
    subjectId: "nested-subject",
    start: { id: "nested-start", subjectId: "nested-subject", timelineId, frame: startFrame },
    end: { id: "nested-end", subjectId: "nested-subject", timelineId, frame: endFrameExclusive },
    span: { startFrame, endFrameExclusive },
  };
}

test("one Composition occurrence branches into closed visual and audio carriers", () => {
  const childTimeline = sealTimeline({ id: "child-time", frameCount: 10, frameRate: { numerator: 30, denominator: 1 } });
  const childTrack = sealPresentVisualTrack({
    id: "child-picture",
    timelineId: childTimeline.id,
    visualIr: "hypit.visual-ir@1",
    presents: [{
      id: "child-card",
      span: { startFrame: 0, endFrameExclusive: 10 },
      root: { id: "child-root", kind: "box", children: [], style: [{ name: "background-color", value: "#224466" }] },
    }],
  });
  const child = sealComposition({
    id: "child",
    visual: {
      picture,
      canvas: { width: 320, height: 180, clearColor: "#00000000" },
      root: { members: [{ kind: "track", id: childTrack.id, track: childTrack }] },
    },
    audio: { contributions: [] },
  }, childTimeline);

  const parentTimeline = sealTimeline({ id: "parent-time", frameCount: 20, frameRate: { numerator: 30, denominator: 1 } });
  const occurrence = createCompositionOccurrence(parentTimeline, child, window(parentTimeline.id, 0, 20), {
    id: "child-occurrence",
  });
  const visual = renderCompositionVisual(parentTimeline, picture, occurrence, {
    header: { id: "nested-visual" },
    frame: { xPx: 0, yPx: 0, widthPx: 320, heightPx: 180 },
    fit: {
      sizing: "contain", framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
      offsetPx: { x: 0, y: 0 }, constraint: "bounded",
    },
    clip: {
      id: "nested-clip",
      treatment: { clip: { kind: "frame" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] },
    },
    appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
  });
  const audio = renderCompositionAudio(parentTimeline, occurrence, {
    id: "nested-audio",
    gain: 1,
    fadeIn: { unit: "frames", value: 0 },
    fadeOut: { unit: "frames", value: 0 },
  });
  const parent = sealComposition({
    id: "parent",
    visual: {
      picture,
      canvas: { width: 320, height: 180, clearColor: "#000000" },
      root: { members: [{ kind: "track", id: visual.id, track: visual }] },
    },
    audio: { contributions: [audio] },
  }, parentTimeline);

  const visualElement = visual.items[0]?.kind === "present" ? visual.items[0].root : undefined;
  const nestedElement = visualElement === undefined
    ? undefined : visualElements(visualElement).find((item) => item.kind === "composition");
  assert.equal(nestedElement?.kind, "composition");
  assert.deepEqual(nestedElement?.sampling, occurrence.sampling);
  const audioNode = audio.graph.nodes[0];
  assert.equal(audioNode?.kind, "composition");
  assert.deepEqual(audioNode?.kind === "composition" ? audioNode.sampling : undefined, occurrence.sampling);

  const html = compileHtmlProgram(parent);
  assert.match(html.html, /data-hypit-nested-composition/u);
  assert.match(html.html, /data-hypit-nested-frame-(?:values|runs)/u);
  const audioProgram = compileAudioProgram(parent);
  const nestedAudio = audioProgram.graph.nodes.find((node) => node.kind === "composition");
  assert.equal(nestedAudio?.kind, "composition");
  assert.equal(nestedAudio?.kind === "composition" ? nestedAudio.program.frameCount : undefined, 10);
});

test("nested visual closure rejects an implicit WorkingPicture conversion", () => {
  const childTimeline = sealTimeline({ id: "child-time", frameCount: 1, frameRate: { numerator: 30, denominator: 1 } });
  const child = sealComposition({
    id: "child",
    visual: { picture, canvas: { width: 1, height: 1, clearColor: "#000000" }, root: { members: [] } },
    audio: { contributions: [] },
  }, childTimeline);
  const parentTimeline = sealTimeline({ id: "parent-time", frameCount: 1, frameRate: { numerator: 30, denominator: 1 } });
  const occurrence = createCompositionOccurrence(parentTimeline, child, window(parentTimeline.id, 0, 1), { id: "child-occurrence" });
  assert.throws(() => renderCompositionVisual(parentTimeline, { ...picture, colorTransfer: "linear" }, occurrence, {
    header: { id: "nested-visual" }, frame: { xPx: 0, yPx: 0, widthPx: 1, heightPx: 1 },
    fit: { sizing: "contain", framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 }, offsetPx: { x: 0, y: 0 }, constraint: "bounded" },
    clip: { id: "nested-clip", treatment: { clip: { kind: "frame" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] } },
    appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
  }), /WorkingPicture differs/u);
});
