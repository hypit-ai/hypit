import { extendVisualPresent, type VisualPresent } from '@hypit/composition';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { lowerVisualClipRoot } from './lower.js';
import type { VisualClipProgram } from './types.js';

/** Resolve source handles and hold the boundary picture after available source time. */
export function transitionContribution(clip: VisualClipProgram, transition: FrameSpan, timeline: Timeline): VisualPresent {
  return extendVisualPresent({ kind: 'present', id: clip.id, subjectId: clip.subjectId, span: clip.span, root: lowerVisualClipRoot(clip) }, transition, timeline);
}
