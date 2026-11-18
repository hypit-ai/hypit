import type { NleCommand, NleItem, NleMatte, NleProcess, NleTrack, NleTransition } from "@hypit/nle";
import { addExactTemporalValues, compareExactTemporalValues, subtractExactTemporalValues } from "@hypit/temporal/algebra";
import type { NleEditGroup, NleViewCommand } from "@hypit/nle/view";
import type { NleStudioSession } from "../protocol.js";
import { editableSelection } from "./selection.js";

export type ItemClipboard = {
  readonly project: string;
  readonly tracks: readonly NleTrack[];
  readonly transitions: readonly NleTransition[];
  readonly mattes: readonly NleMatte[];
  readonly groups?: readonly NleEditGroup[];
};

function renewProcesses<T extends { readonly processes?: readonly NleProcess[] }>(appearance: T): T {
  return appearance.processes === undefined ? appearance : { ...appearance,
    processes: appearance.processes.map(process => ({ ...process, id: `process-${crypto.randomUUID()}` })),
  };
}

export function copyItems(session: NleStudioSession, selection: readonly string[]): ItemClipboard {
  const ids = new Set(editableSelection(session.open.timeline, selection));
  const composition = session.open.project.project.compositions.find(value => value.id === session.open.timeline.composition)!;
  return structuredClone({
    project: session.open.project.project.id,
    tracks: composition.tracks.map(track => ({ ...track, items: track.items.filter(item => ids.has(item.id)) })).filter(track => track.items.length),
    transitions: composition.transitions.filter(value => ids.has(value.outgoing) && ids.has(value.incoming)),
    mattes: composition.mattes.filter(value => ids.has(value.content) && ids.has(value.matte)),
    groups: session.open.timeline.groups.filter(group => group.items.every(id => ids.has(id))),
  });
}

export function pasteItems(session: NleStudioSession, clipboard: ItemClipboard, frame: number): {
  readonly commands: readonly NleCommand[];
  readonly selection: readonly string[];
  readonly viewCommands?: readonly NleViewCommand[];
} {
  if (clipboard.project !== session.open.project.project.id) throw new Error("请在同一项目内粘贴片段。");
  const items = clipboard.tracks.flatMap(track => track.items);
  if (items.length === 0) return { commands: [], selection: [] };
  const first = items.reduce((start, item) => compareExactTemporalValues(item.start, start) < 0 ? item.start : start, items[0]!.start);
  const rate = session.open.timeline.editRate;
  const at = { ticks: String(frame * rate.denominator), timeBase: { numerator: 1, denominator: rate.numerator } };
  const delta = subtractExactTemporalValues(at, first);
  const composition = session.open.project.project.compositions.find(value => value.id === session.open.timeline.composition)!;
  const names = new Map(items.map(item => [item.id, `paste-${crypto.randomUUID()}`] as const));
  const commands: NleCommand[] = [];
  for (const source of clipboard.tracks) {
    const existing = composition.tracks.find(track => track.id === source.id);
    const view = session.open.timeline.tracks.find(track => track.id === source.id);
    const overlaps = source.kind === "picture" && existing?.items.some(other => other.kind === "present" && source.items.some(item => {
      if (item.kind !== "present") return false;
      const start = addExactTemporalValues(item.start, delta);
      return compareExactTemporalValues(start, addExactTemporalValues(other.start, other.duration)) < 0
        && compareExactTemporalValues(other.start, addExactTemporalValues(start, item.duration)) < 0;
    }));
    let track = existing?.kind === source.kind && existing.role === source.role && view?.locked !== true && !overlaps ? existing.id : undefined;
    if (track === undefined) {
      track = `track-${crypto.randomUUID()}`;
      commands.push({ kind: "track.add", composition: composition.id,
        track: { ...source, id: track, enabled: true, items: [] } });
    }
    for (const original of source.items) {
      let value: NleItem = { ...structuredClone(original), id: names.get(original.id)!, start: addExactTemporalValues(original.start, delta) };
      if (value.kind === "present") {
        value = { ...value, ...(value.picture === undefined ? {} : { picture: renewProcesses(value.picture) }),
          ...(value.audio === undefined ? {} : { audio: renewProcesses(value.audio) }) };
      }
      commands.push({ kind: "item.add", track, item: value });
    }
  }
  for (const transition of clipboard.transitions) commands.push({ kind: "transition.add", composition: composition.id,
    transition: { ...transition, id: `transition-${crypto.randomUUID()}`, outgoing: names.get(transition.outgoing)!, incoming: names.get(transition.incoming)! } });
  for (const matte of clipboard.mattes) commands.push({ kind: "matte.add", composition: composition.id,
    matte: { ...matte, id: `matte-${crypto.randomUUID()}`, content: names.get(matte.content)!, matte: names.get(matte.matte)! } });
  return { commands, selection: [...names.values()], viewCommands: (clipboard.groups ?? []).map(group => ({ kind: "group.add", composition: composition.id, group: { ...group, id: `group-${crypto.randomUUID()}`, items: group.items.map(id => names.get(id)!) } })) };
}
