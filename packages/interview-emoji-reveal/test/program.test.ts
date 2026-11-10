import assert from "node:assert/strict";
import test from "node:test";
import type { BlobRef } from "@hypit/hypit/protocol";
import type { TemporalInstant } from "@hypit/temporal";
import { sealTimeline } from "@hypit/timeline";
import { fixtureResource } from "../../../test/fixture-resource.js";

import { decodeEmojiRevealStyle, renderEmojiReveal } from "../src/index.js";

const timeline = sealTimeline({ id: "reveal-space", frameCount: 300, frameRate: { numerator: 30, denominator: 1 } });
const icon: BlobRef = { kind: "blob", resource: fixtureResource("emoji-reveal-icon"), size: 10, mediaType: "image/png" };
const instant = (id: string, frame: number): TemporalInstant => ({ id, subjectId: id, timelineId: timeline.id, frame });

function iconScales(revealFrames: number): readonly (readonly [number, string])[] {
  const track = renderEmojiReveal({ xPx: 0, yPx: 0, widthPx: 1080, heightPx: 1920 }, timeline, {
    id: "reveal",
    timelineId: timeline.id,
    style: decodeEmojiRevealStyle("style", { path: "reveal", properties: { "reveal-frames": revealFrames } }),
    placeholder: icon,
    outer: { id: "reveal", subjectId: "reveal", start: instant("start", 0), end: instant("end", 300),
      span: { startFrame: 0, endFrameExclusive: 300 } },
    items: [{ spec: { id: "one", preset: false }, icon, activation: instant("one", 30) }],
  });
  const element = track.presents[0]!.elements.find((candidate) => candidate.id === "slot-1-icon");
  return (element?.animation?.keyframes ?? []).map((keyframe) => [keyframe.atFrame,
    String(keyframe.style.find((declaration) => declaration.name === "transform")?.value)] as const);
}

test("a revealed icon settles at full size when its reveal ends", () => {
  assert.deepEqual(iconScales(1).filter(([frame]) => frame >= 30),
    [[30, "scale(0.72)"], [31, "scale(1)"], [300, "scale(1)"]]);
  assert.deepEqual(iconScales(6).filter(([frame]) => frame >= 30),
    [[30, "scale(0.72)"], [32, "scale(1.14)"], [34, "scale(0.95)"], [36, "scale(1)"], [300, "scale(1)"]]);
});
