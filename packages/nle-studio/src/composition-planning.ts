import { randomUUID } from "node:crypto";
import {
  applyNleTransaction, createCompositionMaterialization, indexNleComposition, nleCompositionDuration, nleItemEnd,
  type NleCommand, type NleComposition, type NleCompositionItem, type NleItem, type NlePresentItem, type NleProject, type NleTrack,
} from "@hypit/nle";
import {
  addExactTemporalValues, compareExactTemporalValues, evaluateTemporalMap, exactTemporalRational,
  exactTemporalZero, sealLocalTemporalDomain, subtractExactTemporalValues, type ExactTemporalValue,
} from "@hypit/temporal/algebra";

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
    canInsert: !blocked.has(id) && tracks.some(track => track.items.some(item =>
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

const compare = compareExactTemporalValues;
const label = (item: NleItem) => item.name ?? item.id;

function assertWritable(track: NleTrack, locks: ReadonlySet<string>) {
  if (locks.has(track.id)) throw new Error(`轨道「${track.name}」已锁定`);
}

type ReplacementSlot =
  | { readonly kind: "item"; readonly track: string; readonly before: string | undefined }
  | { readonly kind: "tracks"; readonly beforeTrack: string | undefined };

function replacementSlot(parent: NleComposition, replaced: ReadonlySet<string>, preferredTrack: NleTrack, reuse: boolean): ReplacementSlot {
  const entries = parent.tracks.flatMap(track => track.items.map(item => ({ track, item })));
  const selected = entries.flatMap((entry, order) => replaced.has(entry.item.id) ? [{ ...entry, order }] : []);
  const matteSources = new Set(parent.mattes.map(relation => relation.matte));
  let minimum = 0, maximum = entries.length;
  let lower: NleItem | undefined, upper: NleItem | undefined;
  // Each overlapping stationary contribution constrains the replacement to the original side of that contribution.
  // Audio Presents mix additively; only the position of an Audio Adjust can change their processing.
  for (const { item, track, order } of selected) {
    if (!item.enabled || item.kind !== "present") continue;
    const picture = track.pictureEnabled && item.picture !== undefined && !matteSources.has(item.id);
    const end = nleItemEnd(item);
    for (const [index, other] of entries.entries()) {
      if (replaced.has(other.item.id) || !other.item.enabled
        || compare(item.start, nleItemEnd(other.item)) >= 0 || compare(other.item.start, end) >= 0) continue;
      const sharesPicture = picture && other.track.pictureEnabled && (other.item.kind === "adjust"
        || (other.item.picture !== undefined && !matteSources.has(other.item.id)));
      const crossesAudioAdjust = track.audioEnabled && item.audio !== undefined && other.track.audioEnabled
        && other.track.kind === "audio" && other.item.kind === "adjust";
      if (!sharesPicture && !crossesAudioAdjust) continue;
      if (index < order && index + 1 > minimum) {
        minimum = index + 1;
        lower = other.item;
      }
      if (index > order && index < maximum) {
        maximum = index;
        upper = other.item;
      }
    }
  }
  const allowed = (position: number) => minimum <= position && position <= maximum;
  const anchor = selected.find(entry => entry.track.id === preferredTrack.id)!.order;
  const closest = <T extends { readonly position: number }>(choices: readonly T[]) =>
    choices.filter(choice => allowed(choice.position)).reduce<T | undefined>((best, choice) =>
      best === undefined || Math.abs(choice.position - anchor) < Math.abs(best.position - anchor) ? choice : best, undefined);
  let offset = 0;
  const gaps: { position: number; before?: string }[] = [];
  for (const track of parent.tracks) {
    gaps.push({ position: offset, before: track.id });
    if (reuse && track.id === preferredTrack.id) {
      const slots = Array.from({ length: track.items.length + 1 }, (_, index) => ({ position: offset + index, index }));
      const slot = closest(slots);
      if (slot !== undefined) {
        return { kind: "item", track: track.id, before: track.items.slice(slot.index).find(item => !replaced.has(item.id))?.id };
      }
    }
    offset += track.items.length;
  }
  gaps.push({ position: offset });
  const gap = closest(gaps);
  if (gap !== undefined) return { kind: "tracks", beforeTrack: gap.before };
  const names = [...new Set([lower, upper].filter(item => item !== undefined).map(label))];
  throw new Error(`无法在保留画面层级和声音处理顺序的情况下放置片段${names.length === 0 ? "" : `，涉及「${names.join("」「")}」`}`);
}

function addTrackBlock(parent: NleComposition, tracks: readonly NleTrack[], before: string | undefined): NleCommand[] {
  return tracks.map(track => ({ kind: "track.add", composition: parent.id, track, ...(before === undefined ? {} : { before }) }));
}

export function planCompound(project: NleProject, parent: NleComposition, ids: readonly string[], name: string, locks: ReadonlySet<string>) {
  const selected = new Set(ids);
  const tracks = parent.tracks.map(track => ({ ...track, items: track.items.filter(item => selected.has(item.id)) }))
    .filter(track => track.items.length > 0);
  const items = tracks.flatMap(track => track.items);
  if (items.length === 0 || items.length !== selected.size) throw new Error("请选择要收进复合片段的片段");
  for (const track of tracks) assertWritable(track, locks);
  const adjust = items.find(item => item.kind === "adjust");
  if (adjust !== undefined) throw new Error(`调节「${label(adjust)}」的作用范围需要保留在原时间线`);
  const active = items.filter((item): item is NlePresentItem => item.kind === "present" && item.enabled);
  if (active.length === 0) throw new Error("选区需要至少一个启用的片段");
  const index = indexNleComposition(parent);
  const requireAll = (members: readonly string[], kind: string) => {
    if (!members.some(id => selected.has(id))) return;
    const missing = members.find(id => !selected.has(id));
    if (missing !== undefined) throw new Error(`请同时选择${kind}片段「${label(index.item(missing)!.item)}」`);
  };
  for (const relation of parent.transitions) requireAll([relation.outgoing, relation.incoming], "转场关联的");
  for (const relation of parent.mattes) requireAll([relation.content, relation.matte], "遮罩关联的");
  for (const group of parent.groups) requireAll(group.items, "联动组里的");
  const transitions = parent.transitions.filter(relation => selected.has(relation.outgoing));
  const mattes = parent.mattes.filter(relation => selected.has(relation.content));
  const groups = parent.groups.filter(group => group.items.some(item => selected.has(item)));
  const start = items.reduce((earliest, item) =>
    compareExactTemporalValues(item.start, earliest) < 0 ? item.start : earliest, items[0]!.start);
  const child: NleComposition = {
    id: `composition-${randomUUID()}`, name, canvas: structuredClone(parent.canvas),
    tracks: tracks.map(track => ({
      ...structuredClone(track), id: `track-${randomUUID()}`, items: track.items.map(item => ({
        ...structuredClone(item), start: subtractExactTemporalValues(item.start, start),
      })),
    })),
    transitions: structuredClone(transitions),
    mattes: structuredClone(mattes),
    groups: structuredClone(groups),
  };
  const kind = active.some(item => item.picture !== undefined) ? "picture" : "audio";
  const preferred = tracks.find(track => track.kind === kind) ?? tracks[0]!;
  const reuse = tracks.length === 1 && preferred.role === kind
    && (kind === "audio" || preferred.pictureEnabled)
    && (preferred.audioEnabled || active.every(item => item.audio === undefined));
  const slot = replacementSlot(parent, selected, preferred, reuse);
  const outerTrack: NleTrack = { id: `track-${randomUUID()}`, name, kind, role: kind, pictureEnabled: kind === "picture", audioEnabled: true, items: [] };
  const placement = slot.kind === "item" ? [] : addTrackBlock(parent, [outerTrack], slot.beforeTrack);
  const commands: NleCommand[] = [
    ...placement,
    ...transitions.map(relation => ({ kind: "transition.remove" as const, id: relation.id })),
    ...mattes.map(relation => ({ kind: "matte.remove" as const, id: relation.id })),
    { kind: "item.remove", ids: [...selected] },
    { kind: "composition.add", composition: child },
  ];
  const prepared = placement.length === 0 ? project : applyNleTransaction(project, { commands: placement });
  const item = `compound-${randomUUID()}`;
  const materialized = createCompositionMaterialization(prepared, {
    id: item, track: slot.kind === "item" ? slot.track : outerTrack.id, composition: child, at: start,
  });
  const before = slot.kind === "item" ? slot.before : undefined;
  for (const command of materialized.commands) {
    commands.push(command.kind === "item.add"
      ? { ...command, item: { ...command.item, name }, ...(before === undefined ? {} : { before }) }
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

export function planUniqueComposition(project: NleProject, parent: NleComposition, id: string, locks: ReadonlySet<string>) {
  const { item, track } = nestedItem(parent, id);
  assertWritable(track, locks);
  const { commands, composition } = planCopyComposition(project, item.composition);
  return { commands: [...commands, { kind: "item.replace" as const, item: { ...structuredClone(item), composition } }],
    composition, item: item.id };
}

export function compositionEntry(project: NleProject, parent: NleComposition, id: string, at: ExactTemporalValue) {
  const { item } = nestedItem(parent, id);
  const source = project.compositions.find(composition => composition.id === item.composition)!;
  const duration = nleCompositionDuration(source);
  const zero = exactTemporalZero();
  if (compare(duration, zero) <= 0) return { composition: source.id, frame: 0 };
  const first = item.sourceTime.pieces[0]?.target.start ?? zero;
  const offset = subtractExactTemporalValues(at, item.start);
  const local = compare(offset, zero) >= 0 && compare(offset, item.duration) < 0 ? offset : first;
  const map = { stages: [{
    target: sealLocalTemporalDomain({ id: item.id, duration: item.duration }),
    source: sealLocalTemporalDomain({ id: source.id, duration }),
    pieces: item.sourceTime.pieces,
  }] };
  const sample = evaluateTemporalMap(map, local, "after") ?? evaluateTemporalMap(map, first, "after");
  if (sample === undefined) return { composition: source.id, frame: 0 };
  const position = exactTemporalRational(sample.position);
  const frames = position.numerator * BigInt(project.editRate.numerator);
  const unit = position.denominator * BigInt(project.editRate.denominator);
  const frame = frames / unit - (sample.sourceSide === "before" && frames % unit === 0n ? 1n : 0n);
  return { composition: source.id, frame: Math.max(0, Number(frame)) };
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
  const { crop, layout } = item.picture;
  return !Object.values(crop ?? {}).some(inset => (inset ?? 0) > 0)
    && !("ref" in layout) && layout.x === 0 && layout.y === 0
    && layout.width === parent.canvas.width && layout.height === parent.canvas.height
    && layout.width === source.canvas.width && layout.height === source.canvas.height;
}

export function planExplodeComposition(project: NleProject, parent: NleComposition, id: string, locks: ReadonlySet<string>) {
  const located = nestedItem(parent, id);
  const { item, track } = located;
  assertWritable(track, locks);
  const source = project.compositions.find(composition => composition.id === item.composition)!;
  if (!item.enabled) throw new Error("请先启用复合片段");
  const childItems = source.tracks.flatMap(childTrack => childTrack.items);
  if (childItems.length === 0) throw new Error("内部时间线没有片段");
  const adjust = childItems.find(member => member.kind === "adjust");
  if (adjust !== undefined) throw new Error(`内部调节「${label(adjust)}」的作用范围需要保留在复合片段内`);
  const audible = source.tracks.some(childTrack => childTrack.audioEnabled && childTrack.items.some(
    member => member.enabled && member.kind === "present" && member.audio !== undefined));
  if (track.audioEnabled && audible && item.audio === undefined) {
    throw new Error("拆解会改变复合片段当前使用的画面或声音");
  }
  if (item.audio?.processes?.some(process => process.enabled) || item.picture?.processes?.some(process => process.enabled)) {
    throw new Error("请先停用复合片段外层的效果");
  }
  if (!identityPlacement(item, parent, source)) throw new Error("拆解需要完整源画面、全长、原速和原画布布局");
  const index = indexNleComposition(parent);
  if (index.transitionParticipants(id).length > 0) throw new Error("请先移除复合片段外层的转场");
  if (index.matteParticipants(id).length > 0) throw new Error("请先移除复合片段外层的遮罩关系");
  const copy = copyDefinition(source, source.id);
  const tracks = copy.tracks.filter(childTrack => childTrack.items.length > 0).map(childTrack => ({
    ...childTrack,
    pictureEnabled: track.pictureEnabled && childTrack.pictureEnabled,
    audioEnabled: track.audioEnabled && item.audio !== undefined && childTrack.audioEnabled,
    items: childTrack.items.map(member => ({ ...member, start: addExactTemporalValues(member.start, item.start) })),
  }));
  const items = tracks.flatMap(childTrack => childTrack.items);
  const group = parent.groups.find(group => group.items.includes(item.id));
  if (group !== undefined) for (const member of group.items) assertWritable(index.item(member)!.track, locks);
  const [first] = tracks;
  const reuse = tracks.length === 1 && first !== undefined && first.kind === track.kind && first.role === track.role
    && first.pictureEnabled === track.pictureEnabled && first.audioEnabled === track.audioEnabled;
  const slot = replacementSlot(parent, new Set([item.id]), track, reuse);
  const commands: NleCommand[] = slot.kind === "item"
    ? items.map(member => ({ kind: "item.add", track: slot.track, item: member, ...(slot.before === undefined ? {} : { before: slot.before }) }))
    : addTrackBlock(parent, tracks, slot.beforeTrack);
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
