import { addExactTemporalValues, compareExactTemporalValues, exactTemporalValueFromFrames, resolveTemporalBoundary, sliceTemporalMap, subtractExactTemporalValues } from '@hypit/temporal';
import type { ExactTemporalValue } from '@hypit/temporal';
import { assertFrameSpan, assertTimelineIdentity } from '@hypit/timeline';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { assertCompositionIdentity, sealComposition } from './track.js';
import { audioEnvelopeGainAt } from './audio-level-automation.js';
import type { AudioGraphNode, Composition, VisualContribution, VisualElement, VisualItem, VisualScope, VisualScopeMember } from './track.js';

/** Place a selected local interval while retaining the authored animation and fade clocks. */
export function placeComposition(source: Composition, timeline: Timeline, target: FrameSpan, sourceStartFrame: number): Composition {
  assertCompositionIdentity(source); assertTimelineIdentity(timeline); assertFrameSpan(target, timeline.frameCount);
  if (source.timeline.frameRate.numerator * timeline.frameRate.denominator !== timeline.frameRate.numerator * source.timeline.frameRate.denominator) throw new Error('Composition placement requires matching frame rates.');
  const duration = target.endFrameExclusive - target.startFrame;
  if (!Number.isSafeInteger(sourceStartFrame) || sourceStartFrame < 0 || sourceStartFrame + duration > source.timeline.frameCount) throw new Error('Composition placement exceeds its local Timeline.');
  const selected = { startFrame: sourceStartFrame, endFrameExclusive: sourceStartFrame + duration };
  const offset = target.startFrame - sourceStartFrame;
  const shift = (span: FrameSpan): FrameSpan => ({ startFrame: span.startFrame + offset, endFrameExclusive: span.endFrameExclusive + offset });
  const intersect = (span: FrameSpan): FrameSpan | undefined => {
    const startFrame = Math.max(span.startFrame, selected.startFrame), endFrameExclusive = Math.min(span.endFrameExclusive, selected.endFrameExclusive);
    return startFrame < endFrameExclusive ? { startFrame, endFrameExclusive } : undefined;
  };
  const visibility = (spans: readonly FrameSpan[] | undefined) => spans?.flatMap(span => { const value = intersect(span); return value ? [shift(value)] : []; });
  const element = (value: VisualElement, from: number, until: number): VisualElement => {
    if (value.kind === 'program') return { ...value, slots: value.slots.map(slot => ({ ...slot, element: element(slot.element, from, until) })) };
    if (value.kind === 'mask') return { ...value, mask: element(value.mask, from, until), content: element(value.content, from, until) };
    if (value.kind === 'video' || value.kind === 'surface' && value.sampling) return { ...value, sampling: sliceTemporalMap(value.sampling!, exactTemporalValueFromFrames(from, timeline), exactTemporalValueFromFrames(until, timeline), `compound-window-${from}-${until}`) };
    return structuredClone(value);
  };
  const contribution = (value: VisualContribution): VisualContribution | undefined => {
    const range = intersect(value.span); if (!range) return;
    const common = { ...value, span: shift(range), clock: shift(value.clock ?? value.span), ...(value.visibility ? { visibility: visibility(value.visibility)! } : {}) };
    if (value.kind === 'present') return { ...common, kind: 'present', root: element(value.root, range.startFrame - value.span.startFrame, range.endFrameExclusive - value.span.startFrame) };
    return { ...common, kind: 'process', effect: structuredClone(value.effect), inputs: value.inputs.map(input => {
      const placed = input.contribution && contribution(input.contribution);
      return { name: input.name, ...(placed ? { contribution: placed } : {}) };
    }) };
  };
  const scope = (value: VisualScope): VisualScope => ({ members: value.members.flatMap((member): VisualScopeMember[] => {
    if (member.kind === 'stack') {
      const child = scope(member.scope), clear = member.background && intersect(member.background.span);
      if (!child.members.length && !clear) return [];
      return [{ kind: 'stack', id: member.id, scope: child, ...(clear ? { background: { color: member.background!.color, span: shift(clear) } } : {}) }];
    }
    if (member.kind === 'process') {
      const original = member.timing ?? { startFrame: 0, endFrameExclusive: source.timeline.frameCount }, range = intersect(original);
      return range ? [{ ...member, timing: shift(range), clock: shift(member.clock ?? original), inputs: member.inputs.map(input => ({ name: input.name, scope: scope(input.scope) })) }] : [];
    }
    const items = member.track.items.flatMap((item): VisualItem[] => {
      if (item.kind !== 'adjustment') { const placed = contribution(item); return placed ? [placed] : []; }
      const range = intersect(item.span);
      return range ? [{ ...item, span: shift(range), clock: shift(item.clock ?? item.span), ...(item.visibility ? { visibility: visibility(item.visibility)! } : {}) }] : [];
    });
    return items.length ? [{ ...member, track: { ...member.track, timelineId: timeline.id, items } }] : [];
  }) });
  const exactOffset = exactTemporalValueFromFrames(offset, timeline);
  const localStart = exactTemporalValueFromFrames(selected.startFrame, timeline), localEnd = exactTemporalValueFromFrames(selected.endFrameExclusive, timeline);
  const samples = (value: ExactTemporalValue) => resolveTemporalBoundary(value, { frameRate: { numerator: 48_000, denominator: 1 } }, 'nearest');
  const sampleShift = (sample: number) => samples(addExactTemporalValues({ ticks: String(sample), timeBase: { numerator: 1, denominator: 48_000 } }, exactOffset));
  const placed = sealComposition({ id: source.id,
    visual: { canvas: source.visual.canvas, root: scope(source.visual.root) },
    audio: { contributions: source.audio.contributions.map(track => ({ ...track, timelineId: timeline.id, graph: { ...track.graph, nodes: track.graph.nodes.map((node): AudioGraphNode => {
      if (node.kind !== 'source') return structuredClone(node);
      const clip = node.clip, start = compareExactTemporalValues(clip.target.start, localStart) > 0 ? clip.target.start : localStart;
      const end = compareExactTemporalValues(clip.target.end, localEnd) < 0 ? clip.target.end : localEnd;
      if (compareExactTemporalValues(start, end) >= 0) return { kind: 'silence', id: node.id };
      const level = clip.levelOrigin ?? clip.target, firstSample = samples(start), lastSample = samples(end);
      const envelope = clip.gainEnvelope && [{ sample: firstSample, gain: audioEnvelopeGainAt(clip.gainEnvelope, firstSample) }, ...clip.gainEnvelope.filter(point => point.sample > firstSample && point.sample < lastSample), { sample: lastSample, gain: audioEnvelopeGainAt(clip.gainEnvelope, lastSample) }].map(point => ({ ...point, sample: sampleShift(point.sample) }));
      return { ...node, clip: { ...structuredClone(clip), target: { start: addExactTemporalValues(start, exactOffset), end: addExactTemporalValues(end, exactOffset) },
        levelOrigin: { start: addExactTemporalValues(level.start, exactOffset), end: addExactTemporalValues(level.end, exactOffset) },
        sampling: sliceTemporalMap(clip.sampling, subtractExactTemporalValues(start, clip.target.start), subtractExactTemporalValues(end, clip.target.start), `compound-audio-${firstSample}-${lastSample}`),
        ...(envelope ? { gainEnvelope: envelope } : {}),
        ...(clip.audibility ? { audibility: clip.audibility.flatMap(region => {
          const startSample = Math.max(region.startSample, firstSample), endSampleExclusive = Math.min(region.endSampleExclusive, lastSample);
          return startSample < endSampleExclusive ? [{ startSample: sampleShift(startSample), endSampleExclusive: sampleShift(endSampleExclusive) }] : [];
        }) } : {}),
      } };
    }) } })) },
  }, timeline);
  assertCompositionIdentity(placed); return placed;
}
