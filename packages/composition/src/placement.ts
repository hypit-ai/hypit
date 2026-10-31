import { addExactTemporalValues, exactTemporalValueFromFrames } from '@hypit/temporal';
import { assertTimelineIdentity, timelineFrameSampleBoundary } from '@hypit/timeline';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { assertCompositionIdentity, sealComposition } from './track.js';
import type { Composition, VisualContribution, VisualItem, VisualScope } from './track.js';

/** Place a complete local composition on an enclosing clock while preserving local animation and media sampling. */
export function placeComposition(source: Composition, timeline: Timeline, startFrame: number): Composition {
  assertCompositionIdentity(source);
  assertTimelineIdentity(timeline);
  if (source.timeline.frameRate.numerator * timeline.frameRate.denominator
    !== timeline.frameRate.numerator * source.timeline.frameRate.denominator) {
    throw new Error('Composition placement requires matching frame rates.');
  }
  if (!Number.isSafeInteger(startFrame) || startFrame < 0
    || startFrame + source.timeline.frameCount > timeline.frameCount) {
    throw new Error('Composition placement exceeds its enclosing Timeline.');
  }
  const span = (value: FrameSpan): FrameSpan => ({
    startFrame: value.startFrame + startFrame,
    endFrameExclusive: value.endFrameExclusive + startFrame,
  });
  const contribution = (value: VisualContribution): VisualContribution => {
    const common = { ...value, span: span(value.span),
      ...(value.visibility === undefined ? {} : { visibility: value.visibility.map(span) }) };
    return value.kind === 'present'
      ? { ...common, kind: 'present', root: structuredClone(value.root) }
      : { ...common, kind: 'process', effect: structuredClone(value.effect),
        inputs: value.inputs.map(input => ({ name: input.name, contribution: contribution(input.contribution) })) };
  };
  const scope = (value: VisualScope): VisualScope => ({ members: value.members.map(member => {
    if (member.kind === 'stack') return { ...member, scope: scope(member.scope), ...(member.background ? { background: { ...member.background, span: span(member.background.span) } } : {}) };
    if (member.kind === 'process') {
      // Scope processes use the complete local Timeline for their animation clock.
      // Their placement is represented explicitly for the terminal renderer.
      return { ...member, timing: {
        startFrame: (member.timing?.startFrame ?? 0) + startFrame,
        endFrameExclusive: (member.timing?.endFrameExclusive ?? source.timeline.frameCount) + startFrame,
      }, inputs: member.inputs.map(input => ({ name: input.name, scope: scope(input.scope) })) };
    }
    return { ...member, track: { ...member.track, timelineId: timeline.id,
      items: member.track.items.map((item): VisualItem => item.kind === 'adjustment'
        ? { ...item, span: span(item.span), ...(item.visibility === undefined ? {} : { visibility: item.visibility.map(span) }) }
        : contribution(item)) } };
  }) });
  const offset = exactTemporalValueFromFrames(startFrame, timeline);
  const sampleOffset = timelineFrameSampleBoundary(timeline, startFrame, 48_000);
  const placed = sealComposition({
    id: source.id,
    visual: { canvas: source.visual.canvas, root: scope(source.visual.root) },
    audio: { contributions: source.audio.contributions.map(track => ({
      ...track, timelineId: timeline.id,
      graph: { ...track.graph, nodes: track.graph.nodes.map(node => node.kind !== 'source' ? structuredClone(node) : {
        ...node, clip: { ...structuredClone(node.clip),
          target: { start: addExactTemporalValues(node.clip.target.start, offset), end: addExactTemporalValues(node.clip.target.end, offset) },
          ...(node.clip.gainEnvelope === undefined ? {} : { gainEnvelope: node.clip.gainEnvelope.map(point => ({ ...point, sample: point.sample + sampleOffset })) }),
          ...(node.clip.audibility === undefined ? {} : { audibility: node.clip.audibility.map(region => ({ startSample: region.startSample + sampleOffset, endSampleExclusive: region.endSampleExclusive + sampleOffset })) }),
        },
      }) },
    })) },
  }, timeline);
  assertCompositionIdentity(placed);
  return placed;
}
