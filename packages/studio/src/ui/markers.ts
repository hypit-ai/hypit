import type { Range, StudioSnapshot } from "../shared.js";
import type { StudioTemporalMarker } from "../shared.js";

/** How many distinct depth tones the stylesheet defines. */
export const INTENT_TONES = 4;

function depthOf(range: Range, all: readonly Range[]): number {
  return 1 + all.filter((other) => other.start < range.start && other.end > range.end).length;
}

function markerKey(marker: StudioTemporalMarker): string {
  return JSON.stringify([marker.companion, marker.domainId, marker.itemId]);
}

/** Stable tones derived from package-contributed source nesting, then reused by Items. */
export function intentTones(snapshot: StudioSnapshot): ReadonlyMap<string, number> {
  const tones = new Map<string, number>();
  for (const domain of snapshot.temporalDomains) {
    const ranges = domain.items.flatMap((item) => item.range === undefined ? [] : [item.range]);
    for (const item of domain.items) {
      if (item.range !== undefined) {
        const tone = depthOf(item.range, ranges) % INTENT_TONES;
        tones.set(item.id, tone);
        tones.set(markerKey({ companion: domain.companion, domainId: domain.id, itemId: item.id }), tone);
      }
    }
  }
  const seen = new Map<string, number>();
  let spare = 0;
  for (const track of snapshot.tracks) {
    for (const item of track.items) {
      if (tones.has(item.authoredId)) continue;
      const key = item.marker === undefined ? undefined : markerKey(item.marker);
      const intent = key === undefined ? undefined : tones.get(key);
      if (intent === undefined) {
        tones.set(item.authoredId, spare % INTENT_TONES);
        spare += 1;
        continue;
      }
      const index = seen.get(key!) ?? 0;
      seen.set(key!, index + 1);
      tones.set(item.authoredId, (intent + index) % INTENT_TONES);
    }
  }
  return tones;
}

export type DomainSpan = {
  readonly companion: string;
  readonly domainId: string;
  readonly itemId: string;
  readonly depth: number;
  readonly range: Range;
  readonly startFrame: number;
  readonly endFrame: number;
};

/** Every package-contributed source span that is located on the Timeline. */
export function domainSpans(snapshot: StudioSnapshot): readonly DomainSpan[] {
  return snapshot.temporalDomains.flatMap((domain) => {
    const spans = domain.items.flatMap((item) => item.kind === "span" && item.range !== undefined
      ? [{ item, range: item.range }] : []);
    const ranges = spans.map(({ range }) => range);
    return spans.map(({ item, range }) => ({
      companion: domain.companion,
      domainId: domain.id,
      itemId: item.id,
      depth: depthOf(range, ranges),
      range,
      startFrame: item.startFrame,
      endFrame: item.endFrameExclusive,
    }));
  });
}

export function spanAtOffset(snapshot: StudioSnapshot, offset: number): DomainSpan | undefined {
  return domainSpans(snapshot)
    .filter((span) => offset >= span.range.start && offset <= span.range.end)
    .sort((left, right) => (left.range.end - left.range.start) - (right.range.end - right.range.start))[0];
}

export type SourceDomainItem = {
  readonly companion: string;
  readonly domainId: string;
  readonly itemId: string;
  readonly range: Range;
};

/** The tightest package-contributed temporal item under a source cursor. */
export function domainItemAtOffset(snapshot: StudioSnapshot, offset: number): SourceDomainItem | undefined {
  return snapshot.temporalDomains.flatMap((domain) => domain.items.flatMap((item) => item.range === undefined ? [] : [{
    companion: domain.companion, domainId: domain.id, itemId: item.id, range: item.range,
  }])).filter((item) => offset >= item.range.start && offset <= item.range.end)
    .sort((left, right) => (left.range.end - left.range.start) - (right.range.end - right.range.start))[0];
}
