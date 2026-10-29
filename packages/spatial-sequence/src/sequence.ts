import { assertCanvas, assertSpatialFrame, type Canvas, type SpatialFrame } from "@hypit/spatial";
import { assertClockIdentity, assertTimelineIdentity, type Timeline } from "@hypit/timeline";

import type { NormalizedRegion, RegionSequenceDocument, TimelineRegionSequence } from "./types.js";

const RECORD_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exactKeys(value: object, keys: readonly string[], subject: string): void {
  const actual = Object.keys(value);
  const extra = actual.find((key) => !keys.includes(key));
  const missing = keys.find((key) => !actual.includes(key));
  assert(extra === undefined && missing === undefined,
    `${subject} must contain exactly ${keys.join(", ")}.`);
}

function assertNormalizedRegion(value: NormalizedRegion, subject: string): void {
  assert(Array.isArray(value) && value.length === 4
    && value.every((part) => typeof part === "number" && Number.isFinite(part)),
  `${subject} must be [x, y, width, height].`);
  const [x, y, width, height] = value;
  assert(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1,
    `${subject} must be a positive normalized region inside the final picture plane.`);
}

export function assertRegionSequenceDocument(value: RegionSequenceDocument): void {
  assert(value !== null && typeof value === "object", "RegionSequenceDocument must be an object.");
  exactKeys(value, ["clock", "frameCount", "series"], "RegionSequenceDocument");
  assert(value.clock !== null && typeof value.clock === "object", "RegionSequenceDocument.clock must be an object.");
  exactKeys(value.clock, ["frameRate"], "RegionSequenceDocument.clock");
  assert(value.clock.frameRate !== null && typeof value.clock.frameRate === "object",
    "RegionSequenceDocument.clock.frameRate must be an object.");
  exactKeys(value.clock.frameRate, ["numerator", "denominator"], "RegionSequenceDocument.clock.frameRate");
  assertClockIdentity(value.clock);
  assert(Number.isSafeInteger(value.frameCount) && value.frameCount > 0,
    "RegionSequenceDocument.frameCount must be a positive whole number.");
  assert(Array.isArray(value.series) && value.series.length > 0,
    "RegionSequenceDocument.series must be a non-empty list.");
  const ids = new Set<string>();
  for (const [seriesIndex, series] of value.series.entries()) {
    assert(series !== null && typeof series === "object", `RegionSequenceDocument.series.${seriesIndex + 1} must be an object.`);
    exactKeys(series, ["id", "regions"], `RegionSequenceDocument.series.${seriesIndex + 1}`);
    assert(typeof series.id === "string" && RECORD_ID.test(series.id) && !ids.has(series.id),
      `RegionSequenceDocument repeats or cannot use series id ${String(series.id)}.`);
    ids.add(series.id);
    assert(Array.isArray(series.regions) && series.regions.length === value.frameCount,
      `RegionSequenceDocument series ${series.id} must contain exactly ${value.frameCount} Frames.`);
    for (const [frame, region] of series.regions.entries()) {
      if (region !== null) assertNormalizedRegion(region, `${series.id}.regions.${frame}`);
    }
  }
}

export function sealRegionSequenceDocument(value: RegionSequenceDocument): RegionSequenceDocument {
  assertRegionSequenceDocument(value);
  return structuredClone(value);
}

export function assertTimelineRegionSequence(value: TimelineRegionSequence): void {
  assert(value !== null && typeof value === "object" && typeof value.timelineId === "string" && value.timelineId.trim().length > 0,
    "TimelineRegionSequence must name its Timeline.");
  exactKeys(value, ["timelineId", "series"], "TimelineRegionSequence");
  assert(Array.isArray(value.series) && value.series.length > 0,
    "TimelineRegionSequence.series must be a non-empty list.");
  const frameCount = value.series[0]?.frames.length ?? 0;
  assert(frameCount > 0, "TimelineRegionSequence has no Frames.");
  const ids = new Set<string>();
  for (const series of value.series) {
    exactKeys(series, ["id", "frames"], `TimelineRegionSequence series ${series.id}`);
    assert(RECORD_ID.test(series.id) && !ids.has(series.id),
      `TimelineRegionSequence repeats or cannot use series id ${series.id}.`);
    ids.add(series.id);
    assert(series.frames.length === frameCount, `TimelineRegionSequence series ${series.id} has another frame domain.`);
    for (const frame of series.frames) if (frame !== null) assertSpatialFrame(frame);
  }
}

export function sealTimelineRegionSequence(value: TimelineRegionSequence): TimelineRegionSequence {
  assertTimelineRegionSequence(value);
  return structuredClone(value);
}

function resolveRegion(region: NormalizedRegion | null, canvas: Canvas): SpatialFrame | null {
  if (region === null) return null;
  const [x, y, width, height] = region;
  return {
    xPx: x * canvas.widthPx,
    yPx: y * canvas.heightPx,
    widthPx: width * canvas.widthPx,
    heightPx: height * canvas.heightPx,
  };
}

/** Attach one complete author sequence exactly to a Timeline and final Canvas. */
export function resolveTimelineRegionSequence(
  document: RegionSequenceDocument,
  timeline: Timeline,
  canvas: Canvas,
): TimelineRegionSequence {
  assertRegionSequenceDocument(document);
  assertTimelineIdentity(timeline);
  assertCanvas(canvas);
  assert(document.clock.frameRate.numerator === timeline.frameRate.numerator
      && document.clock.frameRate.denominator === timeline.frameRate.denominator,
    "RegionSequenceDocument Clock must exactly equal the selected Timeline Clock; spatial sequences are not resampled.");
  assert(document.frameCount === timeline.frameCount,
    `RegionSequenceDocument must contain exactly Timeline ${timeline.id}'s ${timeline.frameCount} Frames.`);
  return sealTimelineRegionSequence({
    timelineId: timeline.id,
    series: document.series.map((series) => ({
      id: series.id,
      frames: series.regions.map((region) => resolveRegion(region, canvas)),
    })),
  });
}

function escapeMarkupBoundaries(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/gu, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function encodeRegionSequenceDocument(document: RegionSequenceDocument): string {
  assertRegionSequenceDocument(document);
  return escapeMarkupBoundaries(JSON.stringify(document, null, 2));
}

export function decodeRegionSequenceDocument(text: string, subject = "region sequence document"): RegionSequenceDocument {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    throw new Error(`${subject}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
  try { return sealRegionSequenceDocument(value as RegionSequenceDocument); }
  catch (error) {
    throw new Error(`${subject}: ${error instanceof Error ? error.message : "invalid region sequence"}`);
  }
}

export function regionSequenceSource(id: string, document: RegionSequenceDocument): string {
  assert(RECORD_ID.test(id), "Region sequence id must be a canonical lower-case identifier.");
  return `<?svml using="@hypit/markup@1"?>\n<svml>\n  <import as="sequence" from="@hypit/spatial-sequence@1"/>\n  <sequence:Regions id="${id}">\n${encodeRegionSequenceDocument(document)}\n  </sequence:Regions>\n</svml>\n`;
}
