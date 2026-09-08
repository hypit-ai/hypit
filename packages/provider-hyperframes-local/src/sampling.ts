import type { MediaFrameRange } from "@hypit/media";
import { assert } from "./process.js";

type Rational = { readonly numerator: bigint; readonly denominator: bigint };
export type VideoSlot = MediaFrameRange & {
  readonly id: string;
  readonly src: string;
  readonly sourceFrame: Rational;
  readonly sourceRate: Rational;
  readonly sourceFps: { readonly num: number; readonly den: number };
};

function rational(value: string, label: string): Rational {
  assert(/^\d+\/[1-9]\d*$/u.test(value), `HyperFrames ${label} must be a non-negative rational`);
  const [a, b] = value.split("/");
  return { numerator: BigInt(a!), denominator: BigInt(b!) };
}

/** Read the compiler's exact frame markers, without reconstructing author intent from seconds. */
export function videoSlots(html: string): VideoSlot[] {
  return [...html.matchAll(/<video\b[^>]*>/gu)].map(([tag]) => {
    const attribute = (name: string): string => {
      const value = new RegExp(`(?:\\s)${name}="([^"]*)"`, "u").exec(tag)?.[1];
      assert(value !== undefined, `HyperFrames video lacks ${name}; compile its frame sampling before rendering`);
      return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    };
    const sourceFps = rational(attribute("data-hypit-source-fps"), "source frame rate");
    const slot = {
      id: attribute("id"), src: attribute("src"),
      startFrame: Number(attribute("data-hypit-start-frame")),
      endFrameExclusive: Number(attribute("data-hypit-end-frame")),
      sourceFrame: rational(attribute("data-hypit-source-frame"), "source frame"),
      sourceRate: rational(attribute("data-hypit-source-rate"), "source rate"),
      sourceFps: { num: Number(sourceFps.numerator), den: Number(sourceFps.denominator) },
    };
    assert(Number.isSafeInteger(slot.startFrame) && slot.startFrame >= 0
      && Number.isSafeInteger(slot.endFrameExclusive) && slot.endFrameExclusive > slot.startFrame
      && Number.isSafeInteger(slot.sourceFps.num) && slot.sourceFps.num > 0
      && Number.isSafeInteger(slot.sourceFps.den), "HyperFrames video frame mapping is invalid");
    return slot;
  });
}

/** A decoded frame owns [n, n+1) in source-frame coordinates. */
export function sourceFrameAt(slot: VideoSlot, frame: number): number {
  const a = slot.sourceFrame;
  const r = slot.sourceRate;
  const value = Number((a.numerator * r.denominator
    + BigInt(frame - slot.startFrame) * r.numerator * a.denominator) / (a.denominator * r.denominator));
  assert(Number.isSafeInteger(value) && value >= 0, "HyperFrames source frame exceeds safe arithmetic");
  return value;
}

export function sourceWindows(slots: readonly VideoSlot[], range: MediaFrameRange) {
  const sources = new Map<string, { fps: VideoSlot["sourceFps"]; windows: MediaFrameRange[] }>();
  for (const slot of slots) {
    const first = Math.max(range.startFrame, slot.startFrame);
    const last = Math.min(range.endFrameExclusive, slot.endFrameExclusive) - 1;
    if (last < first) continue;
    let source = sources.get(slot.src);
    if (source === undefined) {
      source = { fps: slot.sourceFps, windows: [] };
      sources.set(slot.src, source);
    }
    assert(source.fps.num * slot.sourceFps.den === slot.sourceFps.num * source.fps.den,
      "One HyperFrames source has conflicting frame rates");
    source.windows.push({ startFrame: sourceFrameAt(slot, first), endFrameExclusive: sourceFrameAt(slot, last) + 1 });
  }
  return [...sources].map(([src, source]) => {
    const windows: MediaFrameRange[] = [];
    for (const window of source.windows.sort((a, b) => a.startFrame - b.startFrame)) {
      const previous = windows.at(-1);
      if (previous !== undefined && window.startFrame <= previous.endFrameExclusive) {
        windows[windows.length - 1] = { startFrame: previous.startFrame,
          endFrameExclusive: Math.max(previous.endFrameExclusive, window.endFrameExclusive) };
      } else windows.push(window);
    }
    return { src, fps: source.fps, windows };
  });
}

export function distributeFrameRange(range: MediaFrameRange, workers: number): MediaFrameRange[] {
  const count = range.endFrameExclusive - range.startFrame;
  const active = Math.min(count, workers);
  return Array.from({ length: active }, (_, index) => ({
    startFrame: range.startFrame + Math.floor(index * count / active),
    endFrameExclusive: range.startFrame + Math.floor((index + 1) * count / active),
  }));
}
