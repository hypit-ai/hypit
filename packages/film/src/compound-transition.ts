import { exactTemporalValueFromDuration, temporalValueInFrames, exactTemporalValueFromFrames, addExactTemporalValues, scaleExactTemporalValue } from "@hypit/temporal";
import { extendVisualPresent, placeComposition } from '@hypit/composition';
import type { VisualScope, VisualScopeMember } from '@hypit/composition';
import type { FrameSpan, Timeline } from '@hypit/timeline';
import { resolveCompoundMotion } from './compound-motion.js';
import type { FilmTrackSet, FilmVisualPlanMember } from './types.js';

type Compound = Extract<FilmVisualPlanMember, { kind: 'compound' }>;
type Source = Extract<FilmTrackSet['tracks'][number], { kind: 'compound' }>;
type Transition = Extract<FilmVisualPlanMember, { kind: 'transition' }>;
export type CompoundTransition = { transition: Transition; span: FrameSpan; outgoing: Picture; incoming: Picture };

type TrackMember = Extract<FilmVisualPlanMember, { kind: 'track' }>;
type Picture = { id: string; span: FrameSpan } & ({ member: Compound; source: Source; present?: never; track?: never } | { member: TrackMember; source?: never; present: import('@hypit/composition').VisualPresent; track: import('@hypit/composition').VisualTrack });
function pictureAt(path: string, members: readonly FilmVisualPlanMember[], tracks: FilmTrackSet): Picture {
  const [id, clipId, extra] = path.split('/');
  const member = members.find(member => member.id === id);
  if (member?.kind === 'compound' && !clipId) {
    const source = tracks.tracks[member.slot];
    if (source?.kind === 'compound') return { id: path, member, source, span: source.span };
  }
  if (member?.kind === 'track' && clipId && !extra) {
    const track = tracks.tracks[member.slot];
    const present = track?.kind === 'visual' ? track.items.find(item => item.id === clipId) : undefined;
    if (track?.kind === 'visual' && present?.kind === 'present' && !present.visibility) return { id: path, member, track, present, span: present.span };
  }
  throw new Error(`Transition picture is unavailable: ${path}`);
}
export function compoundTransitions(members: readonly FilmVisualPlanMember[], tracks: FilmTrackSet): CompoundTransition[] {
  const result: CompoundTransition[] = [];
  for (const transition of members) {
    if (transition.kind !== 'transition') continue;
    const outgoing = pictureAt(transition.outgoing, members, tracks), incoming = pictureAt(transition.incoming, members, tracks);
    const left = outgoing.span, right = incoming.span;
    if (outgoing.id === incoming.id || left.endFrameExclusive !== right.startFrame) throw new Error('Film Transition requires adjacent picture intervals.');
    const startFrame = right.startFrame - Math.floor(transition.durationFrames / 2), endFrameExclusive = startFrame + transition.durationFrames;
    if (startFrame < left.startFrame || endFrameExclusive > right.endFrameExclusive) throw new Error('Film Transition exceeds its adjacent picture intervals.');
    for (const other of result) {
      if ([other.outgoing.id, other.incoming.id].some(id => id === outgoing.id || id === incoming.id) && startFrame < other.span.endFrameExclusive && other.span.startFrame < endFrameExclusive) throw new Error('Film Transitions on one picture cannot overlap.');
    }
    result.push({ transition, outgoing, incoming, span: { startFrame, endFrameExclusive } });
  }
  return result;
}

export function compoundRate(member: Compound): number { return member.rate ? member.rate.numerator / member.rate.denominator : 1; }
export function compoundSourceTime(member: Compound, source: Source, frameDelta = 0) {
  const timeline = source.composition.timeline;
  const offset = member.sourceOffset ? exactTemporalValueFromDuration(member.sourceOffset, timeline) : exactTemporalValueFromFrames(0, timeline);
  return addExactTemporalValues(addExactTemporalValues(exactTemporalValueFromFrames(source.sourceStartFrame, timeline), offset), scaleExactTemporalValue(exactTemporalValueFromFrames(frameDelta, timeline), member.rate ?? { numerator: 1, denominator: 1 }));
}
export function compoundSourceStart(member: Compound, source: Source): number {
  const position = temporalValueInFrames(compoundSourceTime(member, source), source.composition.timeline);
  return Number(position.numerator) / Number(position.denominator);
}

export function compoundPicture(member: Compound, source: Source, timeline: Timeline, span: FrameSpan, id = member.id): VisualScopeMember {
  const placed = placeComposition(source.composition, timeline, span, compoundSourceStart(member, source) + (span.startFrame - source.span.startFrame) * compoundRate(member), { boundary: "hold", rate: member.rate ?? { numerator: 1, denominator: 1 }, sourceStartTime: compoundSourceTime(member, source, span.startFrame - source.span.startFrame) });
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
  const input = (picture: Picture): VisualScope => ({ members: [picture.source ? compoundPicture(picture.member as Compound, picture.source, timeline, value.span) : { kind: 'track', id: picture.member.id, track: { ...picture.track!, items: [extendVisualPresent(picture.present!, value.span, timeline)] } }] });
  return { kind: 'process', id: value.transition.id, timing: value.span, clock: value.span,
    effect: structuredClone(value.transition.effect), inputs: [{ name: 'outgoing', scope: input(value.outgoing) }, { name: 'incoming', scope: input(value.incoming) }],
  };
}
