import { applyNleTransaction, fitNlePictureContent, nleItemEnd, nleLinearTimeMapping, resolveNlePictureLayout, sliceNleTimeMapping, type NleCommand, type NleComposition, type NleItem, type NleProcess, type NleTimeMapping, type NleTrack } from "@hypit/nle";
import { addExactTemporalValues as add, compareExactTemporalValues as compare, exactTemporalZero, extrapolateTemporalAffineMapPiece, isAffineTemporalMapPiece, scaleExactTemporalValue as scale, subtractExactTemporalValues as subtract, type ExactTemporalValue, type TemporalRate } from "@hypit/temporal/algebra";
import type { NleViewCommand } from "@hypit/nle/view";
import type { NleStudioSession } from "../protocol.js";
import { editableSelection, linkedSelection } from "./selection.js";
import { copyItems, pasteItems } from "./clipboard.js";

export type EditPlan = { readonly commands: readonly NleCommand[]; readonly selection?: readonly string[]; readonly viewCommands?: readonly NleViewCommand[] };
export const identity = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const activeComposition = (session: NleStudioSession) => session.open.project.project.compositions.find(value => value.id === session.open.timeline.composition)!;
export function frameTime(session: NleStudioSession, frame: number): ExactTemporalValue {
  const rate = session.open.timeline.editRate;
  return { ticks: String(Math.round(frame) * rate.denominator), timeBase: { numerator: 1, denominator: rate.numerator } };
}
export const frameOf = (session: NleStudioSession, time: ExactTemporalValue) => Number(time.ticks) * time.timeBase.numerator / time.timeBase.denominator * session.open.timeline.editRate.numerator / session.open.timeline.editRate.denominator;
const maximum = (a: ExactTemporalValue, b: ExactTemporalValue) => compare(a, b) >= 0 ? a : b;
const minimum = (a: ExactTemporalValue, b: ExactTemporalValue) => compare(a, b) <= 0 ? a : b;
const negate = (value: ExactTemporalValue) => scale(value, { numerator: -1, denominator: 1 });
function exactRate(numerator: bigint, denominator: bigint): TemporalRate {
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  let a = numerator < 0n ? -numerator : numerator, b = denominator;
  while (b) { const next = a % b; a = b; b = next; }
  const divisor = a || 1n; numerator /= divisor; denominator /= divisor;
  if (denominator <= 0n || numerator > BigInt(Number.MAX_SAFE_INTEGER) || numerator < -BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("速度比例超出可精确表示的范围。");
  return { numerator: Number(numerator), denominator: Number(denominator) };
}
function rateValue(value: number): TemporalRate {
  const [mantissa, exponent = "0"] = String(value).split("e"), [whole, fraction = ""] = mantissa!.split(".");
  const power = Number(exponent) - fraction.length;
  return exactRate(BigInt(`${whole}${fraction}`) * (power > 0 ? 10n ** BigInt(power) : 1n), power < 0 ? 10n ** BigInt(-power) : 1n);
}

export function removeItems(session: NleStudioSession, selected: readonly string[]): NleCommand[] {
  const composition = activeComposition(session), editable = new Set(editableSelection(session.open.timeline, selected)), ids = new Set(selected.filter(id => editable.has(id)));
  if (!ids.size) return [];
  return [
    ...composition.transitions.filter(value => ids.has(value.outgoing) || ids.has(value.incoming)).map(value => ({ kind: "transition.remove" as const, id: value.id })),
    ...composition.mattes.filter(value => ids.has(value.content) || ids.has(value.matte)).map(value => ({ kind: "matte.remove" as const, id: value.id })),
    { kind: "item.remove", ids: [...ids] },
  ];
}

type Range = { start: ExactTemporalValue; end: ExactTemporalValue };
function mergeRanges(ranges: readonly Range[]): Range[] {
  const result: Range[] = [];
  for (const range of [...ranges].sort((a, b) => compare(a.start, b.start))) {
    const last = result.at(-1);
    if (last && compare(range.start, last.end) <= 0) last.end = maximum(last.end, range.end);
    else result.push({ ...range });
  }
  return result;
}
export function trackGaps(track: NleTrack): Range[] {
  let end = exactTemporalZero(); const result: Range[] = [];
  for (const range of mergeRanges(track.items.map(item => ({ start: item.start, end: nleItemEnd(item) })))) {
    if (compare(range.start, end) > 0) result.push({ start: end, end: range.start });
    end = maximum(end, range.end);
  }
  return result;
}
function closeRanges(session: NleStudioSession, track: NleTrack, ranges: readonly Range[], removed = new Set<string>()): NleCommand[] {
  const scene = session.open.timeline, deltas = new Map<string, ExactTemporalValue>();
  for (const item of track.items.filter(item => !removed.has(item.id))) {
    const delta = negate(ranges.filter(range => compare(range.end, item.start) <= 0).reduce((sum, range) => add(sum, subtract(range.end, range.start)), exactTemporalZero()));
    for (const id of linkedSelection(scene, [item.id])) {
      if (removed.has(id)) continue;
      if (deltas.has(id) && compare(deltas.get(id)!, delta) !== 0) throw new Error("组合跨越了待关闭的间隙，请先取消组合。");
      deltas.set(id, delta);
    }
  }
  const batches = new Map<string, { delta: ExactTemporalValue; ids: string[] }>();
  for (const [id, delta] of deltas) {
    if (compare(delta, exactTemporalZero()) === 0) continue;
    const lane = scene.tracks.find(track => track.items.some(item => item.id === id));
    if (lane?.locked || !lane?.items.find(item => item.id === id)?.affordances.move) throw new Error("受影响的组合包含无法移动的片段，请先解锁轨道或取消组合。");
    const key = JSON.stringify(delta), batch = batches.get(key) ?? { delta, ids: [] };
    batch.ids.push(id); batches.set(key, batch);
  }
  return [...batches.values()].map(batch => ({ kind: "item.move", ids: batch.ids, delta: batch.delta }));
}
export function closeTrackGaps(session: NleStudioSession, trackId: string, atFrame?: number): EditPlan {
  const track = activeComposition(session).tracks.find(track => track.id === trackId)!;
  const at = atFrame === undefined ? undefined : frameTime(session, atFrame);
  const ranges = trackGaps(track).filter(range => !at || compare(at, range.start) >= 0 && compare(at, range.end) < 0);
  return { commands: closeRanges(session, track, ranges) };
}
export function rippleRemove(session: NleStudioSession, selected: readonly string[]): EditPlan {
  const ids = new Set(editableSelection(session.open.timeline, selected)), composition = activeComposition(session);
  const commands: NleCommand[] = removeItems(session, [...ids]);
  const moved = new Map<string, ExactTemporalValue>(), intended = new Map<string, ExactTemporalValue>();
  for (const track of composition.tracks) {
    let ranges = mergeRanges(track.items.filter(item => ids.has(item.id)).map(item => ({ start: item.start, end: nleItemEnd(item) })));
    for (const other of track.items.filter(item => !ids.has(item.id))) ranges = ranges.flatMap(range => compare(nleItemEnd(other), range.start) <= 0 || compare(other.start, range.end) >= 0 ? [range] : [
      ...(compare(range.start, other.start) < 0 ? [{ start: range.start, end: other.start }] : []),
      ...(compare(nleItemEnd(other), range.end) < 0 ? [{ start: nleItemEnd(other), end: range.end }] : []),
    ]);
    if (ranges.length) for (const item of track.items.filter(item => !ids.has(item.id))) {
      const delta = negate(ranges.filter(range => compare(range.end, item.start) <= 0).reduce((sum, range) => add(sum, subtract(range.end, range.start)), exactTemporalZero()));
      for (const member of linkedSelection(session.open.timeline, [item.id])) {
        if (ids.has(member)) continue;
        const previous = intended.get(member);
        if (previous && compare(previous, delta) !== 0) throw new Error("多个轨道上的组合成员需要不同的移动距离，请先取消组合。");
        intended.set(member, delta);
      }
    }
    for (const command of closeRanges(session, track, ranges, ids)) {
      if (command.kind !== "item.move") continue;
      const fresh: string[] = [];
      for (const id of command.ids) {
        const previous = moved.get(id);
        if (previous && compare(previous, command.delta) !== 0) throw new Error("组合成员需要不同的移动距离，请先取消组合。");
        if (!previous) { moved.set(id, command.delta); fresh.push(id); }
      }
      if (fresh.length) commands.push({ ...command, ids: fresh });
    }
  }
  return { commands, selection: [] };
}

export function scaleMapping(mapping: NleTimeMapping, factor: TemporalRate): NleTimeMapping {
  return { pieces: mapping.pieces.map(piece => ({ ...structuredClone(piece), target: { start: scale(piece.target.start, factor), end: scale(piece.target.end, factor) },
    ...(isAffineTemporalMapPiece(piece) ? { rate: exactRate(BigInt(piece.rate.numerator) * BigInt(factor.denominator), BigInt(piece.rate.denominator) * BigInt(factor.numerator)) } : {}),
  })) };
}
function processes(appearance: { readonly processes?: readonly NleProcess[] }, duration: ExactTemporalValue, range: Range, factor: TemporalRate, renew = false) {
  return (appearance.processes ?? []).map(process => ({ ...process, id: renew ? identity("process") : process.id, controlTime: scaleMapping(sliceNleTimeMapping(process.controlTime, duration, range), factor) }));
}
export function uniformSpeed(item: NleItem): number | undefined {
  if (item.kind !== "present" || item.sourceTime.pieces.length !== 1) return undefined;
  const piece = item.sourceTime.pieces[0]!;
  return isAffineTemporalMapPiece(piece) && !piece.wrap && compare(piece.target.start, exactTemporalZero()) === 0 && compare(piece.target.end, item.duration) === 0 ? piece.rate.numerator / piece.rate.denominator : undefined;
}
export function changeSpeed(session: NleStudioSession, selected: readonly string[], speed: number): EditPlan {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("速度必须大于零。");
  const composition = activeComposition(session), ids = editableSelection(session.open.timeline, selected);
  const items = composition.tracks.flatMap(track => track.items).filter(item => ids.includes(item.id));
  const first = items[0], previous = first && uniformSpeed(first);
  if (previous === undefined || previous === 0) throw new Error("请选择具有匀速时间映射的片段。");
  const piece = first!.kind === "present" ? first!.sourceTime.pieces[0]! : undefined, requested = rateValue(speed);
  if (!piece || !isAffineTemporalMapPiece(piece)) throw new Error("请选择匀速片段。");
  const factor = exactRate(BigInt(Math.abs(piece.rate.numerator)) * BigInt(requested.denominator), BigInt(piece.rate.denominator) * BigInt(requested.numerator)), anchor = first!.start;
  const commands: NleCommand[] = items.map(item => {
    if (item.kind !== "present" || uniformSpeed(item) === undefined || uniformSpeed(item) === 0) throw new Error("所选片段包含非匀速时间映射，请单独编辑。");
    const range = { start: exactTemporalZero(), end: item.duration };
    return { kind: "item.replace", item: { ...item, start: add(anchor, scale(subtract(item.start, anchor), factor)), duration: scale(item.duration, factor), sourceTime: scaleMapping(item.sourceTime, factor),
      ...(item.picture ? { picture: { ...item.picture, processes: processes(item.picture, item.duration, range, factor) } } : {}),
      ...(item.audio ? { audio: { ...item.audio, processes: processes(item.audio, item.duration, range, factor) } } : {}),
    } };
  });
  return { commands };
}
export function reverseItems(session: NleStudioSession, selected: readonly string[]): EditPlan {
  const ids = editableSelection(session.open.timeline, selected);
  return { commands: activeComposition(session).tracks.flatMap(track => track.items).filter(item => ids.includes(item.id)).map(item => {
    if (item.kind !== "present") throw new Error("反向播放需要素材或复合片段。");
    const time = { pieces: [...item.sourceTime.pieces].reverse().map(piece => ({ ...structuredClone(piece), target: { start: subtract(item.duration, piece.target.end), end: subtract(item.duration, piece.target.start) },
      ...(isAffineTemporalMapPiece(piece) ? { sourceAtStart: extrapolateTemporalAffineMapPiece(piece, piece.target.end), rate: { numerator: -piece.rate.numerator, denominator: piece.rate.denominator } }
        : { sourceAtStart: piece.sourceAtEnd, sourceControl1: piece.sourceControl2, sourceControl2: piece.sourceControl1, sourceAtEnd: piece.sourceAtStart }),
    })) };
    return { kind: "item.retime" as const, id: item.id, time };
  }) };
}
export function freezeItem(session: NleStudioSession, item: NleItem, frame: number): EditPlan {
  if (item.kind !== "present" || !item.picture) throw new Error("定格需要画面片段。");
  if (item.picture.processes?.length) throw new Error("带有效果的画面定格需要渲染执行器提供帧捕获。请先选择原始素材片段。");
  const local = subtract(frameTime(session, frame), item.start);
  const piece = item.sourceTime.pieces.find(piece => compare(local, piece.target.start) >= 0 && compare(local, piece.target.end) < 0);
  if (!piece || !isAffineTemporalMapPiece(piece)) throw new Error("当前播放位置需要线性时间映射才能定格。");
  const id = identity("freeze"), duration = frameTime(session, Math.round(session.open.timeline.editRate.numerator / session.open.timeline.editRate.denominator * 3));
  const { audio, ...visual } = item;
  const clipboard = { project: session.open.project.project.id, tracks: [{ id: identity("track"), name: "定格", kind: "picture" as const, enabled: true, items: [{ ...visual, id, duration, sourceTime: nleLinearTimeMapping(duration, extrapolateTemporalAffineMapPiece(piece, local), { numerator: 0, denominator: 1 }), picture: { ...item.picture, processes: [] } }] }], transitions: [], mattes: [] };
  return pasteItems(session, clipboard, frame);
}

export function createCompound(session: NleStudioSession, selection: readonly string[], name: string): EditPlan {
  const composition = activeComposition(session), clipboard = copyItems(session, selection), items = clipboard.tracks.flatMap(track => track.items), ids = new Set(items.map(item => item.id));
  if (!items.length) throw new Error("请先选择片段。");
  if (composition.transitions.some(value => ids.has(value.outgoing) !== ids.has(value.incoming)) || composition.mattes.some(value => ids.has(value.content) !== ids.has(value.matte))) throw new Error("请同时选择转场或蒙版关系中的两个片段。");
  const start = items.reduce((value, item) => minimum(value, item.start), items[0]!.start), end = items.reduce((value, item) => maximum(value, nleItemEnd(item)), nleItemEnd(items[0]!));
  const trackNames = new Map(clipboard.tracks.map(track => [track.id, identity("track")] as const));
  const nested: NleComposition = { id: identity("composition"), name, canvas: { ...composition.canvas },
    tracks: clipboard.tracks.map(track => ({ ...track, id: trackNames.get(track.id)!, items: track.items.map(item => ({ ...item, start: subtract(item.start, start) })) })),
    transitions: clipboard.transitions, mattes: clipboard.mattes };
  const picture = items.some(item => item.kind === "present" && item.picture), audio = items.some(item => item.kind === "present" && item.audio);
  if (!picture && !audio) throw new Error("复合片段需要包含画面或音频素材。");
  const id = identity("compound"), track = identity("track");
  const lastSelectedTrack = composition.tracks.findLastIndex(track => track.items.some(item => ids.has(item.id)));
  return { commands: [...removeItems(session, [...ids]), { kind: "composition.add", composition: nested },
    { kind: "track.add", composition: composition.id, track: { id: track, name, kind: picture ? "picture" : "audio", enabled: true, items: [] }, ...(composition.tracks[lastSelectedTrack + 1] ? { before: composition.tracks[lastSelectedTrack + 1]!.id } : {}) },
    { kind: "item.add", track, item: { kind: "present", id, source: "composition", composition: nested.id, name, enabled: true, start, duration: subtract(end, start), sourceTime: nleLinearTimeMapping(subtract(end, start)),
      ...(picture ? { picture: { layout: { x: 0, y: 0, width: composition.canvas.width, height: composition.canvas.height, fit: "fill" } } } : {}), ...(audio ? { audio: {} } : {}) } },
  ], selection: [id], viewCommands: [
    ...(session.open.view.view.compositions.find(value => value.composition === composition.id)?.tracks ?? []).filter(state => trackNames.has(state.track) && state.heightPx !== undefined).map(state => ({ kind: "track-height.set" as const, composition: nested.id, track: trackNames.get(state.track)!, heightPx: state.heightPx! })),
    ...(clipboard.groups ?? []).map(group => ({ kind: "group.add" as const, composition: nested.id, group: { ...group, id: identity("group") } })),
  ] };
}
export function duplicateCompound(session: NleStudioSession, item: NleItem, frame: number): EditPlan {
  if (item.kind !== "present" || item.source !== "composition") throw new Error("请选择复合片段。");
  const project = session.open.project.project, compositions = new Map<string, string>(), commands: NleCommand[] = [], viewCommands: NleViewCommand[] = [];
  const shared = new Map<string, string>();
  const cloneShared = (ref: string) => {
    const existing = shared.get(ref); if (existing) return existing;
    const value = project.sharedValues.find(value => value.id === ref)!;
    const id = identity("shared-value"); shared.set(ref, id);
    commands.push({ kind: "shared-value.add", value: { ...structuredClone(value), id, name: `${value.name} 副本` } }); return id;
  };
  const cloneAppearance = <T extends { readonly processes?: readonly NleProcess[] }>(appearance: T): T => ({ ...structuredClone(appearance), processes: (appearance.processes ?? []).map(process => ({ ...structuredClone(process), id: identity("process"), parameters: process.parameters.kind === "shared" ? { kind: "shared" as const, ref: cloneShared(process.parameters.ref) } : process.parameters })), ...("layout" in appearance && appearance.layout && typeof appearance.layout === "object" && "ref" in appearance.layout ? { layout: { ref: cloneShared(String(appearance.layout.ref)) } } : {}) });
  const clone = (id: string): string => {
    const existing = compositions.get(id); if (existing) return existing;
    const original = project.compositions.find(value => value.id === id)!, copyId = identity("composition"); compositions.set(id, copyId);
    const names = new Map(original.tracks.flatMap(track => track.items.map(item => [item.id, identity("item")] as const)));
    const trackNames = new Map(original.tracks.map(track => [track.id, identity("track")] as const));
    const tracks = original.tracks.map(track => ({ ...track, id: trackNames.get(track.id)!, items: track.items.map(value => {
      const copy = { ...structuredClone(value), id: names.get(value.id)! };
      if (copy.kind === "present") return { ...copy, ...(copy.source === "composition" ? { composition: clone(copy.composition) } : {}),
        ...(copy.picture ? { picture: cloneAppearance(copy.picture) } : {}),
        ...(copy.audio ? { audio: cloneAppearance(copy.audio) } : {}),
        ...(copy.source === "component" && copy.sharedValueBindings ? { sharedValueBindings: copy.sharedValueBindings.map(binding => ({ ...binding, ref: cloneShared(binding.ref) })) } : {}) };
      return { ...copy, parameters: copy.parameters.kind === "shared" ? { kind: "shared" as const, ref: cloneShared(copy.parameters.ref) } : copy.parameters };
    }) }));
    for (const state of session.open.view.view.compositions.find(value => value.composition === original.id)?.tracks ?? []) {
      viewCommands.push({ kind: "track-lock.set", composition: copyId, track: trackNames.get(state.track)!, locked: state.locked });
      if (state.heightPx !== undefined) viewCommands.push({ kind: "track-height.set", composition: copyId, track: trackNames.get(state.track)!, heightPx: state.heightPx });
    }
    for (const group of session.open.view.view.compositions.find(value => value.composition === original.id)?.groups ?? []) viewCommands.push({ kind: "group.add", composition: copyId, group: { ...group, id: identity("group"), items: group.items.map(id => names.get(id)!) } });
    commands.push({ kind: "composition.add", composition: { ...original, id: copyId, name: `${original.name} 副本`, tracks,
      transitions: original.transitions.map(value => ({ ...value, id: identity("transition"), outgoing: names.get(value.outgoing)!, incoming: names.get(value.incoming)! })),
      mattes: original.mattes.map(value => ({ ...value, id: identity("matte"), content: names.get(value.content)!, matte: names.get(value.matte)! })),
    } }); return copyId;
  };
  const nested = clone(item.composition), sourceTrack = activeComposition(session).tracks.find(track => track.items.some(value => value.id === item.id))!;
  const plan = pasteItems(session, { project: project.id, tracks: [{ ...sourceTrack, items: [{ ...item, composition: nested, ...(item.picture ? { picture: cloneAppearance(item.picture) } : {}), ...(item.audio ? { audio: cloneAppearance(item.audio) } : {}) }] }], transitions: [], mattes: [] }, frame);
  return { ...plan, commands: [...commands, ...plan.commands], viewCommands };
}
export function unpackCompound(session: NleStudioSession, item: NleItem): EditPlan {
  if (item.kind !== "present" || item.source !== "composition") throw new Error("请选择复合片段。");
  if (!editableSelection(session.open.timeline, [item.id]).includes(item.id)) throw new Error("请先解锁复合片段及其组合成员所在的轨道。");
  if (item.picture?.processes?.length || item.audio?.processes?.length || item.picture?.reconstruction || item.audio?.reconstruction) throw new Error("此复合片段包含外层效果或采样设置，请先移除这些设置再拆解。");
  const speed = uniformSpeed(item);
  if (speed === undefined || speed <= 0 || item.sourceTime.pieces.length !== 1) throw new Error("拆解需要正向匀速的复合片段时间映射。");
  const piece = item.sourceTime.pieces[0]!;
  if (!isAffineTemporalMapPiece(piece) || piece.wrap) throw new Error("拆解需要连续的时间映射。");
  const project = session.open.project.project, nested = project.compositions.find(value => value.id === item.composition)!, parent = activeComposition(session);
  if (nested.tracks.some(track => track.items.some(item => item.kind === "adjust"))) throw new Error("内部调整层具有独立的作用范围，当前布局接口无法在拆解时保留该范围。");
  const rect = item.picture ? fitNlePictureContent(resolveNlePictureLayout(project, item.picture.layout), nested.canvas) : undefined;
  const layout = item.picture ? resolveNlePictureLayout(project, item.picture.layout) : undefined;
  const factor = { numerator: piece.rate.denominator, denominator: piece.rate.numerator };
  const sourceEnd = extrapolateTemporalAffineMapPiece(piece, piece.target.end), names = new Map<string, string>(), commands: NleCommand[] = [];
  const selected: string[] = [], trackNames = new Map<string, string>();
  const parentTrack = parent.tracks.find(track => track.items.some(value => value.id === item.id))!, following = parent.tracks[parent.tracks.indexOf(parentTrack) + 1]?.id;
  for (const sourceTrack of nested.tracks) {
    const items: NleItem[] = [];
    for (const child of sourceTrack.items) {
      const from = maximum(child.start, piece.sourceAtStart), until = minimum(nleItemEnd(child), sourceEnd);
      if (compare(from, until) >= 0) continue;
      const range = { start: subtract(from, child.start), end: subtract(until, child.start) }, id = identity("item"); names.set(child.id, id);
      const common = { id, start: add(item.start, scale(subtract(from, piece.sourceAtStart), factor)), duration: scale(subtract(until, from), factor), enabled: child.enabled };
      if (child.kind === "adjust") { items.push({ ...child, ...common, controlTime: scaleMapping(sliceNleTimeMapping(child.controlTime, child.duration, range), factor) }); continue; }
      const picture = child.picture && rect ? (() => {
        const original = resolveNlePictureLayout(project, child.picture!.layout), sx = rect.width / nested.canvas.width, sy = rect.height / nested.canvas.height;
        const transformed = { ...original, x: rect.x + original.x * sx, y: rect.y + original.y * sy, width: original.width * sx, height: original.height * sy };
        if ((Math.abs(sx - sy) > 1e-8 && original.fit !== "fill") || original.x < 0 || original.y < 0 || original.x + original.width > nested.canvas.width || original.y + original.height > nested.canvas.height || transformed.x < layout!.x || transformed.y < layout!.y || transformed.x + transformed.width > layout!.x + layout!.width + 1e-8 || transformed.y + transformed.height > layout!.y + layout!.height + 1e-8) throw new Error("此复合片段的画面包含嵌套裁剪或非等比适配，当前布局接口无法完整保留拆解后的效果。");
        return { ...child.picture, layout: transformed, processes: processes(child.picture!, child.duration, range, factor, true) };
      })() : undefined;
      const audio = item.audio && child.audio ? { ...child.audio, processes: processes(child.audio, child.duration, range, factor, true) } : undefined;
      if (!picture && !audio) continue;
      const { picture: oldPicture, audio: oldAudio, ...source } = child;
      items.push({ ...source, ...common, sourceTime: scaleMapping(sliceNleTimeMapping(child.sourceTime, child.duration, range), factor), ...(picture ? { picture } : {}), ...(audio ? { audio } : {}) }); selected.push(id);
    }
    if (items.length) { const trackId = identity("track"); trackNames.set(sourceTrack.id, trackId); commands.push({ kind: "track.add", composition: parent.id, track: { ...sourceTrack, id: trackId, enabled: item.enabled && sourceTrack.enabled, kind: !rect ? "audio" : sourceTrack.kind, items }, ...(following ? { before: following } : {}) }); }
  }
  for (const transition of nested.transitions) if (names.has(transition.outgoing) && names.has(transition.incoming) && rect) commands.push({ kind: "transition.add", composition: parent.id, transition: { ...transition, id: identity("transition"), outgoing: names.get(transition.outgoing)!, incoming: names.get(transition.incoming)! } });
  for (const matte of nested.mattes) if (names.has(matte.content) && names.has(matte.matte) && rect) commands.push({ kind: "matte.add", composition: parent.id, matte: { ...matte, id: identity("matte"), content: names.get(matte.content)!, matte: names.get(matte.matte)! } });
  const viewCommands: NleViewCommand[] = [];
  for (const state of session.open.view.view.compositions.find(value => value.composition === nested.id)?.tracks ?? []) {
    const track = trackNames.get(state.track); if (!track) continue;
    viewCommands.push({ kind: "track-lock.set", composition: parent.id, track, locked: state.locked });
    if (state.heightPx !== undefined) viewCommands.push({ kind: "track-height.set", composition: parent.id, track, heightPx: state.heightPx });
  }
  const parentGroup = session.open.timeline.groups.find(group => group.items.includes(item.id));
  if (parentGroup) viewCommands.push({ kind: "group.add", composition: parent.id, group: { ...parentGroup, id: identity("group"), items: [...parentGroup.items.filter(id => id !== item.id), ...selected] } });
  else for (const group of session.open.view.view.compositions.find(value => value.composition === nested.id)?.groups ?? []) {
    const items = group.items.map(id => names.get(id)).filter((id): id is string => Boolean(id) && selected.includes(id!));
    if (items.length > 1) viewCommands.push({ kind: "group.add", composition: parent.id, group: { ...group, id: identity("group"), items } });
  }
  return { commands: [...removeItems(session, [item.id]), ...commands], selection: selected, viewCommands };
}

export function magneticEdit(session: NleStudioSession, commands: readonly NleCommand[], trackId: string | undefined): readonly NleCommand[] {
  if (!trackId || !commands.some(command => ["item.remove", "item.move", "item.trim", "item.replace", "item.add"].includes(command.kind))) return commands;
  const project = applyNleTransaction(session.open.project.project, { commands });
  const composition = project.compositions.find(value => value.id === session.open.timeline.composition);
  if (!composition?.tracks.some(track => track.id === trackId)) return commands;
  const scene = session.open.timeline;
  const planned: NleStudioSession = { ...session, open: { ...session.open, project: { ...session.open.project, project }, timeline: { ...scene, tracks: composition.tracks.map(track => {
    const original = scene.tracks.find(value => value.id === track.id);
    return { id: track.id, name: track.name, kind: track.kind, enabled: track.enabled, locked: original?.locked ?? false, heightPx: original?.heightPx ?? 62, tone: original?.tone ?? "neutral", items: track.items.map(item => {
      const previous = original?.items.find(value => value.id === item.id);
      return { ...previous, id: item.id, track: track.id, role: item.kind === "adjust" ? "adjust" as const : "present" as const, source: item.kind === "adjust" ? "adjust" as const : item.source,
        enabled: item.enabled, startFrame: frameOf(session, item.start), durationFrames: frameOf(session, item.duration), display: previous?.display ?? { title: item.name ?? item.id, layers: [] }, presentation: previous?.presentation ?? { tone: "neutral" as const, chrome: "standard" as const }, affordances: previous?.affordances ?? { select: true as const, move: true, trimStart: true, trimEnd: true, split: true } };
    }) };
  }) } } };
  const moves = closeTrackGaps(planned, trackId).commands;
  const beforeIds = new Set(activeComposition(session).tracks.flatMap(track => track.items.map(item => item.id)));
  const fresh = new Map<string, ExactTemporalValue>();
  const extra: NleCommand[] = [];
  for (const command of moves) if (command.kind === "item.move") {
    for (const id of command.ids) if (!beforeIds.has(id)) fresh.set(id, command.delta);
    const ids = command.ids.filter(id => beforeIds.has(id));
    if (ids.length) extra.push({ ...command, ids });
  }
  return [...commands.map(command => command.kind === "item.add" && fresh.has(command.item.id) ? { ...command, item: { ...command.item, start: add(command.item.start, fresh.get(command.item.id)!) } } : command), ...extra];
}

export function editTransitionDuration(session: NleStudioSession, id: string, frames: number | undefined): EditPlan {
  const composition = activeComposition(session), transition = composition.transitions.find(value => value.id === id);
  if (!transition) throw new Error("所选转场已不存在。");
  const track = composition.tracks.find(track => track.items.some(item => item.id === transition.incoming))!;
  const outgoing = track.items.find(item => item.id === transition.outgoing)!, incoming = track.items.find(item => item.id === transition.incoming)!;
  const current = subtract(nleItemEnd(outgoing), incoming.start), next = frames === undefined ? exactTemporalZero() : frameTime(session, Math.max(1, Math.round(frames)));
  const delta = subtract(current, next);
  const ids = linkedSelection(session.open.timeline, track.items.filter(item => compare(item.start, incoming.start) >= 0).map(item => item.id));
  if (ids.includes(outgoing.id)) throw new Error("转场两侧属于同一组合，请先取消组合再调整转场长度。");
  return { commands: [...(frames === undefined ? [{ kind: "transition.remove" as const, id }] : []), ...(compare(delta, exactTemporalZero()) === 0 ? [] : [{ kind: "item.move" as const, ids, delta }])] };
}
