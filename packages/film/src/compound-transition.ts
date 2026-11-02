import { placeComposition } from '@hypit/composition';
import type { VisualScope, VisualScopeMember } from '@hypit/composition';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { resolveCompoundMotion } from './compound-motion.js';
import type { FilmTrackSet, FilmVisualPlanMember } from './types.js';

type Compound = Extract<FilmVisualPlanMember, { kind: 'compound' }>;
type Source = Extract<FilmTrackSet['tracks'][number], { kind: 'compound' }>;
type Transition = Extract<FilmVisualPlanMember, { kind: 'transition' }>;
export type CompoundTransition = { transition: Transition; span: FrameSpan; outgoing: Compound; incoming: Compound };

export function compoundTransitions(members: readonly FilmVisualPlanMember[], tracks: FilmTrackSet): CompoundTransition[] {
  const result: CompoundTransition[] = [];
  for (const transition of members) {
    if (transition.kind !== 'transition') continue;
    const outgoing = members.find(member => member.id === transition.outgoing), incoming = members.find(member => member.id === transition.incoming);
    if (outgoing?.kind !== 'compound' || incoming?.kind !== 'compound' || outgoing === incoming) throw new Error('Film Transition requires two sibling Compound occurrences.');
    const left = tracks.tracks[outgoing.slot], right = tracks.tracks[incoming.slot];
    if (left?.kind !== 'compound' || right?.kind !== 'compound' || left.span.endFrameExclusive !== right.span.startFrame) throw new Error('Film Transition requires adjacent Compound intervals.');
    const startFrame = right.span.startFrame - Math.floor(transition.durationFrames / 2), endFrameExclusive = startFrame + transition.durationFrames;
    if (startFrame < left.span.startFrame || endFrameExclusive > right.span.endFrameExclusive) throw new Error('Film Transition exceeds its adjacent Compound intervals.');
    for (const source of [left, right]) {
      const start = source.sourceStartFrame + startFrame - source.span.startFrame;
      if (start < 0 || start + transition.durationFrames > source.composition.timeline.frameCount) throw new Error('Film Transition requires available Compound source frames on both sides of the cut.');
    }
    for (const other of result) {
      if ([other.outgoing.id, other.incoming.id].some(id => id === outgoing.id || id === incoming.id) && startFrame < other.span.endFrameExclusive && other.span.startFrame < endFrameExclusive) throw new Error('Film Transitions on one Compound cannot overlap.');
    }
    result.push({ transition, outgoing, incoming, span: { startFrame, endFrameExclusive } });
  }
  return result;
}

export function compoundPicture(member: Compound, source: Source, timeline: Timeline, span: FrameSpan, id = member.id): VisualScopeMember {
  const placed = placeComposition(source.composition, timeline, span, source.sourceStartFrame + span.startFrame - source.span.startFrame);
  let picture: VisualScopeMember = { kind: 'stack', id: member.effects?.length ? `${id}:picture` : id, scope: placed.visual.root,
    ...(member.keyframes ? { motion: resolveCompoundMotion(member.keyframes, source.span) } : {}),
    ...(member.crop ? { crop: { ...member.crop } } : {}), ...(member.transform ? { transform: { ...member.transform } } : {}),
    background: { color: placed.visual.canvas.clearColor, span },
  };
  for (const [index, effect] of (member.effects ?? []).entries()) picture = { kind: 'process', id: index === member.effects!.length - 1 ? id : `${id}:effect:${index}`, timing: span, clock: source.span, effect, inputs: [{ name: 'content', scope: { members: [picture] } }] };
  return picture;
}

export function compoundVisibleRanges(span: FrameSpan, transitions: readonly CompoundTransition[], id: string): FrameSpan[] {
  let ranges = [span];
  for (const transition of transitions.filter(item => item.outgoing.id === id || item.incoming.id === id)) {
    ranges = ranges.flatMap(range => {
      const startFrame = Math.max(range.startFrame, transition.span.startFrame), endFrameExclusive = Math.min(range.endFrameExclusive, transition.span.endFrameExclusive);
      if (startFrame >= endFrameExclusive) return [range];
      return [...(range.startFrame < startFrame ? [{ startFrame: range.startFrame, endFrameExclusive: startFrame }] : []), ...(endFrameExclusive < range.endFrameExclusive ? [{ startFrame: endFrameExclusive, endFrameExclusive: range.endFrameExclusive }] : [])];
    });
  }
  return ranges;
}

export function compoundTransitionPicture(value: CompoundTransition, tracks: FilmTrackSet, timeline: Timeline): VisualScopeMember {
  const input = (member: Compound): VisualScope => ({ members: [compoundPicture(member, tracks.tracks[member.slot] as Source, timeline, value.span)] });
  return { kind: 'process', id: value.transition.id, timing: value.span, clock: value.span,
    effect: structuredClone(value.transition.effect), inputs: [{ name: 'outgoing', scope: input(value.outgoing) }, { name: 'incoming', scope: input(value.incoming) }],
  };
}
