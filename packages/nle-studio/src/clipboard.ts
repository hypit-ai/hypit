import { randomUUID } from "node:crypto";
import { nleItemEnd, type NleCommand, type NleComposition, type NleItem, type NleMatte, type NleTrack, type NleTransition } from "@hypit/nle";
import { nleViewCompositionState, nleViewTrackLocked, type NleEditGroup, type NleView } from "@hypit/nle/view";
import { addExactTemporalValues, compareExactTemporalValues, subtractExactTemporalValues, type ExactTemporalValue } from "@hypit/temporal/algebra";

export type StudioClipboard = {
  readonly tracks: readonly NleTrack[];
  readonly transitions: readonly NleTransition[];
  readonly mattes: readonly NleMatte[];
  readonly groups: readonly NleEditGroup[];
  readonly origin: ExactTemporalValue;
  readonly count: number;
};

export function captureStudioClipboard(composition: NleComposition, view: NleView, items: readonly string[]): StudioClipboard {
  const ids = new Set(items);
  const tracks = composition.tracks.flatMap(track => {
    const selected = track.items.filter(item => ids.has(item.id));
    return selected.length === 0 ? [] : [{ ...track, items: selected }];
  });
  const selection = tracks.flatMap(track => track.items);
  if (selection.length === 0 || selection.length !== ids.size) {
    throw new Error(`NLE Studio clipboard requires existing Items in Composition ${composition.id}.`);
  }
  const origin = selection.reduce((earliest, item) =>
    compareExactTemporalValues(item.start, earliest) < 0 ? item.start : earliest, selection[0]!.start);
  return structuredClone({
    tracks, origin, count: selection.length,
    transitions: composition.transitions.filter(relation => ids.has(relation.outgoing) && ids.has(relation.incoming)),
    mattes: composition.mattes.filter(relation => ids.has(relation.content) && ids.has(relation.matte)),
    groups: (nleViewCompositionState(view, composition.id)?.groups ?? [])
      .filter(group => group.items.every(item => ids.has(item))),
  });
}

function overlaps(left: NleItem, right: NleItem): boolean {
  return compareExactTemporalValues(left.start, nleItemEnd(right)) < 0
    && compareExactTemporalValues(right.start, nleItemEnd(left)) < 0;
}

export function planStudioPaste(clipboard: StudioClipboard, destination: NleComposition, view: NleView, at: ExactTemporalValue) {
  const delta = subtractExactTemporalValues(at, clipboard.origin);
  const ids = new Map<string, string>();
  const shifted = clipboard.tracks.map(track => ({
    ...track,
    items: track.items.map(item => {
      const id = `item-${randomUUID()}`;
      ids.set(item.id, id);
      return { ...structuredClone(item), id, start: addExactTemporalValues(item.start, delta) };
    }),
  }));
  const original = new Map(destination.tracks.map((track, index) => [track.id, { track, index }] as const));
  const matched = shifted.map(source => original.get(source.id));
  const reusable = shifted.every((source, index) => {
    const current = matched[index];
    if (current === undefined || current.track.kind !== source.kind || current.track.role !== source.role || current.track.enabled !== source.enabled
      || nleViewTrackLocked(view, destination.id, current.track.id)) return false;
    if (index > 0 && (matched[index - 1]?.index ?? Infinity) >= current.index) return false;
    if (source.kind === "audio") return true;
    if (source.items.some(item => item.kind === "adjust") || current.track.items.some(item => item.kind === "adjust")) return false;
    return source.items.every(item => current.track.items.every(other => !overlaps(item, other)));
  });
  const commands: NleCommand[] = [];
  for (const source of shifted) {
    const track = reusable ? source.id : `track-${randomUUID()}`;
    if (!reusable) commands.push({ kind: "track.add", composition: destination.id, track: { ...source, id: track, items: [] } });
    for (const item of source.items) commands.push({ kind: "item.add", track, item });
  }
  for (const transition of clipboard.transitions) {
    commands.push({
      kind: "transition.add", composition: destination.id, transition: {
        ...structuredClone(transition), id: `transition-${randomUUID()}`,
        outgoing: ids.get(transition.outgoing)!, incoming: ids.get(transition.incoming)!,
      },
    });
  }
  for (const matte of clipboard.mattes) {
    commands.push({
      kind: "matte.add", composition: destination.id, matte: {
        ...structuredClone(matte), id: `matte-${randomUUID()}`,
        content: ids.get(matte.content)!, matte: ids.get(matte.matte)!,
      },
    });
  }
  const groups = clipboard.groups.map(group => ({
    id: `group-${randomUUID()}`, name: group.name, items: group.items.map(item => ids.get(item)!),
  }));
  return { commands, items: [...ids.values()], groups };
}
