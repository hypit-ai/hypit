import type { VisualPresent } from '@hypit/composition';
import type { HtmlAnimation } from '@hypit/html-program';
import { exactTemporalValueFromFrames, extendTemporalMap } from '@hypit/temporal';
import type { TemporalMap } from '@hypit/temporal';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { lowerVisualClipRoot } from './lower.js';
import { poseAnimation, samplingAnimation } from './motion.js';
import type { VisualClipProgram } from './types.js';

/** Hold the boundary pose in source handles and retain every authored keyframe's timeline position. */
function extendAnimation(animation: HtmlAnimation | undefined, lead: number, duration: number): HtmlAnimation | null {
  if (!animation) return null;
  const keyframes = animation.keyframes.map(key => ({ ...structuredClone(key), atFrame: key.atFrame + lead }));
  const first = keyframes[0]!, last = keyframes.at(-1)!;
  if (first.atFrame > 0) keyframes.unshift({ ...structuredClone(first), atFrame: 0, easing: 'linear' });
  if (last.atFrame < duration) keyframes.push({ ...structuredClone(last), atFrame: duration, easing: 'linear' });
  return { ...structuredClone(animation), keyframes };
}

/** Prepare picture handles for a cut-centred Transition using the Clip's own sampling relation. */
export function transitionContribution(clip: VisualClipProgram, transition: FrameSpan, timeline: Timeline): VisualPresent {
  const span = { startFrame: Math.min(clip.span.startFrame, transition.startFrame), endFrameExclusive: Math.max(clip.span.endFrameExclusive, transition.endFrameExclusive) };
  const lead = clip.span.startFrame - span.startFrame, tail = span.endFrameExclusive - clip.span.endFrameExclusive;
  const originalDuration = clip.span.endFrameExclusive - clip.span.startFrame, duration = originalDuration + lead + tail;
  const samplingOverrides: Record<string, TemporalMap> = {};
  const samplingAnimationOverrides: Record<string, HtmlAnimation | null> = {};
  for (const layer of clip.layers) {
    if (layer.kind !== 'sample') continue;
    if (layer.sampling?.kind === 'map') {
      try {
        samplingOverrides[layer.id] = extendTemporalMap(layer.sampling.value, exactTemporalValueFromFrames(lead, timeline), exactTemporalValueFromFrames(tail, timeline), `${clip.id}:${layer.id}:transition`);
      } catch (error) {
        throw new Error(`Transition cannot extend Clip ${clip.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (layer.samplingMotion) samplingAnimationOverrides[layer.id] = extendAnimation(samplingAnimation(layer.samplingMotion, originalDuration), lead, duration);
  }
  return {
    kind: 'present', id: clip.id, subjectId: clip.subjectId, span,
    root: lowerVisualClipRoot({ ...clip, span }, {
      samplingOverrides, samplingAnimationOverrides,
      poseAnimationOverride: extendAnimation(poseAnimation(clip.motion, originalDuration), lead, duration),
    }),
  };
}
