/**
 * Immutable absolute-frame lookup for opaque payloads.
 *
 * This utility owns no media or rendering semantics. Callers keep those in the
 * payload and may query frames or ranges in any order, from any Worker.
 */
import { assertFrameSpan } from "@hypit/timeline";
import type { FrameSpan } from "@hypit/timeline";

type Entry<T> = FrameSpan & { readonly serial: number; readonly payload: T };
type Node<T> = {
  readonly center: number;
  readonly byStart: readonly Entry<T>[];
  readonly byEnd: readonly Entry<T>[];
  readonly left: Node<T> | undefined;
  readonly right: Node<T> | undefined;
};

function assertIndexSpan(span: FrameSpan): void {
  try {
    assertFrameSpan(span);
  } catch {
    throw new Error("Frame span index entry is invalid");
  }
}

function build<T>(entries: readonly Entry<T>[]): Node<T> | undefined {
  if (entries.length === 0) return undefined;
  const centers = entries
    .map((entry) => entry.startFrame + (entry.endFrameExclusive - entry.startFrame) / 2)
    .sort((left, right) => left - right);
  const center = centers[Math.floor(centers.length / 2)]!;
  const left: Entry<T>[] = [];
  const right: Entry<T>[] = [];
  const overlaps: Entry<T>[] = [];
  for (const entry of entries) {
    if (entry.endFrameExclusive <= center) left.push(entry);
    else if (entry.startFrame > center) right.push(entry);
    else overlaps.push(entry);
  }
  return Object.freeze({
    center,
    byStart: Object.freeze([...overlaps].sort((a, b) =>
      a.startFrame - b.startFrame || a.endFrameExclusive - b.endFrameExclusive || a.serial - b.serial)),
    byEnd: Object.freeze([...overlaps].sort((a, b) =>
      b.endFrameExclusive - a.endFrameExclusive || a.startFrame - b.startFrame || a.serial - b.serial)),
    left: build(left),
    right: build(right),
  });
}

function collectAt<T>(node: Node<T> | undefined, frame: number, result: Entry<T>[]): void {
  if (node === undefined) return;
  if (frame < node.center) {
    for (const entry of node.byStart) {
      if (entry.startFrame > frame) break;
      result.push(entry);
    }
    collectAt(node.left, frame, result);
    return;
  }
  for (const entry of node.byEnd) {
    if (entry.endFrameExclusive <= frame) break;
    result.push(entry);
  }
  collectAt(node.right, frame, result);
}

function collectOverlapping<T>(node: Node<T> | undefined, span: FrameSpan, result: Entry<T>[]): void {
  if (node === undefined) return;
  for (const entry of node.byStart) {
    if (entry.startFrame >= span.endFrameExclusive) break;
    if (entry.endFrameExclusive > span.startFrame) result.push(entry);
  }
  if (span.startFrame < node.center) collectOverlapping(node.left, span, result);
  if (span.endFrameExclusive > node.center) collectOverlapping(node.right, span, result);
}

export class FrameSpanIndex<T extends FrameSpan> {
  readonly #root: Node<T> | undefined;

  constructor(values: readonly T[]) {
    const entries = values.map((payload, serial): Entry<T> => {
      assertIndexSpan(payload);
      return Object.freeze({
        startFrame: payload.startFrame,
        endFrameExclusive: payload.endFrameExclusive,
        serial,
        payload,
      });
    });
    this.#root = build(entries);
  }

  at(frame: number): T[] {
    if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("Frame span index query is invalid");
    const result: Entry<T>[] = [];
    collectAt(this.#root, frame, result);
    return result.sort((left, right) => left.serial - right.serial).map((entry) => entry.payload);
  }

  overlapping(span: FrameSpan): T[] {
    assertIndexSpan(span);
    const result: Entry<T>[] = [];
    collectOverlapping(this.#root, span, result);
    return result.sort((left, right) => left.serial - right.serial).map((entry) => entry.payload);
  }
}
