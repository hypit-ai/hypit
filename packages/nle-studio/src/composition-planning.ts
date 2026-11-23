import { randomUUID } from "node:crypto";
import {
  applyNleTransaction, createCompositionMaterialization, indexNleComposition, nleCompositionDuration, nleItemEnd,
  type NleCommand, type NleComposition, type NleCompositionItem, type NleProject, type NleTrack,
} from "@hypit/nle";
import { addExactTemporalValues, compareExactTemporalValues, exactTemporalZero, subtractExactTemporalValues } from "@hypit/temporal/algebra";
import { resolveCompoundSelection } from "./compound-selection.js";

export function projectCompositionTabs(project: NleProject, active: string) {
  const parents = new Map<string, Set<string>>();
  for (const composition of project.compositions) for (const track of composition.tracks) for (const item of track.items) {
    if (item.kind !== "present" || item.source !== "composition") continue;
    const sources = parents.get(item.composition) ?? new Set<string>();
    sources.add(composition.id);
    parents.set(item.composition, sources);
  }
  // Inserting an ancestor into the active Composition would close a reference cycle.
  const blocked = new Set<string>();
  const visit = (id: string) => {
    if (blocked.has(id)) return;
    blocked.add(id);
    for (const parent of parents.get(id) ?? []) visit(parent);
  };
  visit(active);
  return project.compositions.map(({ id, name, canvas, tracks }) => ({
    id, name, canvas, referenced: parents.has(id),
    canInsert: !blocked.has(id) && tracks.some(track => track.enabled && track.items.some(item =>
      item.kind === "present" && item.enabled && (item.picture !== undefined || item.audio !== undefined))),
  }));
}

function copyDefinition(source: NleComposition, id: string, definitions?: ReadonlyMap<string, string>): NleComposition {
  const ids = new Map(source.tracks.flatMap(track => track.items.map(item => [item.id, `item-${randomUUID()}`] as const)));
  return {
    ...structuredClone(source), id,
    tracks: source.tracks.map(track => ({
      ...structuredClone(track), id: `track-${randomUUID()}`, items: track.items.map(item => ({
        ...structuredClone(item), id: ids.get(item.id)!,
        ...(definitions !== undefined && item.kind === "present" && item.source === "composition"
          ? { composition: definitions.get(item.composition)! } : {}),
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
    groups: source.groups.map(group => ({
      id: `group-${randomUUID()}`, items: group.items.map(item => ids.get(item)!),
    })),
  };
}

function trackForReplacement(parent: NleComposition, source: NleTrack, target: Pick<NleTrack, "name" | "role">,
  first: number, count: number, start: NleCompositionItem["start"], duration: NleCompositionItem["duration"]) {
  if (source.role === target.role) return { track: source.id, commands: [] as readonly NleCommand[] };
  const end = addExactTemporalValues(start, duration);
  const overlaps = (items: NleTrack["items"]) => items.some(item =>
    compareExactTemporalValues(item.start, end) < 0 && compareExactTemporalValues(start, nleItemEnd(item)) < 0);
  const above = !overlaps(source.items.slice(first + count));
  if (!above && overlaps(source.items.slice(0, first))) {
    throw new Error("NLE Studio needs a replacement Track that preserves the order of overlapping Items.");
  }
  const before = above ? parent.tracks[parent.tracks.indexOf(source) + 1]?.id : source.id;
  const track: NleTrack = {
    id: `track-${randomUUID()}`, name: target.name, kind: source.kind, role: target.role, enabled: true, items: [],
  };
  return { track: track.id, commands: [{
    kind: "track.add", composition: parent.id, track, ...(before === undefined ? {} : { before }),
  }] satisfies readonly NleCommand[] };
}

export function planCompound(project: NleProject, parent: NleComposition, ids: readonly string[], name: string) {
  const selection = resolveCompoundSelection(parent, ids);
  if ("error" in selection) throw new Error(selection.error);
  const { track, first, count, selected } = selection;
  const items = track.items.slice(first, first + count);
  const transitions = parent.transitions.filter(relation => selected.has(relation.outgoing));
  const mattes = parent.mattes.filter(relation => selected.has(relation.content));
  const groups = parent.groups.filter(group => group.items.some(item => selected.has(item)));
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
    groups: structuredClone(groups),
  };
  const placement = trackForReplacement(parent, track, { name, role: track.kind }, first, items.length,
    start, nleCompositionDuration(child));
  const commands: NleCommand[] = [
    ...placement.commands,
    ...transitions.map(relation => ({ kind: "transition.remove" as const, id: relation.id })),
    ...mattes.map(relation => ({ kind: "matte.remove" as const, id: relation.id })),
    { kind: "item.remove", ids: [...selected] },
    { kind: "composition.add", composition: child },
  ];
  const prepared = applyNleTransaction(project, { commands });
  const item = `compound-${randomUUID()}`;
  const materialized = createCompositionMaterialization(prepared, {
    id: item, track: placement.track, composition: child.id, at: start,
  });
  const after = placement.track === track.id ? track.items[first + items.length] : undefined;
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

export function planCopyComposition(project: NleProject, id: string) {
  const sources = new Map(project.compositions.map(composition => [composition.id, composition] as const));
  if (!sources.has(id)) throw new Error(`Unknown NLE Composition ${id}.`);
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
  collect(id);
  const composition = ids.get(id)!;
  const names = new Set(project.compositions.map(entry => entry.name));
  const commands: NleCommand[] = [...ids].map(([source, copy]) => {
    const definition = copyDefinition(sources.get(source)!, copy, ids);
    const base = `${definition.name} · 副本`;
    let name = base;
    for (let number = 2; names.has(name); number++) name = `${base} ${number}`;
    names.add(name);
    return { kind: "composition.add", composition: { ...definition, name } };
  });
  return { commands, composition };
}

export function planUniqueComposition(project: NleProject, parent: NleComposition, id: string) {
  const { item } = nestedItem(parent, id);
  const { commands, composition } = planCopyComposition(project, item.composition);
  return { commands: [...commands, { kind: "item.replace" as const, item: { ...structuredClone(item), composition } }],
    composition, item: item.id };
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
    || !identityPlacement(item, parent, source)) {
    throw new Error("NLE Studio explode requires one matching child Track and an unmodified, full-duration Composition occurrence.");
  }
  const index = indexNleComposition(parent);
  if (index.transitionParticipants(id).length > 0 || index.matteParticipants(id).length > 0) {
    throw new Error(`NLE Studio cannot explode Composition Item ${id} while it participates in a Transition or Matte.`);
  }
  const copy = copyDefinition(source, source.id);
  const items = copy.tracks[0]!.items.map(member => ({
    ...member, start: addExactTemporalValues(member.start, item.start),
  }));
  const group = parent.groups.find(group => group.items.includes(item.id));
  const placement = trackForReplacement(parent, track, childTrack, track.items.indexOf(item), 1, item.start, item.duration);
  const commands: NleCommand[] = [
    ...placement.commands,
    ...items.map(member => ({ kind: "item.add" as const, track: placement.track, item: member,
      ...(placement.track === track.id ? { before: item.id } : {}) })),
  ];
  if (group !== undefined) {
    commands.push({ kind: "group.replace", composition: parent.id, group: {
      ...group, items: group.items.flatMap(member => member === item.id ? items.map(value => value.id) : [member]),
    } });
  } else {
    for (const childGroup of copy.groups) commands.push({ kind: "group.add", composition: parent.id, group: childGroup });
  }
  commands.push(
    { kind: "item.remove", ids: [item.id] },
    ...copy.transitions.map(transition => ({ kind: "transition.add" as const, composition: parent.id, transition })),
    ...copy.mattes.map(matte => ({ kind: "matte.add" as const, composition: parent.id, matte })),
  );
  return { commands, item: items[0]!.id, count: items.length };
}
