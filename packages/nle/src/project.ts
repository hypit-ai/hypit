import { verifyPreparedMedia } from "@hypit/media";
import { canonicalize, isModuleRef } from "@hypit/protocol";

import type {
  NleAudioAppearance,
  NleCanvas,
  NleCaptionItem,
  NleFrameRate,
  NleItem,
  NleMedia,
  NlePackageSymbol,
  NlePictureAppearance,
  NleProject,
  NleTrack,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function nonNegativeFrame(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer.`);
}

function positiveFrame(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer.`);
}

function assertFrameRate(value: NleFrameRate): void {
  positiveFrame(value.numerator, "NLE frame-rate numerator");
  positiveFrame(value.denominator, "NLE frame-rate denominator");
}

function assertCanvas(value: NleCanvas): void {
  positiveFrame(value.width, "NLE Canvas width");
  positiveFrame(value.height, "NLE Canvas height");
  assert(value.clearColor.trim().length > 0, "NLE Canvas clear color is empty.");
}

function assertSymbol(value: NlePackageSymbol, label: string): void {
  assert(isModuleRef(value.module), `${label} Module is invalid.`);
  identity(value.name, `${label} name`);
}

function assertEffects(value: NlePictureAppearance["effects"], label: string): void {
  assert(Array.isArray(value), `${label} Effects must be an array.`);
  const effectIds = new Set<string>();
  for (const effect of value) {
    identity(effect.id, `${label} Effect id`);
    assert(!effectIds.has(effect.id), `${label} repeats Effect ${effect.id}.`);
    effectIds.add(effect.id);
    assertSymbol(effect.effect, `${label} Effect ${effect.id}`);
    canonicalize(effect.parameters);
  }
}

function assertPicture(value: NlePictureAppearance, project: NleProject, label: string): void {
  const layout = value.layout;
  for (const [name, coordinate] of Object.entries(layout).filter(([name]) => name !== "fit")) {
    assert(typeof coordinate === "number" && Number.isFinite(coordinate), `${label} ${name} must be finite.`);
  }
  assert(layout.width > 0 && layout.height > 0, `${label} must have positive extent.`);
  assert(layout.x >= 0 && layout.y >= 0
    && layout.x + layout.width <= project.canvas.width
    && layout.y + layout.height <= project.canvas.height,
  `${label} must lie inside the NLE Canvas.`);
  assert(layout.fit === "fill" || layout.fit === "contain" || layout.fit === "cover",
    `${label} fit is invalid.`);
  assertEffects(value.effects, label);
}

function assertAudio(value: NleAudioAppearance, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assertEffects(value.effects, label);
}

function assertAppearances(
  value: Exclude<NleItem, NleCaptionItem>,
  track: NleTrack,
  project: NleProject,
): void {
  if (track.kind === "picture") {
    assert(value.picture !== undefined, `NLE ${value.kind} Item ${value.id} on a Picture Track has no Picture appearance.`);
    assertPicture(value.picture, project, `NLE ${value.kind} Item ${value.id} Picture`);
  } else {
    assert(value.picture === undefined, `NLE ${value.kind} Item ${value.id} on an Audio Track has Picture state.`);
    assert(value.audio !== undefined, `NLE ${value.kind} Item ${value.id} on an Audio Track has no Audio appearance.`);
  }
  if (value.audio !== undefined) assertAudio(value.audio, `NLE ${value.kind} Item ${value.id} Audio`);
  if (value.picture !== undefined && value.audio !== undefined) {
    const pictureIds = new Set(value.picture.effects.map((effect) => effect.id));
    for (const effect of value.audio.effects) {
      assert(!pictureIds.has(effect.id), `NLE Item ${value.id} repeats Effect ${effect.id} across Picture and Audio.`);
    }
  }
}

function assertItem(
  value: NleItem,
  track: NleTrack,
  project: NleProject,
  media: ReadonlySet<string>,
  ancestors: Set<object>,
): void {
  identity(value.id, "NLE Item id");
  nonNegativeFrame(value.startFrame, `NLE Item ${value.id} startFrame`);
  positiveFrame(value.durationFrames, `NLE Item ${value.id} durationFrames`);
  nonNegativeFrame(value.localStartFrame, `NLE Item ${value.id} localStartFrame`);
  assert(typeof value.enabled === "boolean", `NLE Item ${value.id} enabled is invalid.`);
  if (value.kind === "media") {
    identity(value.media, `NLE Media Item ${value.id} media`);
    assert(media.has(value.media), `NLE Media Item ${value.id} references missing Media ${value.media}.`);
    assertAppearances(value, track, project);
    return;
  }
  if (value.kind === "caption") {
    assert(track.kind === "picture", `NLE Caption Item ${value.id} must belong to a Picture Track.`);
    assertPicture(value.picture, project, `NLE Caption Item ${value.id} Picture`);
    assert(value.text.length > 0, `NLE Caption Item ${value.id} is empty.`);
    assertSymbol(value.renderer, `NLE Caption Item ${value.id} renderer`);
    canonicalize(value.parameters);
    return;
  }
  assertAppearances(value, track, project);
  if (value.kind === "compound") {
    assertNleProjectValue(value.project, ancestors);
    assert(value.project.frameRate.numerator === project.frameRate.numerator
      && value.project.frameRate.denominator === project.frameRate.denominator,
    `NLE Compound Item ${value.id} child Project must use the parent frame rate.`);
    const end = nleProjectEndFrame(value.project);
    assert(end > 0, `NLE Compound Item ${value.id} child Project is empty.`);
    assert(value.localStartFrame + value.durationFrames <= end,
      `NLE Compound Item ${value.id} exceeds child Project ${value.project.id}.`);
    return;
  }
  assertSymbol(value.component, `NLE Component Item ${value.id} component`);
  canonicalize(value.parameters);
}

function assertNleProjectValue(value: NleProject, ancestors: Set<object>): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "NLE Project must be an object.");
  assert(!ancestors.has(value), "NLE Compound Projects contain a cycle.");
  ancestors.add(value);
  assert(value.format === "hypit.nle@1", "Unsupported NLE project format.");
  identity(value.id, "NLE Project id");
  assert(value.name.trim().length > 0, "NLE Project name is empty.");
  nonNegativeFrame(value.revision, "NLE Project revision");
  assertFrameRate(value.frameRate);
  assertCanvas(value.canvas);
  assert(Array.isArray(value.media) && Array.isArray(value.tracks)
    && Array.isArray(value.transitions) && Array.isArray(value.mattes) && Array.isArray(value.groups),
  `NLE Project ${value.id} collections are invalid.`);
  const identities = new Set<string>([value.id]);
  const addIdentity = (id: string, label: string) => {
    identity(id, label);
    assert(!identities.has(id), `${label} ${id} is duplicated in the NLE Project.`);
    identities.add(id);
  };
  const preparedIds = new Set<string>();
  for (const media of value.media) {
    addIdentity(media.id, "NLE Media id");
    assert(media.name.trim().length > 0, `NLE Media ${media.id} name is empty.`);
    verifyPreparedMedia(media.prepared);
    assert(!preparedIds.has(media.prepared.id),
      `Prepared Media ${media.prepared.id} is registered more than once in the NLE Project.`);
    preparedIds.add(media.prepared.id);
  }
  const mediaIds = new Set(value.media.map((entry) => entry.id));
  const items = new Map<string, { readonly track: NleTrack; readonly item: NleItem; readonly index: number }>();
  for (const track of value.tracks) {
    addIdentity(track.id, "NLE Track id");
    assert(track.name.trim().length > 0, `NLE Track ${track.id} name is empty.`);
    assert(track.kind === "picture" || track.kind === "audio", `NLE Track ${track.id} kind is invalid.`);
    assert(typeof track.locked === "boolean" && typeof track.muted === "boolean",
      `NLE Track ${track.id} state is invalid.`);
    for (const [index, item] of track.items.entries()) {
      addIdentity(item.id, "NLE Item id");
      assertItem(item, track, value, mediaIds, ancestors);
      items.set(item.id, { track, item, index });
    }
  }
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  for (const transition of value.transitions) {
    addIdentity(transition.id, "NLE Transition id");
    const left = items.get(transition.outgoing);
    const right = items.get(transition.incoming);
    assert(left !== undefined && right !== undefined,
      `NLE Transition ${transition.id} references a missing Item.`);
    assert(left.track.id === right.track.id && left.track.kind === "picture",
      `NLE Transition ${transition.id} Items must belong to one Picture Track.`);
    assert(left.item.enabled && right.item.enabled,
      `NLE Transition ${transition.id} cannot use a disabled Item.`);
    assert(!outgoing.has(left.item.id), `NLE Item ${left.item.id} has multiple outgoing Transitions.`);
    assert(!incoming.has(right.item.id), `NLE Item ${right.item.id} has multiple incoming Transitions.`);
    outgoing.add(left.item.id);
    incoming.add(right.item.id);
    const leftEnd = left.item.startFrame + left.item.durationFrames;
    const rightEnd = right.item.startFrame + right.item.durationFrames;
    assert(left.item.startFrame < right.item.startFrame
      && right.item.startFrame < leftEnd && leftEnd < rightEnd,
    `NLE Transition ${transition.id} requires a canonical outgoing/incoming overlap.`);
    assertSymbol(transition.operator, `NLE Transition ${transition.id} operator`);
    canonicalize(transition.parameters);
  }
  for (const item of items.keys()) {
    const before = value.transitions.find((transition) => transition.incoming === item);
    const after = value.transitions.find((transition) => transition.outgoing === item);
    if (before === undefined || after === undefined) continue;
    const beforeOutgoing = items.get(before.outgoing)!.item;
    const afterIncoming = items.get(after.incoming)!.item;
    assert(beforeOutgoing.startFrame + beforeOutgoing.durationFrames <= afterIncoming.startFrame,
      `NLE Transition chain leaves Item ${item} with overlapping transition ranges.`);
  }
  const matteByContent = new Map<string, string>();
  const matteSources = new Set<string>();
  for (const matte of value.mattes) {
    addIdentity(matte.id, "NLE Matte id");
    const content = items.get(matte.content);
    const source = items.get(matte.matte);
    assert(content !== undefined && source !== undefined, `NLE Matte ${matte.id} references a missing Item.`);
    assert(content.track.kind === "picture" && source.track.kind === "picture",
      `NLE Matte ${matte.id} requires Picture Items.`);
    assert(content.item.enabled && source.item.enabled, `NLE Matte ${matte.id} cannot use a disabled Item.`);
    assert(content.item.id !== source.item.id, `NLE Matte ${matte.id} cannot sample itself.`);
    assert(!matteByContent.has(content.item.id), `NLE Item ${content.item.id} has multiple Mattes.`);
    const contentEnd = content.item.startFrame + content.item.durationFrames;
    const sourceEnd = source.item.startFrame + source.item.durationFrames;
    assert(source.item.startFrame <= content.item.startFrame && sourceEnd >= contentEnd,
      `NLE Matte ${matte.id} does not cover content Item ${content.item.id}.`);
    assertSymbol(matte.operator, `NLE Matte ${matte.id} operator`);
    canonicalize(matte.parameters);
    matteByContent.set(content.item.id, source.item.id);
    matteSources.add(source.item.id);
  }
  for (const transition of value.transitions) {
    assert(!matteSources.has(transition.outgoing) && !matteSources.has(transition.incoming),
      `NLE Transition ${transition.id} cannot consume an Item used as a Matte source.`);
  }
  for (const start of matteByContent.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined) {
      assert(!seen.has(current), `NLE Matte dependencies contain a cycle at Item ${current}.`);
      seen.add(current);
      current = matteByContent.get(current);
    }
  }
  const grouped = new Set<string>();
  for (const group of value.groups) {
    addIdentity(group.id, "NLE Group id");
    assert(group.name.trim().length > 0, `NLE Group ${group.id} name is empty.`);
    assert(group.items.length >= 2, `NLE Group ${group.id} must contain at least two Items.`);
    const own = new Set<string>();
    for (const item of group.items) {
      assert(items.has(item), `NLE Group ${group.id} references missing Item ${item}.`);
      assert(!own.has(item), `NLE Group ${group.id} repeats Item ${item}.`);
      assert(!grouped.has(item), `NLE Item ${item} belongs to multiple Groups.`);
      own.add(item);
      grouped.add(item);
    }
  }
  ancestors.delete(value);
}

export function assertNleProject(value: NleProject): void {
  assertNleProjectValue(value, new Set<object>());
}

export function sealNleProject(value: NleProject): NleProject {
  assertNleProject(value);
  return structuredClone(value);
}

export function parseNleProject(text: string): NleProject {
  const value = JSON.parse(text) as NleProject;
  return sealNleProject(value);
}

export function serializeNleProject(value: NleProject): string {
  assertNleProject(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function createNleProject(input: {
  readonly id: string;
  readonly name: string;
  readonly frameRate?: NleFrameRate;
  readonly canvas?: NleCanvas;
}): NleProject {
  return sealNleProject({
    format: "hypit.nle@1",
    id: input.id,
    name: input.name,
    revision: 0,
    frameRate: input.frameRate ?? { numerator: 30, denominator: 1 },
    canvas: input.canvas ?? { width: 1920, height: 1080, clearColor: "#000000" },
    media: [],
    tracks: [],
    transitions: [],
    mattes: [],
    groups: [],
  });
}

export function nleProjectEndFrame(value: NleProject): number {
  assertNleProject(value);
  return Math.max(0, ...value.tracks.flatMap((track) =>
    track.items.filter((item) => item.enabled).map((item) => item.startFrame + item.durationFrames)));
}

export function findNleMedia(value: NleProject, id: string): NleMedia {
  const media = value.media.find((candidate) => candidate.id === id);
  if (media === undefined) throw new Error(`Unknown NLE Media: ${id}`);
  return media;
}

export function findNleTrack(value: NleProject, id: string): NleTrack {
  const track = value.tracks.find((candidate) => candidate.id === id);
  if (track === undefined) throw new Error(`Unknown NLE Track: ${id}`);
  return track;
}

export function findNleItem(value: NleProject, id: string): { readonly track: NleTrack; readonly item: NleItem } {
  for (const track of value.tracks) {
    const item = track.items.find((candidate) => candidate.id === id);
    if (item !== undefined) return { track, item };
  }
  throw new Error(`Unknown NLE Item: ${id}`);
}
