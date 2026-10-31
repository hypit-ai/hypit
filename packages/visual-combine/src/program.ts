import { assertVisualTrackIdentity, sealVisualTrack } from "@hypit/composition";
import type { VisualItem, VisualTrack } from "@hypit/composition";
import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import type {
  VisualCombineBlock,
  VisualCombineHeader,
  VisualCombineUse,
  VisualCombineUseSpec,
} from "./types.js";

function identity(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

export function sealVisualCombineHeader(value: VisualCombineHeader): VisualCombineHeader {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("VisualCombineHeader is invalid.");
  identity(value.id, "VisualCombineHeader.id");
  return { id: value.id };
}

export function sealVisualCombineUseSpec(value: VisualCombineUseSpec): VisualCombineUseSpec {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("VisualCombineUseSpec is invalid.");
  identity(value.id, "VisualCombineUseSpec.id");
  return { id: value.id };
}

function structuralId(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join(":");
}

function namespacedItem(item: VisualItem, useId: string): VisualItem {
  return {
    ...structuredClone(item),
    id: structuralId(["use", useId, "item", item.id]),
  };
}

function blockContent(timelineId: string, useIds: readonly string[], items: readonly VisualItem[]): VisualCombineBlock {
  return { timelineId, useIds: [...useIds], items: items.map((item) => structuredClone(item)) };
}

export function assertVisualCombineBlock(block: VisualCombineBlock, timeline?: Timeline): void {
  if (block === null || typeof block !== "object" || Array.isArray(block)
    || typeof block.timelineId !== "string" || !Array.isArray(block.useIds) || !Array.isArray(block.items)) {
    throw new Error("VisualCombineBlock is invalid.");
  }
  const ids = new Set<string>();
  for (const id of block.useIds) {
    identity(id, "VisualCombineBlock.useIds");
    if (ids.has(id)) throw new Error(`Visual Combine repeats Use ${id}.`);
    ids.add(id);
  }
  assertVisualTrackIdentity({ kind: "visual", timelineId: block.timelineId, id: "visual-combine-block", items: block.items }, timeline);
}

/** Lower one Use into a namespaced construction block without closing a Picture scope. */
export function createVisualCombineBlock(
  timeline: Timeline,
  spec: VisualCombineUseSpec,
  track: VisualTrack,
): VisualCombineBlock {
  assertTimelineIdentity(timeline);
  const sealed = sealVisualCombineUseSpec(spec);
  assertVisualTrackIdentity(track, timeline);
  return blockContent(timeline.id, [sealed.id], track.items.map((item) => namespacedItem(item, sealed.id)));
}

/** Concatenate two adjacent construction blocks. The caller owns balancing this pure reduction. */
export function concatVisualCombineBlocks(
  left: VisualCombineBlock,
  right: VisualCombineBlock,
  timeline: Timeline,
): VisualCombineBlock {
  assertTimelineIdentity(timeline);
  assertVisualCombineBlock(left, timeline);
  assertVisualCombineBlock(right, timeline);
  const leftIds = new Set(left.useIds);
  const repeated = right.useIds.find((id) => leftIds.has(id));
  if (repeated !== undefined) throw new Error(`Visual Combine repeats Use ${repeated}.`);
  return blockContent(timeline.id, [...left.useIds, ...right.useIds], [...left.items, ...right.items]);
}

export function finalizeVisualCombineBlock(
  block: VisualCombineBlock,
  header: VisualCombineHeader,
  timeline: Timeline,
): VisualTrack {
  const id = sealVisualCombineHeader(header).id;
  assertTimelineIdentity(timeline);
  assertVisualCombineBlock(block, timeline);
  const track = sealVisualTrack({ timelineId: timeline.id, id, items: block.items });
  assertVisualTrackIdentity(track, timeline);
  return track;
}

/** Direct package API: one ordered, linear pass with no cumulative Set values. */
export function combineVisualTracks(
  uses: readonly VisualCombineUse[],
  header: VisualCombineHeader,
  timeline: Timeline,
): VisualTrack {
  if (!Array.isArray(uses) || uses.length === 0) throw new Error("Visual Combine requires at least one Use.");
  assertTimelineIdentity(timeline);
  const ids = new Set<string>();
  const items: VisualItem[] = [];
  for (const [index, use] of uses.entries()) {
    if (use === null || typeof use !== "object" || Array.isArray(use)) {
      throw new Error(`Visual Combine Use ${index + 1} is invalid.`);
    }
    const entry = use as VisualCombineUse;
    const spec = sealVisualCombineUseSpec(entry.spec);
    if (ids.has(spec.id)) throw new Error(`Visual Combine repeats Use ${spec.id}.`);
    ids.add(spec.id);
    assertVisualTrackIdentity(entry.track, timeline);
    items.push(...entry.track.items.map((item) => namespacedItem(item, spec.id)));
  }
  const track = sealVisualTrack({ timelineId: timeline.id, id: sealVisualCombineHeader(header).id, items });
  assertVisualTrackIdentity(track, timeline);
  return track;
}
