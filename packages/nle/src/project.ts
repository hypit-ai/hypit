import { canonicalize } from "@hypit/protocol";
import { isModuleRef, moduleKey } from "@hypit/module";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  assertTemporalMapPieces,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

import { assertNleTimeMapping } from "./source-time.js";
import type {
  NleAudioAppearance,
  NleCanvas,
  NleComposition,
  NleComponentItem,
  NleComponentValue,
  NleItem,
  NleMediaAssetReference,
  NleOperatorApplication,
  NlePackageSymbol,
  NlePictureAppearance,
  NlePictureLayout,
  NlePictureLayoutReference,
  NlePictureLayoutValue,
  NlePresentItem,
  NleProject,
  NleResolvedPictureAppearance,
  NleTrack,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertOnlyKeys(value: object, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  assert(unknown.length === 0, `${label} contains unknown fields: ${unknown.join(", ")}.`);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertMediaAssetReference(value: NleMediaAssetReference, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(Object.keys(value).length === 1 && typeof value.path === "string" && value.path.length > 0,
    `${label} must contain only a non-empty path.`);
  assert(!value.path.includes("\\") && !value.path.startsWith("/") && !/^[A-Za-z]:/u.test(value.path),
    `${label} must use a portable relative path.`);
  const relative = value.path.startsWith("./") ? value.path.slice(2) : value.path;
  const parts = relative.split("/");
  assert(relative.length > 0 && parts.every((part) => part.length > 0 && part !== "."),
    `${label} must not contain empty or current segments.`);
  const firstOwned = parts.findIndex((part) => part !== "..");
  assert(firstOwned >= 0 && parts.slice(firstOwned).every((part) => part !== ".."),
    `${label} may contain parent segments only before its owned path.`);
}

function nonNegativeInteger(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer.`);
}

function positiveInteger(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer.`);
}

function assertNonNegativeTime(value: ExactTemporalValue, label: string): void {
  assertExactTemporalValue(value, label);
  assert(compareExactTemporalValues(value, exactTemporalZero()) >= 0, `${label} must not be negative.`);
}

function assertPositiveTime(value: ExactTemporalValue, label: string): void {
  assertExactTemporalValue(value, label);
  assert(compareExactTemporalValues(value, exactTemporalZero()) > 0, `${label} must be positive.`);
}

function itemEnd(value: NleItem): ExactTemporalValue {
  return addExactTemporalValues(value.start, value.duration);
}

function assertCanvas(value: NleCanvas): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "NLE Canvas must be an object.");
  assertOnlyKeys(value, ["width", "height", "clearColor"], "NLE Canvas");
  positiveInteger(value.width, "NLE Canvas width");
  positiveInteger(value.height, "NLE Canvas height");
  assert(value.clearColor.trim().length > 0, "NLE Canvas clear color is empty.");
}

function assertSymbol(value: NlePackageSymbol, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assertOnlyKeys(value, ["module", "name"], label);
  assert(isModuleRef(value.module), `${label} Module is invalid.`);
  identity(value.name, `${label} name`);
}

function isPictureLayoutReference(
  value: NlePictureLayout | NlePictureLayoutReference,
): value is NlePictureLayoutReference {
  return Object.hasOwn(value, "ref");
}

function assertPictureLayout(value: NlePictureLayout, _project: NleComposition, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assertOnlyKeys(value, ["x", "y", "width", "height", "fit", "contentX", "contentY"], label);
  const layout = value;
  for (const [name, coordinate] of Object.entries(layout).filter(([name]) => name !== "fit")) {
    assert(typeof coordinate === "number" && Number.isFinite(coordinate), `${label} ${name} must be finite.`);
  }
  assert(layout.width > 0 && layout.height > 0, `${label} must have positive extent.`);
  for (const [name, coordinate] of [["contentX", layout.contentX], ["contentY", layout.contentY]] as const) {
    assert(coordinate === undefined || coordinate >= 0 && coordinate <= 1,
      `${label} ${name} must lie between zero and one.`);
  }
  assert(layout.fit === "fill" || layout.fit === "contain" || layout.fit === "cover",
    `${label} fit is invalid.`);
}

function assertPicture(
  value: NlePictureAppearance,
  project: NleComposition,
  pictureLayouts: ReadonlyMap<string, NlePictureLayoutValue>,
  duration: ExactTemporalValue,
  label: string,
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assertOnlyKeys(value, ["layout", "operators"], label);
  const layout = value.layout;
  if (isPictureLayoutReference(layout)) {
    assert(Object.keys(layout).length === 1, `${label} layout reference must contain only ref.`);
    identity(layout.ref, `${label} layout reference`);
    assert(pictureLayouts.has(layout.ref), `${label} references missing Picture Layout ${layout.ref}.`);
  } else {
    assertPictureLayout(layout, project, `${label} layout`);
  }
  assertOperatorApplications(value.operators ?? [], duration, label);
}

function assertOperatorApplications(
  applications: readonly NleOperatorApplication[],
  duration: ExactTemporalValue,
  label: string,
): void {
  assert(Array.isArray(applications), `${label} operators must be an array.`);
  const operatorIds = new Set<string>();
  for (const application of applications) {
    assert(application !== null && typeof application === "object" && !Array.isArray(application),
      `${label} Operator Application is invalid.`);
    assert(Object.keys(application).sort().join("\u0000")
      === ["controlTime", "id", "operator", "parameters"].join("\u0000"),
    `${label} Operator Application fields are invalid.`);
    identity(application.id, `${label} Operator Application id`);
    assert(!operatorIds.has(application.id), `${label} repeats Operator Application ${application.id}.`);
    operatorIds.add(application.id);
    assertSymbol(application.operator, `${label} Operator Application ${application.id} operator`);
    canonicalize(application.parameters);
    assertNleTimeMapping(
      application.controlTime,
      duration,
      `${label} Operator Application ${application.id} controlTime`,
    );
  }
}

function assertAudio(value: NleAudioAppearance, label: string, duration: ExactTemporalValue): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assertOnlyKeys(value, ["reconstruction", "operators"], label);
  if (value.reconstruction !== undefined) {
    assert(value.reconstruction !== null && typeof value.reconstruction === "object"
      && !Array.isArray(value.reconstruction), `${label} reconstruction is invalid.`);
    assertOnlyKeys(value.reconstruction, ["using", "parameters"], `${label} reconstruction`);
    assertSymbol(value.reconstruction.using, `${label} reconstruction`);
    canonicalize(value.reconstruction.parameters);
  }
  assertOperatorApplications(value.operators ?? [], duration, label);
}

function assertAppearances(
  value: NlePresentItem,
  track: NleTrack,
  project: NleComposition,
  pictureLayouts: ReadonlyMap<string, NlePictureLayoutValue>,
): void {
  if (track.kind === "picture") {
    assert(value.picture !== undefined, `NLE ${value.kind} Item ${value.id} on a Picture Track has no Picture appearance.`);
    assertPicture(value.picture, project, pictureLayouts, value.duration, `NLE ${value.kind} Item ${value.id} Picture`);
  } else {
    assert(value.picture === undefined, `NLE ${value.kind} Item ${value.id} on an Audio Track has Picture state.`);
    assert(value.audio !== undefined, `NLE ${value.kind} Item ${value.id} on an Audio Track has no Audio appearance.`);
  }
  if (value.audio !== undefined) assertAudio(
    value.audio,
    `NLE ${value.kind} Item ${value.id} Audio`,
    value.duration,
  );
}

function assertItem(
  value: NleItem,
  track: NleTrack,
  project: NleComposition,
  componentValues: ReadonlyMap<string, NleComponentValue>,
  pictureLayouts: ReadonlyMap<string, NlePictureLayoutValue>,
  ancestors: Set<object>,
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "NLE Item must be an object.");
  const baseKeys = ["id", "name", "start", "duration", "enabled"] as const;
  assert(value.kind === "present" || value.kind === "adjustment", "NLE Item kind is invalid.");
  if (value.kind === "present") {
    assert(value.source === "media" || value.source === "component" || value.source === "composition",
      `NLE Present Item ${value.id ?? "<unknown>"} source is invalid.`);
  }
  if (value.kind === "adjustment") {
    assertOnlyKeys(
      value,
      [...baseKeys, "kind", "operator", "parameters", "controlTime"],
      `NLE Adjustment Item ${value.id}`,
    );
  } else if (value.source === "media") {
    assertOnlyKeys(
      value,
      [...baseKeys, "kind", "source", "sourceTime", "asset", "picture", "audio"],
      `NLE Media Item ${value.id}`,
    );
  } else if (value.source === "component") {
    assertOnlyKeys(value, [...baseKeys, "kind", "source", "sourceTime", "component", "sharedValues", "media", "parameters", "picture", "audio"],
      `NLE Component Item ${value.id}`);
  } else if (value.source === "composition") {
    assertOnlyKeys(value, [...baseKeys, "kind", "source", "sourceTime", "composition", "picture", "audio"],
      `NLE Composition Item ${value.id}`);
  }
  identity(value.id, "NLE Item id");
  if (value.name !== undefined) {
    assert(typeof value.name === "string" && value.name.trim().length > 0,
      `NLE Item ${value.id} name is empty.`);
  }
  assertNonNegativeTime(value.start, `NLE Item ${value.id} start`);
  assertPositiveTime(value.duration, `NLE Item ${value.id} duration`);
  assert(typeof value.enabled === "boolean", `NLE Item ${value.id} enabled is invalid.`);
  if (value.kind === "adjustment") {
    assert(!Object.hasOwn(value, "picture") && !Object.hasOwn(value, "audio"),
      `NLE Adjustment Item ${value.id} must not own a Present appearance.`);
    assertSymbol(value.operator, `NLE Adjustment Item ${value.id} operator`);
    canonicalize(value.parameters);
    assertNleTimeMapping(value.controlTime, value.duration, `NLE Adjustment Item ${value.id} controlTime`);
    return;
  }
  assertNleTimeMapping(value.sourceTime, value.duration, `NLE Item ${value.id} sourceTime`);
  assertAppearances(value, track, project, pictureLayouts);
  if (value.source === "media") {
    assertMediaAssetReference(value.asset, `NLE Media Present ${value.id} asset`);
    return;
  }
  if (value.source === "composition") {
    assert(!Object.hasOwn(value, "project"),
      `NLE Composition Present ${value.id} must embed composition, not a Project file envelope.`);
    assertNleCompositionValue(value.composition, ancestors);
    const duration = nleCompositionDuration(value.composition);
    assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
      `NLE Composition Present ${value.id} child Composition is empty.`);
    assertTemporalMapPieces(
      value.sourceTime.pieces,
      sealLocalTemporalDomain({ id: `${value.id}:time`, duration: value.duration }),
      sealLocalTemporalDomain({ id: `${value.composition.id}:time`, duration }),
    );
    return;
  }
  assertSymbol(value.component, `NLE Component Present ${value.id} component`);
  const slots = new Set<string>();
  for (const reference of value.sharedValues ?? []) {
    assert(reference !== null && typeof reference === "object" && !Array.isArray(reference),
      `NLE Component Item ${value.id} shared value reference is invalid.`);
    assert(Object.keys(reference).sort().join("\u0000") === ["ref", "slot"].join("\u0000"),
      `NLE Component Item ${value.id} shared value reference fields are invalid.`);
    identity(reference.slot, `NLE Component Item ${value.id} shared value slot`);
    assert(!slots.has(reference.slot),
      `NLE Component Item ${value.id} repeats shared value slot ${reference.slot}.`);
    slots.add(reference.slot);
    identity(reference.ref, `NLE Component Item ${value.id} shared value reference`);
    const resource = componentValues.get(reference.ref);
    assert(resource !== undefined,
      `NLE Component Item ${value.id} shared value ${reference.slot} references missing Component Value ${reference.ref}.`);
    assert(resource.slot === reference.slot,
      `NLE Component Item ${value.id} shared value ${reference.slot} references Component Value slot ${resource.slot}.`);
    assert(resource.component.name === value.component.name
      && moduleKey(resource.component.module) === moduleKey(value.component.module),
    `NLE Component Item ${value.id} shared value ${reference.slot} belongs to another Component.`);
  }
  if (value.media !== undefined) {
    assert(value.media !== null && typeof value.media === "object" && !Array.isArray(value.media),
      `NLE Component Item ${value.id} media inputs must be an object.`);
    for (const [input, asset] of Object.entries(value.media)) {
      identity(input, `NLE Component Item ${value.id} media input`);
      assertMediaAssetReference(asset, `NLE Component Item ${value.id} media input ${input}`);
    }
  }
  canonicalize(value.parameters);
}

function assertNleCompositionValue(value: NleComposition, ancestors: Set<object>): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "NLE Composition must be an object.");
  assert(!ancestors.has(value), "NLE Compound Compositions contain a cycle.");
  assert(!Object.hasOwn(value, "format") && !Object.hasOwn(value, "revision"),
    "NLE Composition must not contain a Project file envelope.");
  assert(!Object.hasOwn(value, "editRate") && !Object.hasOwn(value, "groups"),
    "NLE editor grid and Groups belong to hypit.nle-view@1, not the Composition.");
  ancestors.add(value);
  identity(value.id, "NLE Composition id");
  assert(typeof value.name === "string" && value.name.trim().length > 0, "NLE Composition name is empty.");
  assertCanvas(value.canvas);
  assert(!Object.hasOwn(value, "media"),
    "NLE Composition must reference Media Assets from Items, not own a Media collection.");
  assertOnlyKeys(value, ["id", "name", "canvas", "componentValues", "pictureLayouts", "tracks", "transitions", "mattes"],
    "NLE Composition");
  assert(Array.isArray(value.componentValues) && Array.isArray(value.pictureLayouts)
    && Array.isArray(value.tracks)
    && Array.isArray(value.transitions) && Array.isArray(value.mattes),
  `NLE Composition ${value.id} collections are invalid.`);
  const identities = new Set<string>([value.id]);
  const addIdentity = (id: string, label: string) => {
    identity(id, label);
    assert(!identities.has(id), `${label} ${id} is duplicated in the NLE Project.`);
    identities.add(id);
  };
  for (const resource of value.componentValues) {
    assert(resource !== null && typeof resource === "object" && !Array.isArray(resource),
      "NLE Component Value must be an object.");
    assertOnlyKeys(resource, ["id", "name", "component", "slot", "value"], "NLE Component Value");
    addIdentity(resource.id, "NLE Component Value id");
    assert(resource.name.trim().length > 0, `NLE Component Value ${resource.id} name is empty.`);
    assertSymbol(resource.component, `NLE Component Value ${resource.id} component`);
    identity(resource.slot, `NLE Component Value ${resource.id} slot`);
    canonicalize(resource.value);
  }
  const componentValues = new Map(value.componentValues.map((resource) => [resource.id, resource] as const));
  for (const resource of value.pictureLayouts) {
    assert(resource !== null && typeof resource === "object" && !Array.isArray(resource),
      "NLE Picture Layout must be an object.");
    assertOnlyKeys(resource, ["id", "name", "layout"], "NLE Picture Layout");
    addIdentity(resource.id, "NLE Picture Layout id");
    assert(resource.name.trim().length > 0, `NLE Picture Layout ${resource.id} name is empty.`);
    assertPictureLayout(resource.layout, value, `NLE Picture Layout ${resource.id}`);
  }
  const pictureLayouts = new Map(value.pictureLayouts.map((resource) => [resource.id, resource] as const));
  const items = new Map<string, { readonly track: NleTrack; readonly item: NleItem; readonly index: number }>();
  for (const track of value.tracks) {
    assert(track !== null && typeof track === "object" && !Array.isArray(track), "NLE Track must be an object.");
    addIdentity(track.id, "NLE Track id");
    assert(track.name.trim().length > 0, `NLE Track ${track.id} name is empty.`);
    assert(track.kind === "picture" || track.kind === "audio", `NLE Track ${track.id} kind is invalid.`);
    assert(!Object.hasOwn(track, "locked"),
      `NLE Track ${track.id} lock belongs to hypit.nle-view@1.`);
    assertOnlyKeys(track, ["id", "name", "kind", "muted", "items"], "NLE Track");
    assert(typeof track.muted === "boolean", `NLE Track ${track.id} mute state is invalid.`);
    for (const [index, item] of track.items.entries()) {
      addIdentity(item.id, "NLE Item id");
      assertItem(item, track, value, componentValues, pictureLayouts, ancestors);
      items.set(item.id, { track, item, index });
    }
  }
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  for (const transition of value.transitions) {
    assert(transition !== null && typeof transition === "object" && !Array.isArray(transition),
      "NLE Transition must be an object.");
    assertOnlyKeys(transition, ["id", "outgoing", "incoming", "operator", "parameters"], "NLE Transition");
    addIdentity(transition.id, "NLE Transition id");
    const left = items.get(transition.outgoing);
    const right = items.get(transition.incoming);
    assert(left !== undefined && right !== undefined,
      `NLE Transition ${transition.id} references a missing Item.`);
    assert(left.track.id === right.track.id && left.track.kind === "picture",
      `NLE Transition ${transition.id} Items must belong to one Picture Track.`);
    assert(left.item.kind === "present" && right.item.kind === "present",
      `NLE Transition ${transition.id} requires Present Items.`);
    assert(left.item.enabled && right.item.enabled,
      `NLE Transition ${transition.id} cannot use a disabled Item.`);
    assert(!outgoing.has(left.item.id), `NLE Item ${left.item.id} has multiple outgoing Transitions.`);
    assert(!incoming.has(right.item.id), `NLE Item ${right.item.id} has multiple incoming Transitions.`);
    outgoing.add(left.item.id);
    incoming.add(right.item.id);
    const leftEnd = itemEnd(left.item);
    const rightEnd = itemEnd(right.item);
    assert(compareExactTemporalValues(left.item.start, right.item.start) < 0
      && compareExactTemporalValues(right.item.start, leftEnd) < 0
      && compareExactTemporalValues(leftEnd, rightEnd) < 0,
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
    assert(compareExactTemporalValues(itemEnd(beforeOutgoing), afterIncoming.start) <= 0,
      `NLE Transition chain leaves Item ${item} with overlapping transition ranges.`);
  }
  const matteByContent = new Map<string, string>();
  const matteSources = new Set<string>();
  for (const matte of value.mattes) {
    assert(matte !== null && typeof matte === "object" && !Array.isArray(matte), "NLE Matte must be an object.");
    assertOnlyKeys(matte, ["id", "content", "matte", "operator", "parameters"], "NLE Matte");
    addIdentity(matte.id, "NLE Matte id");
    const content = items.get(matte.content);
    const source = items.get(matte.matte);
    assert(content !== undefined && source !== undefined, `NLE Matte ${matte.id} references a missing Item.`);
    assert(content.track.kind === "picture" && source.track.kind === "picture",
      `NLE Matte ${matte.id} requires Picture Items.`);
    assert(content.item.kind === "present" && source.item.kind === "present",
      `NLE Matte ${matte.id} requires Present Items.`);
    assert(content.item.enabled && source.item.enabled, `NLE Matte ${matte.id} cannot use a disabled Item.`);
    assert(content.item.id !== source.item.id, `NLE Matte ${matte.id} cannot sample itself.`);
    assert(!matteByContent.has(content.item.id), `NLE Item ${content.item.id} has multiple Mattes.`);
    const contentEnd = itemEnd(content.item);
    const sourceEnd = itemEnd(source.item);
    assert(compareExactTemporalValues(source.item.start, content.item.start) <= 0
      && compareExactTemporalValues(sourceEnd, contentEnd) >= 0,
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
  ancestors.delete(value);
}

export function assertNleComposition(value: NleComposition): void {
  assertNleCompositionValue(value, new Set<object>());
}

export function sealNleComposition(value: NleComposition): NleComposition {
  assertNleComposition(value);
  return structuredClone(value);
}

export function assertNleProject(value: NleProject): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "NLE Project must be an object.");
  assert(value.format === "hypit.nle@1", "Unsupported NLE project format.");
  nonNegativeInteger(value.revision, "NLE Project revision");
  const { format: _format, revision: _revision, ...composition } = value;
  assertNleComposition(composition);
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
  readonly canvas?: NleCanvas;
}): NleProject {
  return sealNleProject({
    format: "hypit.nle@1",
    revision: 0,
    ...createNleComposition(input),
  });
}

export function createNleComposition(input: {
  readonly id: string;
  readonly name: string;
  readonly canvas?: NleCanvas;
}): NleComposition {
  return sealNleComposition({
    id: input.id,
    name: input.name,
    canvas: input.canvas ?? { width: 1920, height: 1080, clearColor: "#000000" },
    componentValues: [],
    pictureLayouts: [],
    tracks: [],
    transitions: [],
    mattes: [],
  });
}

export function nleProjectComposition(project: NleProject): NleComposition {
  assertNleProject(project);
  const { format: _format, revision: _revision, ...composition } = project;
  return sealNleComposition(composition);
}

export function nleCompositionDuration(value: NleComposition): ExactTemporalValue {
  assertNleComposition(value);
  return nleCompositionDurationUnchecked(value);
}

function nleCompositionDurationUnchecked(value: NleComposition): ExactTemporalValue {
  let duration = exactTemporalZero();
  for (const item of value.tracks.flatMap((track) => track.items).filter((item) => item.enabled)) {
    const end = itemEnd(item);
    if (compareExactTemporalValues(end, duration) > 0) duration = end;
  }
  return duration;
}

export function nleProjectDuration(value: NleProject): ExactTemporalValue {
  assertNleProject(value);
  return nleCompositionDurationUnchecked(value);
}

export function findNleTrack(value: NleComposition, id: string): NleTrack {
  const track = value.tracks.find((candidate) => candidate.id === id);
  if (track === undefined) throw new Error(`Unknown NLE Track: ${id}`);
  return track;
}

export function findNleComponentValue(value: NleComposition, id: string): NleComponentValue {
  const resource = value.componentValues.find((candidate) => candidate.id === id);
  if (resource === undefined) throw new Error(`Unknown NLE Component Value: ${id}`);
  return resource;
}

export function findNlePictureLayout(value: NleComposition, id: string): NlePictureLayoutValue {
  const resource = value.pictureLayouts.find((candidate) => candidate.id === id);
  if (resource === undefined) throw new Error(`Unknown NLE Picture Layout: ${id}`);
  return resource;
}

export function resolveNlePictureLayout(
  project: NleComposition,
  value: NlePictureLayout | NlePictureLayoutReference,
): NlePictureLayout {
  return structuredClone(isPictureLayoutReference(value) ? findNlePictureLayout(project, value.ref).layout : value);
}

export function resolveNlePictureAppearance(
  project: NleComposition,
  value: NlePictureAppearance,
): NleResolvedPictureAppearance {
  return { ...structuredClone(value), layout: resolveNlePictureLayout(project, value.layout) };
}

export function resolveNleComponentSharedValue(
  project: NleComposition,
  item: NleComponentItem,
  slot: string,
): NleComponentValue {
  const reference = item.sharedValues?.find((candidate) => candidate.slot === slot);
  if (reference === undefined) throw new Error(`NLE Component Item ${item.id} has no shared value for slot ${slot}.`);
  const resource = findNleComponentValue(project, reference.ref);
  if (resource.slot !== slot || resource.component.name !== item.component.name
    || moduleKey(resource.component.module) !== moduleKey(item.component.module)) {
    throw new Error(`NLE Component Item ${item.id} shared value ${slot} belongs to another owner.`);
  }
  return structuredClone(resource);
}

export function findNleItem(value: NleComposition, id: string): { readonly track: NleTrack; readonly item: NleItem } {
  for (const track of value.tracks) {
    const item = track.items.find((candidate) => candidate.id === id);
    if (item !== undefined) return { track, item };
  }
  throw new Error(`Unknown NLE Item: ${id}`);
}
