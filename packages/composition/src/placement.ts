import { placeAnimationClock } from './animation-clock.js';
import { addExactTemporalValues, compareExactTemporalValues, exactTemporalValueFromFrames, resolveTemporalBoundary, padTemporalMap, sliceTemporalMap, subtractExactTemporalValues, scaleExactTemporalValue, parseTemporalRate, retimeTemporalMap } from '@hypit/temporal';
import type { ExactTemporalValue } from '@hypit/temporal';
import { assertFrameSpan, assertTimelineIdentity } from '@hypit/timeline';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { assertCompositionIdentity, sealComposition } from './track.js';
import { audioEnvelopeGainAt } from './audio-level-automation.js';
import type { AudioGraphNode, Composition, VisualContribution, VisualElement, VisualItem, VisualScope, VisualScopeMember } from './track.js';

/** Place a selected local interval while retaining the authored animation and fade clocks. */
export function placeComposition(source: Composition, timeline: Timeline, target: FrameSpan, sourceStartFrame: number, options: { boundary?: "hold"; rate?: import('@hypit/temporal').TemporalRate; sourceStartTime?: ExactTemporalValue } = {}): Composition {
  assertCompositionIdentity(source); assertTimelineIdentity(timeline); assertFrameSpan(target, timeline.frameCount);
  if (source.timeline.frameRate.numerator * timeline.frameRate.denominator !== timeline.frameRate.numerator * source.timeline.frameRate.denominator) throw new Error('Composition placement requires matching frame rates.');
  const duration = target.endFrameExclusive - target.startFrame, rateRatio = options.rate ?? { numerator: 1, denominator: 1 }, rate = rateRatio.numerator / rateRatio.denominator;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Composition placement requires a positive rate.');
  const exactFrame = (frame: number) => scaleExactTemporalValue(exactTemporalValueFromFrames(1, timeline), parseTemporalRate(String(frame), 'Composition frame'));
  const sourceStartTime = options.sourceStartTime ?? exactFrame(sourceStartFrame);
  const sourceTimeAt = (frame: number) => addExactTemporalValues(sourceStartTime, scaleExactTemporalValue(exactFrame(frame - target.startFrame), rateRatio));
  const divideTime = (value: ExactTemporalValue) => scaleExactTemporalValue(value, { numerator: rateRatio.denominator, denominator: rateRatio.numerator });
  if (!Number.isFinite(sourceStartFrame) || (!options.boundary && (sourceStartFrame < 0 || sourceStartFrame + duration * rate > source.timeline.frameCount + 1e-7))) throw new Error('Composition placement exceeds its local Timeline.');
  const selected = { startFrame: sourceStartFrame, endFrameExclusive: sourceStartFrame + duration * rate };
  const frameAt = (sourceFrame: number) => Math.ceil(target.startFrame + (sourceFrame - sourceStartFrame) / rate - 1e-9);
  const sourceAt = (targetFrame: number) => sourceStartFrame + (targetFrame - target.startFrame) * rate;
  const shift = (span: FrameSpan): FrameSpan => ({ startFrame: frameAt(span.startFrame), endFrameExclusive: frameAt(span.endFrameExclusive) });
  const clock = (value: import('./animation-clock.js').AnimationClock) => placeAnimationClock(value, sourceStartFrame, target.startFrame, rate);
  const intersect = (span: FrameSpan): FrameSpan | undefined => {
    const startFrame = Math.max(options.boundary && span.startFrame === 0 ? Math.min(0, selected.startFrame) : span.startFrame, selected.startFrame), endFrameExclusive = Math.min(options.boundary && span.endFrameExclusive === source.timeline.frameCount ? Math.max(source.timeline.frameCount, selected.endFrameExclusive) : span.endFrameExclusive, selected.endFrameExclusive);
    const first = Math.max(target.startFrame, frameAt(startFrame)), last = Math.min(target.endFrameExclusive, frameAt(endFrameExclusive));
    return first < last ? { startFrame: sourceAt(first), endFrameExclusive: sourceAt(last) } : undefined;
  };
  const visibility = (spans: readonly FrameSpan[] | undefined) => spans?.flatMap(span => { const value = intersect(span); return value ? [shift(value)] : []; });
  const element = (value: VisualElement, from: ExactTemporalValue, until: ExactTemporalValue, frames: number): VisualElement => {
    if (value.kind === 'program') return { ...value, slots: value.slots.map(slot => ({ ...slot, element: element(slot.element, from, until, frames) })) };
    if (value.kind === 'mask') return { ...value, mask: element(value.mask, from, until, frames), content: element(value.content, from, until, frames) };
    if (value.kind === 'video' || value.kind === 'surface' && value.sampling) {
      const original = value.sampling!, duration = original.stages[0]!.target.duration, zero = exactFrame(0);
      const lead = compareExactTemporalValues(from, zero) < 0 ? subtractExactTemporalValues(zero, from) : zero;
      const tail = compareExactTemporalValues(until, duration) > 0 ? subtractExactTemporalValues(until, duration) : zero;
      const map = lead.ticks !== '0' || tail.ticks !== '0' ? padTemporalMap(original, lead, tail, exactFrame(1), `compound-padding-${value.kind}`) : original;
      return { ...value, sampling: retimeTemporalMap(sliceTemporalMap(map, addExactTemporalValues(from, lead), addExactTemporalValues(until, lead), `compound-window-${value.kind}`), exactFrame(frames), `compound-retimed-${value.kind}`) };
    }
    return structuredClone(value);
  };
  const contribution = (value: VisualContribution): VisualContribution | undefined => {
    const range = intersect(value.span); if (!range) return;
    const common = { ...value, span: shift(range), clock: clock(value.clock ?? value.span), ...(value.visibility ? { visibility: visibility(value.visibility)! } : {}) };
    if (value.kind === 'present') return { ...common, kind: 'present', root: element(value.root, subtractExactTemporalValues(sourceTimeAt(common.span.startFrame), exactFrame(value.span.startFrame)), subtractExactTemporalValues(sourceTimeAt(common.span.endFrameExclusive), exactFrame(value.span.startFrame)), common.span.endFrameExclusive - common.span.startFrame) };
    return { ...common, kind: 'process', effect: structuredClone(value.effect), inputs: value.inputs.map(input => {
      const placed = input.contribution && contribution(input.contribution);
      return { name: input.name, ...(placed ? { contribution: placed } : {}) };
    }) };
  };
  const scope = (value: VisualScope): VisualScope => ({ members: value.members.flatMap((member): VisualScopeMember[] => {
    if (member.kind === 'stack') {
      const child = scope(member.scope), clear = member.background && intersect(member.background.span);
      if (!child.members.length && !clear) return [];
      return [{ kind: 'stack', id: member.id, scope: child, ...(member.crop ? { crop: { ...member.crop } } : {}), ...(member.transform ? { transform: { ...member.transform } } : {}), ...(member.motion ? { motion: { ...structuredClone(member.motion), clock: clock(member.motion.clock) } } : {}), ...(clear ? { background: { color: member.background!.color, span: shift(clear) } } : {}) }];
    }
    if (member.kind === 'process') {
      const original = member.timing ?? { startFrame: 0, endFrameExclusive: source.timeline.frameCount }, range = intersect(original);
      return range ? [{ ...member, timing: shift(range), clock: clock(member.clock ?? original), inputs: member.inputs.map(input => ({ name: input.name, scope: scope(input.scope) })) }] : [];
    }
    const items = member.track.items.flatMap((item): VisualItem[] => {
      if (item.kind !== 'adjustment') { const placed = contribution(item); return placed ? [placed] : []; }
      const range = intersect(item.span);
      return range ? [{ ...item, span: shift(range), clock: clock(item.clock ?? item.span), ...(item.visibility ? { visibility: visibility(item.visibility)! } : {}) }] : [];
    });
    return items.length ? [{ ...member, track: { ...member.track, timelineId: timeline.id, items } }] : [];
  }) });
  const localStart = sourceStartTime, localEnd = sourceTimeAt(target.endFrameExclusive);
  const mapTime = (value: ExactTemporalValue) => addExactTemporalValues(divideTime(subtractExactTemporalValues(value, localStart)), exactFrame(target.startFrame));
  const samples = (value: ExactTemporalValue) => resolveTemporalBoundary(value, { frameRate: { numerator: 48_000, denominator: 1 } }, 'nearest');
  const sampleShift = (sample: number) => samples(mapTime({ ticks: String(sample), timeBase: { numerator: 1, denominator: 48_000 } }));
  const placed = sealComposition({ id: source.id,
    visual: { canvas: source.visual.canvas, root: scope(source.visual.root) },
    audio: { contributions: source.audio.contributions.map(track => ({ ...track, timelineId: timeline.id, graph: { ...track.graph, nodes: track.graph.nodes.map((node): AudioGraphNode => {
      if (node.kind !== 'source') return structuredClone(node);
      const clip = node.clip, start = compareExactTemporalValues(clip.target.start, localStart) > 0 ? clip.target.start : localStart;
      const end = compareExactTemporalValues(clip.target.end, localEnd) < 0 ? clip.target.end : localEnd;
      if (compareExactTemporalValues(start, end) >= 0) return { kind: 'silence', id: node.id };
      const level = clip.levelOrigin ?? clip.target, firstSample = samples(start), lastSample = samples(end);
      const envelope = clip.gainEnvelope && [{ sample: firstSample, gain: audioEnvelopeGainAt(clip.gainEnvelope, firstSample) }, ...clip.gainEnvelope.filter(point => point.sample > firstSample && point.sample < lastSample), { sample: lastSample, gain: audioEnvelopeGainAt(clip.gainEnvelope, lastSample) }].map(point => ({ ...point, sample: sampleShift(point.sample) }));
      return { ...node, clip: { ...structuredClone(clip), target: { start: mapTime(start), end: mapTime(end) },
        levelOrigin: { start: mapTime(level.start), end: mapTime(level.end) },
        fadeIn: divideTime(clip.fadeIn), fadeOut: divideTime(clip.fadeOut),
        sampling: retimeTemporalMap(sliceTemporalMap(clip.sampling, subtractExactTemporalValues(start, clip.target.start), subtractExactTemporalValues(end, clip.target.start), `compound-audio-${firstSample}-${lastSample}`), divideTime(subtractExactTemporalValues(end, start)), `compound-audio-retimed-${firstSample}-${lastSample}`),
        ...(envelope ? { gainEnvelope: [...new Map(envelope.map(point => [point.sample, point])).values()] } : {}),
        ...(clip.audibility ? { audibility: clip.audibility.flatMap(region => {
          const startSample = Math.max(region.startSample, firstSample), endSampleExclusive = Math.min(region.endSampleExclusive, lastSample);
          return sampleShift(startSample) < sampleShift(endSampleExclusive) ? [{ startSample: sampleShift(startSample), endSampleExclusive: sampleShift(endSampleExclusive) }] : [];
        }) } : {}),
      } };
    }) } })) },
  }, timeline);
  assertCompositionIdentity(placed); return placed;
}
