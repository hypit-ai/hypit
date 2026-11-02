import { assertVisualScopeMotion, type VisualScopeMotion, type VisualScopeMotionChannel, type VisualScopeMotionProperty } from '@hypit/composition';
import type { FrameSpan } from '@hypit/timeline';
import { declarationField, type AuthorDeclarationChild } from '@hypit/hypit/author';

export type CompoundKeyframe = { readonly property: VisualScopeMotionProperty; readonly at: string; readonly value: number; readonly easing?: NonNullable<VisualScopeMotionChannel['keyframes'][number]['easing']> };
const properties = { x: 'x', y: 'y', 'scale-x': 'scaleX', 'scale-y': 'scaleY', rotate: 'rotation', opacity: 'opacity' } as const;
export function compoundKeyframes(node: AuthorDeclarationChild): readonly CompoundKeyframe[] | undefined {
  const keys = node.children.filter(child => child.name === 'Keyframe');
  if (!keys.length) return undefined;
  return keys.map(key => {
    const text = (name: string) => { const value = declarationField(key, name); if (value?.kind !== 'literal') throw new Error(`Compound Keyframe.${name} must be literal.`); return value.value; };
    const property = properties[text('property') as keyof typeof properties];
    if (!property) throw new Error('Compound Keyframe.property is invalid.');
    return { property, at: text('at'), value: Number(text('value')), ...(declarationField(key, 'easing') ? { easing: text('easing') as NonNullable<CompoundKeyframe['easing']> } : {}) };
  });
}
export function resolveCompoundMotion(keys: readonly CompoundKeyframe[], clock: FrameSpan): VisualScopeMotion {
  const duration = clock.endFrameExclusive - clock.startFrame;
  const position = (at: string) => {
    if (at === 'start') return 0;
    if (at === 'end') return duration;
    const progress = /^(\d+(?:\.\d+)?)%$/.exec(at), start = /^(?:start\+)?(\d+)f$/.exec(at), end = /^end-(\d+)f$/.exec(at);
    if (progress) return Math.round(Number(progress[1]) / 100 * duration);
    if (start) return Number(start[1]);
    if (end) return duration - Number(end[1]);
    throw new Error('Compound Keyframe.at must be a local frame, boundary or percentage.');
  };
  const channels = [...new Set(keys.map(key => key.property))].map(property => ({ property, keyframes: keys.filter(key => key.property === property).map(({ at, value, easing }) => ({ frame: position(at), value, ...(easing ? { easing } : {}) })) }));
  const motion = { clock, channels }; assertVisualScopeMotion(motion); return motion;
}
