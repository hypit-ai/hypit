import { randomUUID } from "node:crypto";
import {
  applyNleTransaction, createCompositionMaterialization, indexNleComposition, nleCompositionDuration,
  type NleCommand, type NleComposition, type NleCompositionItem, type NleProject,
} from "@hypit/nle";
import { addExactTemporalValues, compareExactTemporalValues, exactTemporalZero, subtractExactTemporalValues } from "@hypit/temporal/algebra";

function copyDefinition(source: NleComposition, id: string, definitions: ReadonlyMap<string, string>): NleComposition {
  const ids = new Map(source.tracks.flatMap(track => track.items.map(item => [item.id, `item-${randomUUID()}`] as const)));
  return {
    ...structuredClone(source), id,
    tracks: source.tracks.map(track => ({
      ...structuredClone(track), id: `track-${randomUUID()}`, items: track.items.map(item => ({
        ...structuredClone(item), id: ids.get(item.id)!,
        ...(item.kind === "present" && item.source === "composition"
          ? { composition: definitions.get(item.composition) ?? item.composition } : {}),
      })),
    })),
    transitions: source.transitions.map(relation => ({
      ...structuredClone(relation), id: `transition-${randomUUID()}`,
      outgoing: ids.get(relation.outgoing)!, incoming: ids.get(relation.incoming)!,
    })),
    mattes: source.mattes.map(relation => ({
      ...structuredClone(relation), id: `matte-${randomUUID()}`,
      content: ids.get(relation.content)!, matte: ids.get(relation.matte)!,
    })),
  };
}

export function planCompound(project: NleProject, parent: NleComposition, ids: readonly string[], name: string) {
  const selected = new Set(ids);
  const track = parent.tracks.find(entry => entry.items.some(item => selected.has(item.id)));
  const items = track?.items.filter(item => selected.has(item.id)) ?? [];
  if (track === undefined || !track.enabled || items.length !== selected.size || items.length === 0
    || items.some(item => item.kind !== "present")) {
    throw new Error("NLE Studio compound requires selected Present Items in one enabled Track.");
  }
  const first = track.items.indexOf(items[0]!);
  if (!track.items.slice(first, first + items.length).every(item => selected.has(item.id))) {
    throw new Error("NLE Studio compound requires a contiguous selection in Track Item order.");
  }
  const transitions = parent.transitions.filter(relation => selected.has(relation.outgoing) || selected.has(relation.incoming));
  const mattes = parent.mattes.filter(relation => selected.has(relation.content) || selected.has(relation.matte));
  if (transitions.some(relation => !selected.has(relation.outgoing) || !selected.has(relation.incoming))
    || mattes.some(relation => !selected.has(relation.content) || !selected.has(relation.matte))) {
    throw new Error("NLE Studio compound requires both endpoints of every selected audiovisual relation.");
  }
  const start = items.reduce((earliest, item) =>
    compareExactTemporalValues(item.start, earliest) < 0 ? item.start : earliest, items[0]!.start);
  const child: NleComposition = {
    id: `composition-${randomUUID()}`, name, canvas: structuredClone(parent.canvas),
    tracks: [{
      ...structuredClone(track), id: `track-${randomUUID()}`, items: items.map(item => ({
        ...structuredClone(item), start: subtractExactTemporalValues(item.start, start),
      })),
    }],
    transitions: structuredClone(transitions),
    mattes: structuredClone(mattes),
  };
  const commands: NleCommand[] = [
    ...transitions.map(relation => ({ kind: "transition.remove" as const, id: relation.id })),
    ...mattes.map(relation => ({ kind: "matte.remove" as const, id: relation.id })),
    { kind: "item.remove", ids: [...selected] },
    { kind: "composition.add", composition: child },
  ];
  const prepared = applyNleTransaction(project, { commands });
  const item = `compound-${randomUUID()}`;
  const materialized = createCompositionMaterialization(prepared, {
    id: item, track: track.id, composition: child.id, at: start,
  });
  const after = track.items[first + items.length];
  for (const command of materialized.commands) {
    commands.push(command.kind === "item.add"
      ? { ...command, item: { ...command.item, name }, ...(after === undefined ? {} : { before: after.id }) }
      : command);
  }
  return { commands, item, composition: child.id };
}

function nestedItem(parent: NleComposition, id: string) {
  const located = indexNleComposition(parent).item(id);
  if (located === undefined || located.item.kind !== "present" || located.item.source !== "composition") {
    throw new Error(`NLE Item ${id} is not a Composition Present in ${parent.id}.`);
  }
  return { ...located, item: located.item };
}

export function planUniqueComposition(project: NleProject, parent: NleComposition, id: string) {
  const { item } = nestedItem(parent, id);
  const sources = new Map(project.compositions.map(composition => [composition.id, composition] as const));
  const ids = new Map<string, string>();
  const collect = (source: string) => {
    if (ids.has(source)) return;
    ids.set(source, `composition-${randomUUID()}`);
    for (const track of sources.get(source)!.tracks) {
      for (const member of track.items) {
        if (member.kind === "present" && member.source === "composition") collect(member.composition);
      }
    }
  };
  collect(item.composition);
  const composition = ids.get(item.composition)!;
  const commands: NleCommand[] = [...ids].map(([source, copy]) => {
    const definition = copyDefinition(sources.get(source)!, copy, ids);
    return { kind: "composition.add", composition: source === item.composition
      ? { ...definition, name: `${definition.name} · 副本` } : definition };
  });
  commands.push({ kind: "item.replace", item: { ...structuredClone(item), composition } });
  return { commands, composition, item: item.id };
}

function identityPlacement(item: NleCompositionItem, parent: NleComposition, source: NleComposition): boolean {
  const only = item.sourceTime.pieces[0];
  const zero = exactTemporalZero();
  const compare = compareExactTemporalValues;
  if (item.sourceTime.pieces.length !== 1 || only === undefined || !("rate" in only)
    || only.wrap !== undefined || only.rate.numerator !== only.rate.denominator
    || compare(only.sourceAtStart, zero) !== 0 || compare(only.target.start, zero) !== 0
    || compare(only.target.end, item.duration) !== 0 || compare(item.duration, nleCompositionDuration(source)) !== 0) {
    return false;
  }
  if (item.picture === undefined) return true;
  const { layout } = item.picture;
  return !("ref" in layout) && layout.x === 0 && layout.y === 0
    && layout.width === parent.canvas.width && layout.height === parent.canvas.height
    && layout.width === source.canvas.width && layout.height === source.canvas.height;
}

export function planExplodeComposition(project: NleProject, parent: NleComposition, id: string) {
  const located = nestedItem(parent, id);
  const { item, track } = located;
  const source = project.compositions.find(composition => composition.id === item.composition)!;
  const [childTrack] = source.tracks;
  const hasAudio = childTrack?.items.some(member => member.kind === "present" && member.enabled && member.audio !== undefined);
  if (!item.enabled || source.tracks.length !== 1 || childTrack?.enabled !== true || childTrack.kind !== track.kind
    || childTrack.items.some(member => member.kind !== "present")
    || (item.audio !== undefined) !== hasAudio || (item.audio?.processes?.length ?? 0) !== 0
    || (item.picture?.processes?.length ?? 0) !== 0
    || item.picture?.reconstruction !== undefined || item.audio?.reconstruction !== undefined
    || !identityPlacement(item, parent, source)) {
    throw new Error("NLE Studio explode requires one matching child Track and an unmodified, full-duration Composition occurrence.");
  }
  const index = indexNleComposition(parent);
  if (index.transitionParticipants(id).length > 0 || index.matteParticipants(id).length > 0) {
    throw new Error(`NLE Studio cannot explode Composition Item ${id} while it participates in a Transition or Matte.`);
  }
  const copy = copyDefinition(source, source.id, new Map());
  const items = copy.tracks[0]!.items.map(member => ({
    ...member, start: addExactTemporalValues(member.start, item.start),
  }));
  const commands: NleCommand[] = [
    ...items.map(member => ({ kind: "item.add" as const, track: track.id, item: member, before: item.id })),
    { kind: "item.remove", ids: [item.id] },
    ...copy.transitions.map(transition => ({ kind: "transition.add" as const, composition: parent.id, transition })),
    ...copy.mattes.map(matte => ({ kind: "matte.add" as const, composition: parent.id, matte })),
  ];
  return { commands, item: items[0]!.id, count: items.length };
}
