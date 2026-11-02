import { exactTemporalValueFromFrames, extendTemporalMap } from '@hypit/temporal';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import type { VisualElement, VisualPresent } from './track.js';

/** Extend source sampling while keeping the occurrence's authored animation clock. */
export function extendVisualPresent(present: VisualPresent, requested: FrameSpan, timeline: Timeline): VisualPresent {
  const span = { startFrame: Math.min(present.span.startFrame, requested.startFrame), endFrameExclusive: Math.max(present.span.endFrameExclusive, requested.endFrameExclusive) };
  const lead = exactTemporalValueFromFrames(present.span.startFrame - span.startFrame, timeline);
  const tail = exactTemporalValueFromFrames(span.endFrameExclusive - present.span.endFrameExclusive, timeline);
  const element = (value: VisualElement): VisualElement => {
    if (value.kind === 'program') return { ...value, slots: value.slots.map(slot => ({ ...slot, element: element(slot.element) })) };
    if (value.kind === 'mask') return { ...value, mask: element(value.mask), content: element(value.content) };
    if (value.kind === 'video' || value.kind === 'surface' && value.sampling) return { ...value, sampling: extendTemporalMap(value.sampling!, lead, tail, `${present.id}:${value.id}:handles`, exactTemporalValueFromFrames(1, timeline)) };
    return structuredClone(value);
  };
  return { ...present, span, clock: present.clock ?? present.span, visibility: [requested], root: element(present.root) };
}
