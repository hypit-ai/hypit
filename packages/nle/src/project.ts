import { assertImplementationBinding, assertPackageSymbol } from "./implementation.js";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
  type TemporalMapPiece,
} from "@hypit/temporal/algebra";
import { resolveNleProcessTime } from "./process-time.js";
import { assertNleTimeMapping, nleTimeMappingRequiredDuration } from "./source-time.js";
import { parseSvml, printSvml } from "./svml.js";
import {
  nleProjectFormat,
  type NleCanvas,
  type NleComponentItem,
  type NleComponentSharedValue,
  type NleComponentValueBinding,
  type NleComposition,
  type NleItem,
  type NleProcess,
  type NleOperatorSharedValue,
  type NleParameterBinding,
  type NlePictureLayout,
  type NlePictureLayoutReference,
  type NlePictureLayoutSharedValue,
  type NleProject,
  type NleSharedValue,
  type NleTimeMapping,
  type NleTrack,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function onlyKeys(value: object, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  assert(unknown.length === 0, `${label} contains unknown fields: ${unknown.join(", ")}.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function text(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty.`);
}

function assertTimeShape(value: unknown, label: string): void {
  record(value, label);
  onlyKeys(value, ["ticks", "timeBase"], label);
  record(value.timeBase, `${label}.timeBase`);
  onlyKeys(value.timeBase, ["numerator", "denominator"], `${label}.timeBase`);
  assertExactTemporalValue(value as ExactTemporalValue, label);
}

function assertRangeShape(value: unknown, label: string): void {
  record(value, label);
  onlyKeys(value, ["start", "end"], label);
  assertTimeShape(value.start, `${label}.start`);
  assertTimeShape(value.end, `${label}.end`);
}

function assertRateShape(value: unknown, label: string): void {
  record(value, label);
  onlyKeys(value, ["numerator", "denominator"], label);
  assert(Number.isSafeInteger(value.numerator), `${label}.numerator must be a safe integer.`);
  assert(Number.isSafeInteger(value.denominator) && (value.denominator as number) > 0,
    `${label}.denominator must be a positive safe integer.`);
}

function assertPieceShape(value: unknown, label: string): asserts value is TemporalMapPiece {
  record(value, label);
  const affine = Object.hasOwn(value, "rate");
  onlyKeys(value, affine
    ? ["target", "sourceAtStart", "rate", "wrap"]
    : ["target", "sourceAtStart", "sourceControl1", "sourceControl2", "sourceAtEnd"], label);
  assertRangeShape(value.target, `${label}.target`);
  assertTimeShape(value.sourceAtStart, `${label}.sourceAtStart`);
  if (affine) {
    assertRateShape(value.rate, `${label}.rate`);
    if (value.wrap !== undefined) assertRangeShape(value.wrap, `${label}.wrap`);
  } else {
    assertTimeShape(value.sourceControl1, `${label}.sourceControl1`);
    assertTimeShape(value.sourceControl2, `${label}.sourceControl2`);
    assertTimeShape(value.sourceAtEnd, `${label}.sourceAtEnd`);
  }
}

function assertNonNegativeTime(value: unknown, label: string): asserts value is ExactTemporalValue {
  assertTimeShape(value, label);
  assert(compareExactTemporalValues(value as ExactTemporalValue, exactTemporalZero()) >= 0,
    `${label} must not be negative.`);
}

function assertPositiveTime(value: unknown, label: string): asserts value is ExactTemporalValue {
  assertTimeShape(value, label);
  assert(compareExactTemporalValues(value as ExactTemporalValue, exactTemporalZero()) > 0,
    `${label} must be positive.`);
}

function assertCanvas(value: unknown): asserts value is NleCanvas {
  record(value, "NLE Canvas");
  onlyKeys(value, ["width", "height"], "NLE Canvas");
  assert(typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0,
    "NLE Canvas width must be finite and positive.");
  assert(typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0,
    "NLE Canvas height must be finite and positive.");
}

function assertLayout(value: unknown, label: string): asserts value is NlePictureLayout {
  record(value, label);
  onlyKeys(value, ["x", "y", "width", "height", "fit", "contentX", "contentY"], label);
  for (const name of ["x", "y", "width", "height"] as const) {
    assert(typeof value[name] === "number" && Number.isFinite(value[name]), `${label}.${name} must be finite.`);
  }
  assert((value.width as number) > 0 && (value.height as number) > 0, `${label} must have positive extent.`);
  assert(value.fit === "fill" || value.fit === "contain" || value.fit === "cover", `${label}.fit is invalid.`);
  for (const name of ["contentX", "contentY"] as const) {
    const coordinate = value[name];
    assert(coordinate === undefined || typeof coordinate === "number" && Number.isFinite(coordinate)
      && coordinate >= 0 && coordinate <= 1, `${label}.${name} must lie between zero and one.`);
  }
}

function assertMediaReference(value: unknown, label: string): void {
  record(value, label);
  onlyKeys(value, ["path"], label);
  text(value.path, `${label}.path`);
  const path = value.path as string;
  assert(!path.includes("\\") && !path.startsWith("/") && !/^[A-Za-z]:/u.test(path),
    `${label}.path must be portable and relative.`);
  const relative = path.startsWith("./") ? path.slice(2) : path;
  const parts = relative.split("/");
  assert(relative.length > 0 && parts.every((part) => part.length > 0 && part !== "."),
    `${label}.path contains an empty or current segment.`);
  const firstOwned = parts.findIndex((part) => part !== "..");
  assert(firstOwned >= 0 && parts.slice(firstOwned).every((part) => part !== ".."),
    `${label}.path may contain parent segments only before its owned path.`);
}

function assertSharedValue(value: unknown, ids: Set<string>): asserts value is NleSharedValue {
  record(value, "NLE Shared Value");
  onlyKeys(value, ["id", "name", "declaration", "value"], "NLE Shared Value");
  identity(value.id, "NLE Shared Value.id");
  assert(!ids.has(value.id), `NLE Project repeats Shared Value ${value.id}.`);
  ids.add(value.id);
  text(value.name, `NLE Shared Value ${value.id}.name`);
  record(value.declaration, `NLE Shared Value ${value.id}.declaration`);
  if (value.declaration.kind === "component") {
    onlyKeys(value.declaration, ["kind", "component", "slot"],
      `NLE Shared Value ${value.id}.declaration`);
    record(value.declaration.component, `NLE Shared Value ${value.id}.declaration.component`);
    onlyKeys(value.declaration.component, ["package", "symbol"],
      `NLE Shared Value ${value.id}.declaration.component`);
    assertPackageSymbol(value.declaration.component as NleComponentSharedValue["declaration"]["component"],
      `NLE Shared Value ${value.id}.declaration.component`);
    identity(value.declaration.slot, `NLE Shared Value ${value.id}.declaration.slot`);
    record(value.value, `NLE Shared Value ${value.id}.value`);
    assertImplementationBinding({
      implementation: value.declaration.component as NleComponentSharedValue["declaration"]["component"],
      parameters: value.value,
    }, `NLE Shared Value ${value.id}`);
    return;
  }
  if (value.declaration.kind === "operator") {
    onlyKeys(value.declaration, ["kind", "operator"],
      `NLE Shared Value ${value.id}.declaration`);
    record(value.declaration.operator, `NLE Shared Value ${value.id}.declaration.operator`);
    onlyKeys(value.declaration.operator, ["package", "symbol"],
      `NLE Shared Value ${value.id}.declaration.operator`);
    assertPackageSymbol(value.declaration.operator as NleOperatorSharedValue["declaration"]["operator"],
      `NLE Shared Value ${value.id}.declaration.operator`);
    record(value.value, `NLE Shared Value ${value.id}.value`);
    assertImplementationBinding({
      implementation: value.declaration.operator as NleOperatorSharedValue["declaration"]["operator"],
      parameters: value.value,
    }, `NLE Shared Value ${value.id}`);
    return;
  }
  assert(value.declaration.kind === "nle", `NLE Shared Value ${value.id}.declaration.kind is invalid.`);
  onlyKeys(value.declaration, ["kind", "slot"], `NLE Shared Value ${value.id}.declaration`);
  assert(value.declaration.slot === "picture.layout",
    `NLE Shared Value ${value.id} has unknown NLE slot ${String(value.declaration.slot)}.`);
  assertLayout(value.value, `NLE Shared Value ${value.id}.value`);
}

function assertParameterBinding(
  value: unknown,
  operator: NleProcess["operator"],
  label: string,
): asserts value is NleParameterBinding {
  record(value, label);
  if (value.kind === "inline") {
    onlyKeys(value, ["kind", "value"], label);
    record(value.value, `${label}.value`);
    assertImplementationBinding({ implementation: operator, parameters: value.value }, label);
    return;
  }
  assert(value.kind === "shared", `${label}.kind is invalid.`);
  onlyKeys(value, ["kind", "ref"], label);
  identity(value.ref, `${label}.ref`);
}

function assertTimeMapping(value: unknown, duration: ExactTemporalValue, label: string): void {
  record(value, label);
  onlyKeys(value, ["pieces"], label);
  assert(Array.isArray(value.pieces), `${label}.pieces must be an array.`);
  for (const [index, piece] of value.pieces.entries()) assertPieceShape(piece, `${label}.pieces[${index}]`);
  assertNleTimeMapping(value as NleTimeMapping, duration, label);
}

function assertProcesses(value: unknown, duration: ExactTemporalValue, label: string): void {
  assert(Array.isArray(value), `${label} must be an array.`);
  const ids = new Set<string>();
  for (const process of value) {
    record(process, `${label} Process`);
    onlyKeys(process, ["id", "operator", "enabled", "parameters", "controlTime"],
      `${label} Process`);
    identity(process.id, `${label} Process.id`);
    assert(!ids.has(process.id), `${label} repeats Process ${process.id}.`);
    ids.add(process.id);
    record(process.operator, `${label} Process ${process.id}.operator`);
    onlyKeys(process.operator, ["package", "symbol"],
      `${label} Process ${process.id}.operator`);
    assertPackageSymbol(process.operator as NleProcess["operator"],
      `${label} Process ${process.id}.operator`);
    assert(typeof process.enabled === "boolean",
      `${label} Process ${process.id}.enabled must be boolean.`);
    assertParameterBinding(process.parameters,
      process.operator as NleProcess["operator"],
      `${label} Process ${process.id}.parameters`);
    assertProcessTime(process.controlTime, duration,
      `${label} Process ${process.id}.controlTime`);
  }
}

function assertProcessTime(value: unknown, duration: ExactTemporalValue, label: string): void {
  record(value, label);
  if (Object.hasOwn(value, "edge")) {
    onlyKeys(value, ["edge", "duration", "controlDuration"], label);
    assert(value.edge === "start" || value.edge === "end", `${label}.edge must be start or end.`);
    assertPositiveTime(value.duration, `${label}.duration`);
    assertPositiveTime(value.controlDuration, `${label}.controlDuration`);
    resolveNleProcessTime({ edge: value.edge, duration: value.duration, controlDuration: value.controlDuration }, duration);
    return;
  }
  onlyKeys(value, ["pieces", "controlDuration"], label);
  const mapping = { pieces: value.pieces };
  assertTimeMapping(mapping, duration, label);
  if (value.controlDuration === undefined) return;
  assertPositiveTime(value.controlDuration, `${label}.controlDuration`);
  assert(compareExactTemporalValues(nleTimeMappingRequiredDuration(mapping as NleTimeMapping), value.controlDuration) <= 0,
    `${label} reads beyond its Control duration.`);
}

function assertPictureAppearance(
  value: unknown,
  media: boolean,
  duration: ExactTemporalValue,
  label: string,
): void {
  record(value, label);
  onlyKeys(value, media ? ["layout", "reconstruction", "processes"] : ["layout", "processes"], label);
  record(value.layout, `${label}.layout`);
  if (Object.hasOwn(value.layout, "ref")) {
    onlyKeys(value.layout, ["ref"], `${label}.layout`);
    identity(value.layout.ref, `${label}.layout.ref`);
  } else assertLayout(value.layout, `${label}.layout`);
  if (value.reconstruction !== undefined) {
    record(value.reconstruction, `${label}.reconstruction`);
    onlyKeys(value.reconstruction, ["using", "parameters"], `${label}.reconstruction`);
    record(value.reconstruction.using, `${label}.reconstruction.using`);
    onlyKeys(value.reconstruction.using, ["package", "symbol"], `${label}.reconstruction.using`);
    assertPackageSymbol(value.reconstruction.using as NleProcess["operator"],
      `${label}.reconstruction.using`);
    record(value.reconstruction.parameters, `${label}.reconstruction.parameters`);
    assertImplementationBinding({
      implementation: value.reconstruction.using as NleProcess["operator"],
      parameters: value.reconstruction.parameters,
    }, `${label}.reconstruction`);
  }
  assertProcesses(value.processes ?? [], duration, `${label}.processes`);
}

function assertItem(value: unknown, track: NleTrack, ids: Set<string>): asserts value is NleItem {
  record(value, `NLE Item on Track ${track.id}`);
  const label = `NLE Item ${String(value.id)}`;
  const common = ["id", "name", "kind", "start", "duration", "enabled"];
  assert(value.kind === "present" || value.kind === "adjust", `${label}.kind is invalid.`);
  if (value.kind === "adjust") {
    onlyKeys(value, [...common, "operator", "parameters", "controlTime"], label);
  } else {
    assert(value.source === "media" || value.source === "component" || value.source === "composition",
      `${label}.source is invalid.`);
    const present = [...common, "source", "sourceTime", "picture"];
    onlyKeys(value, value.source === "media"
      ? [...present, "asset", "audio"]
      : value.source === "component"
        ? [...present, "component", "role", "valueBindings", "parameters", "media"]
        : [...present, "composition", "audio"], label);
  }
  if (value.role !== undefined) {
    assert(value.role === "subtitle", `${label}.role is invalid.`);
  }
  const subtitle = value.kind === "present" && value.source === "component" && value.role === "subtitle";
  assert(subtitle === (track.role === "subtitle"),
    `${label} must use a Track with a matching subtitle role.`);
  identity(value.id, `${label}.id`);
  assert(!ids.has(value.id), `NLE Project repeats Item ${value.id}.`);
  ids.add(value.id);
  if (value.name !== undefined) text(value.name, `${label}.name`);
  assertNonNegativeTime(value.start, `${label}.start`);
  assertPositiveTime(value.duration, `${label}.duration`);
  assert(typeof value.enabled === "boolean", `${label}.enabled must be boolean.`);
  if (value.kind === "adjust") {
    record(value.operator, `${label}.operator`);
    onlyKeys(value.operator, ["package", "symbol"], `${label}.operator`);
    assertPackageSymbol(value.operator as NleProcess["operator"], `${label}.operator`);
    assertParameterBinding(value.parameters, value.operator as NleProcess["operator"],
      `${label}.parameters`);
    assertTimeMapping(value.controlTime, value.duration as ExactTemporalValue, `${label}.controlTime`);
    return;
  }
  assertTimeMapping(value.sourceTime, value.duration as ExactTemporalValue, `${label}.sourceTime`);
  if (value.picture !== undefined) {
    assertPictureAppearance(value.picture, value.source === "media", value.duration as ExactTemporalValue, `${label}.picture`);
  }
  if (value.audio !== undefined) {
    record(value.audio, `${label}.audio`);
    onlyKeys(value.audio, ["processes"], `${label}.audio`);
    assertProcesses(value.audio.processes ?? [], value.duration as ExactTemporalValue, `${label}.audio.processes`);
  }
  if (track.kind === "picture") {
    assert(value.picture !== undefined, `${label} on Picture Track ${track.id} has no Picture appearance.`);
  } else {
    assert(value.picture === undefined, `${label} on Audio Track ${track.id} has a Picture appearance.`);
    assert(value.audio !== undefined, `${label} on Audio Track ${track.id} has no Audio appearance.`);
  }
  if (value.source === "media") {
    assertMediaReference(value.asset, `${label}.asset`);
  } else if (value.source === "component") {
    record(value.component, `${label}.component`);
    onlyKeys(value.component, ["package", "symbol"], `${label}.component`);
    assertPackageSymbol(value.component as NleComponentItem["component"], `${label}.component`);
    record(value.parameters, `${label}.parameters`);
    assertImplementationBinding({
      implementation: value.component as NleComponentItem["component"],
      parameters: value.parameters,
    }, label);
    if (value.valueBindings !== undefined) {
      assert(Array.isArray(value.valueBindings), `${label}.valueBindings must be an array.`);
      const slots = new Set<string>();
      for (const binding of value.valueBindings) {
        record(binding, `${label}.valueBindings entry`);
        identity(binding.slot, `${label}.valueBindings slot`);
        assert(binding.kind === "inline" || binding.kind === "shared",
          `${label}.valueBindings ${binding.slot}.kind is invalid.`);
        if (binding.kind === "inline") {
          onlyKeys(binding, ["slot", "kind", "value"], `${label}.valueBindings entry`);
          record(binding.value, `${label}.valueBindings ${binding.slot}.value`);
          assertImplementationBinding({
            implementation: value.component as NleComponentItem["component"],
            parameters: binding.value,
          }, `${label}.valueBindings ${binding.slot}`);
        } else {
          onlyKeys(binding, ["slot", "kind", "ref"], `${label}.valueBindings entry`);
          identity(binding.ref, `${label}.valueBindings ${binding.slot}.ref`);
        }
        assert(!slots.has(binding.slot), `${label} repeats value slot ${binding.slot}.`);
        slots.add(binding.slot);
      }
    }
    if (value.media !== undefined) {
      record(value.media, `${label}.media`);
      for (const [input, reference] of Object.entries(value.media)) {
        identity(input, `${label}.media input`);
        assertMediaReference(reference, `${label}.media.${input}`);
      }
    }
  } else {
    identity(value.composition, `${label}.composition`);
  }
}

function assertTrack(value: unknown, trackIds: Set<string>, itemIds: Set<string>): asserts value is NleTrack {
  record(value, "NLE Track");
  onlyKeys(value, ["id", "name", "kind", "role", "enabled", "items"], "NLE Track");
  identity(value.id, "NLE Track.id");
  assert(!trackIds.has(value.id), `NLE Composition repeats Track ${value.id}.`);
  trackIds.add(value.id);
  text(value.name, `NLE Track ${value.id}.name`);
  assert(value.kind === "picture" || value.kind === "audio", `NLE Track ${value.id}.kind is invalid.`);
  assert(value.role === undefined || value.role === "effect"
    || value.kind === "picture" && (value.role === "subtitle" || value.role === "text"),
    `NLE Track ${value.id}.role is invalid for its Track kind.`);
  assert(typeof value.enabled === "boolean", `NLE Track ${value.id}.enabled must be boolean.`);
  assert(Array.isArray(value.items), `NLE Track ${value.id}.items must be an array.`);
  for (const item of value.items) assertItem(item, value as unknown as NleTrack, itemIds);
}

function assertRelationBinding(
  operator: unknown,
  parameters: unknown,
  label: string,
): void {
  record(operator, `${label}.operator`);
  onlyKeys(operator, ["package", "symbol"], `${label}.operator`);
  assertPackageSymbol(operator as NleProcess["operator"], `${label}.operator`);
  record(parameters, `${label}.parameters`);
  assertImplementationBinding({
    implementation: operator as NleProcess["operator"],
    parameters,
  }, label);
}

function assertRelations(composition: NleComposition, itemIds: Set<string>): void {
  const located = new Map<string, { readonly track: NleTrack; readonly item: NleItem }>();
  for (const track of composition.tracks) {
    for (const item of track.items) located.set(item.id, { track, item });
  }
  const identities = new Set(itemIds);
  const addIdentity: (id: unknown, label: string) => asserts id is string = (id, label) => {
    identity(id, label);
    assert(!identities.has(id), `${label} ${id} is duplicated in the NLE Project.`);
    identities.add(id);
  };

  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  for (const value of composition.transitions) {
    record(value, "NLE Transition");
    onlyKeys(value, ["id", "outgoing", "incoming", "operator", "parameters"], "NLE Transition");
    addIdentity(value.id, "NLE Transition id");
    identity(value.outgoing, `NLE Transition ${value.id}.outgoing`);
    identity(value.incoming, `NLE Transition ${value.id}.incoming`);
    const left = located.get(value.outgoing);
    const right = located.get(value.incoming);
    assert(left !== undefined && right !== undefined, `NLE Transition ${value.id} references a missing Item.`);
    assert(left.track.id === right.track.id && left.track.kind === "picture",
      `NLE Transition ${value.id} Items must belong to one Picture Track.`);
    assert(left.item.kind === "present" && right.item.kind === "present",
      `NLE Transition ${value.id} requires Present Items.`);
    assert(left.item.enabled && right.item.enabled, `NLE Transition ${value.id} cannot use a disabled Item.`);
    assert(!outgoing.has(left.item.id), `NLE Item ${left.item.id} has multiple outgoing Transitions.`);
    assert(!incoming.has(right.item.id), `NLE Item ${right.item.id} has multiple incoming Transitions.`);
    outgoing.add(left.item.id);
    incoming.add(right.item.id);
    const leftEnd = addExactTemporalValues(left.item.start, left.item.duration);
    const rightEnd = addExactTemporalValues(right.item.start, right.item.duration);
    assert(compareExactTemporalValues(left.item.start, right.item.start) < 0
      && compareExactTemporalValues(right.item.start, leftEnd) < 0
      && compareExactTemporalValues(leftEnd, rightEnd) < 0,
    `NLE Transition ${value.id} requires a canonical outgoing/incoming overlap.`);
    assertRelationBinding(value.operator, value.parameters, `NLE Transition ${value.id}`);
  }
  for (const item of located.keys()) {
    const before = composition.transitions.find((value) => value.incoming === item);
    const after = composition.transitions.find((value) => value.outgoing === item);
    if (before === undefined || after === undefined) continue;
    const beforeOutgoing = located.get(before.outgoing)!.item;
    const afterIncoming = located.get(after.incoming)!.item;
    assert(compareExactTemporalValues(nleItemEnd(beforeOutgoing), afterIncoming.start) <= 0,
      `NLE Transition chain leaves Item ${item} with overlapping transition ranges.`);
  }
  const matteByContent = new Map<string, string>();
  const matteSources = new Set<string>();
  for (const value of composition.mattes) {
    record(value, "NLE Matte");
    onlyKeys(value, ["id", "content", "matte", "operator", "parameters"], "NLE Matte");
    addIdentity(value.id, "NLE Matte id");
    identity(value.content, `NLE Matte ${value.id}.content`);
    identity(value.matte, `NLE Matte ${value.id}.matte`);
    const content = located.get(value.content);
    const source = located.get(value.matte);
    assert(content !== undefined && source !== undefined, `NLE Matte ${value.id} references a missing Item.`);
    assert(content.track.kind === "picture" && source.track.kind === "picture",
      `NLE Matte ${value.id} requires Picture Items.`);
    assert(content.item.kind === "present" && source.item.kind === "present",
      `NLE Matte ${value.id} requires Present Items.`);
    assert(content.item.enabled && source.item.enabled, `NLE Matte ${value.id} cannot use a disabled Item.`);
    assert(content.item.id !== source.item.id, `NLE Matte ${value.id} cannot sample itself.`);
    assert(!matteByContent.has(content.item.id), `NLE Item ${content.item.id} has multiple Mattes.`);
    assert(compareExactTemporalValues(source.item.start, content.item.start) <= 0
      && compareExactTemporalValues(nleItemEnd(source.item), nleItemEnd(content.item)) >= 0,
    `NLE Matte ${value.id} does not cover content Item ${content.item.id}.`);
    assertRelationBinding(value.operator, value.parameters, `NLE Matte ${value.id}`);
    matteByContent.set(content.item.id, source.item.id);
    matteSources.add(source.item.id);
  }
  for (const value of composition.transitions) {
    assert(!matteSources.has(value.outgoing) && !matteSources.has(value.incoming),
      `NLE Transition ${value.id} cannot consume an Item used as a Matte source.`);
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
}

export function assertNleProject(value: unknown): asserts value is NleProject {
  record(value, "NLE Project");
  onlyKeys(value, ["format", "id", "name", "rootComposition", "sharedValues", "compositions"],
    "NLE Project");
  assert(value.format === nleProjectFormat, `Unsupported NLE Project format: ${String(value.format)}.`);
  identity(value.id, "NLE Project.id");
  text(value.name, "NLE Project.name");
  identity(value.rootComposition, "NLE Project.rootComposition");
  assert(Array.isArray(value.sharedValues), "NLE Project.sharedValues must be an array.");
  const sharedValueIds = new Set<string>();
  for (const sharedValue of value.sharedValues) assertSharedValue(sharedValue, sharedValueIds);
  assert(Array.isArray(value.compositions) && value.compositions.length > 0,
    "NLE Project.compositions must be a non-empty array.");
  const compositionIds = new Set<string>();
  const trackIds = new Set<string>();
  const itemIds = new Set<string>();
  const relationIds = new Set<string>();
  for (const candidate of value.compositions) {
    record(candidate, "NLE Composition");
    onlyKeys(candidate, ["id", "name", "canvas", "tracks", "transitions", "mattes"], "NLE Composition");
    identity(candidate.id, "NLE Composition.id");
    assert(!compositionIds.has(candidate.id), `NLE Project repeats Composition ${candidate.id}.`);
    compositionIds.add(candidate.id);
    text(candidate.name, `NLE Composition ${candidate.id}.name`);
    assertCanvas(candidate.canvas);
    assert(Array.isArray(candidate.tracks), `NLE Composition ${candidate.id}.tracks must be an array.`);
    assert(Array.isArray(candidate.transitions), `NLE Composition ${candidate.id}.transitions must be an array.`);
    assert(Array.isArray(candidate.mattes), `NLE Composition ${candidate.id}.mattes must be an array.`);
    const beforeItems = new Set(itemIds);
    for (const track of candidate.tracks) assertTrack(track, trackIds, itemIds);
    const localItemIds = new Set([...itemIds].filter((id) => !beforeItems.has(id)));
    assertRelations(candidate as unknown as NleComposition, localItemIds);
    for (const relation of [...candidate.transitions, ...candidate.mattes]) {
      assert(!relationIds.has(relation.id), `NLE Project repeats relation ${relation.id}.`);
      relationIds.add(relation.id);
    }
  }
  assert(compositionIds.has(value.rootComposition),
    `NLE Project root Composition ${value.rootComposition} does not exist.`);
  const sharedValues = new Map((value.sharedValues as unknown as readonly NleSharedValue[])
    .map((sharedValue) => [sharedValue.id, sharedValue] as const));
  for (const composition of value.compositions as unknown as readonly NleComposition[]) {
    for (const track of composition.tracks) {
      for (const item of track.items) {
        if (item.kind !== "present" || item.source !== "component") continue;
        for (const binding of item.valueBindings ?? []) {
          if (binding.kind === "inline") continue;
          const sharedValue = sharedValues.get(binding.ref);
          assert(sharedValue !== undefined,
            `NLE Item ${item.id} slot ${binding.slot} references missing Shared Value ${binding.ref}.`);
          assert(sharedValue.declaration.kind === "component",
            `NLE Item ${item.id} slot ${binding.slot} references non-Component Shared Value ${binding.ref}.`);
          assert(sharedValue.declaration.slot === binding.slot,
            `NLE Item ${item.id} slot ${binding.slot} references Shared Value ${binding.ref} for slot ${sharedValue.declaration.slot}.`);
          assert(sharedValue.declaration.component.package === item.component.package
            && sharedValue.declaration.component.symbol === item.component.symbol,
          `NLE Item ${item.id} references Shared Value ${binding.ref} owned by another Component.`);
        }
      }
    }
  }
  const assertOperatorParameterReference = (
    process: NleProcess,
    label: string,
  ): void => {
    if (process.parameters.kind !== "shared") return;
    const sharedValue = sharedValues.get(process.parameters.ref);
    assert(sharedValue !== undefined,
      `${label} references missing Shared Value ${process.parameters.ref}.`);
    assert(sharedValue.declaration.kind === "operator",
      `${label} references a non-Operator Shared Value ${process.parameters.ref}.`);
    assert(sharedValue.declaration.operator.package === process.operator.package
      && sharedValue.declaration.operator.symbol === process.operator.symbol,
    `${label} references Shared Value ${process.parameters.ref} owned by another Operator.`);
  };
  for (const composition of value.compositions as unknown as readonly NleComposition[]) {
    for (const track of composition.tracks) {
      for (const item of track.items) {
        if (item.kind === "adjust") {
          assertOperatorParameterReference(item, `NLE Adjust ${item.id}`);
          continue;
        }
        for (const process of item.picture?.processes ?? []) {
          assertOperatorParameterReference(process,
            `NLE Item ${item.id} Picture Process ${process.id}`);
        }
        for (const process of item.audio?.processes ?? []) {
          assertOperatorParameterReference(process,
            `NLE Item ${item.id} Audio Process ${process.id}`);
        }
      }
    }
  }
  for (const composition of value.compositions as unknown as readonly NleComposition[]) {
    for (const track of composition.tracks) {
      for (const item of track.items) {
        if (item.kind !== "present" || item.picture === undefined || !("ref" in item.picture.layout)) continue;
        const sharedValue = sharedValues.get(item.picture.layout.ref);
        assert(sharedValue !== undefined,
          `NLE Item ${item.id} references missing Shared Value ${item.picture.layout.ref}.`);
        assert(sharedValue.declaration.kind === "nle" && sharedValue.declaration.slot === "picture.layout",
          `NLE Item ${item.id} Picture layout references incompatible Shared Value ${item.picture.layout.ref}.`);
      }
    }
  }
  const references = new Map<string, readonly string[]>();
  for (const composition of value.compositions as unknown as readonly NleComposition[]) {
    const targets: string[] = [];
    for (const track of composition.tracks) {
      for (const item of track.items) {
        if (item.kind !== "present" || item.source !== "composition") continue;
        assert(compositionIds.has(item.composition),
          `NLE Item ${item.id} references missing Composition ${item.composition}.`);
        const source = (value.compositions as unknown as readonly NleComposition[])
          .find((candidate) => candidate.id === item.composition)!;
        const sourceDuration = nleCompositionDuration(source);
        sealTemporalMap({ stages: [{
          target: sealLocalTemporalDomain({ id: `${item.id}:time`, duration: item.duration }),
          source: sealLocalTemporalDomain({ id: `${source.id}:time`, duration: sourceDuration }),
          pieces: structuredClone(item.sourceTime.pieces),
        }] });
        targets.push(item.composition);
      }
    }
    references.set(composition.id, targets);
  }
  for (const id of relationIds) {
    assert(!itemIds.has(id), `NLE relation ${id} duplicates an Item id in the NLE Project.`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (visiting.has(id)) throw new Error(`NLE Composition references contain a cycle: ${[...path, id].join(" -> ")}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of references.get(id) ?? []) visit(target, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of compositionIds) visit(id, []);
}

export function sealNleProject(value: NleProject): NleProject {
  assertNleProject(value);
  return structuredClone(value);
}

export function createNleProject(value: {
  readonly id: string;
  readonly name: string;
  readonly compositionId?: string;
  readonly canvas: NleCanvas;
}): NleProject {
  const compositionId = value.compositionId ?? `${value.id}:composition`;
  return sealNleProject({
    format: nleProjectFormat,
    id: value.id,
    name: value.name,
    rootComposition: compositionId,
    sharedValues: [],
    compositions: [{
      id: compositionId,
      name: value.name,
      canvas: structuredClone(value.canvas),
      tracks: [],
      transitions: [],
      mattes: [],
    }],
  });
}

export function readNleProject(source: string): NleProject {
  const value = parseSvml(source);
  assertNleProject(value);
  return structuredClone(value);
}

export function serializeNleProject(value: NleProject): string {
  assertNleProject(value);
  return printSvml(value);
}

export function nleItemEnd(value: NleItem): ExactTemporalValue {
  return addExactTemporalValues(value.start, value.duration);
}

export function findNleComposition(value: NleProject, id: string): NleComposition {
  const composition = value.compositions.find((candidate) => candidate.id === id);
  assert(composition !== undefined, `Unknown NLE Composition: ${id}.`);
  return composition;
}

export function rootNleComposition(value: NleProject): NleComposition {
  return findNleComposition(value, value.rootComposition);
}

export function findNleSharedValue(value: NleProject, id: string): NleSharedValue {
  const sharedValue = value.sharedValues.find((candidate) => candidate.id === id);
  assert(sharedValue !== undefined, `Unknown NLE Shared Value: ${id}.`);
  return sharedValue;
}

export function findNleComponentSharedValue(value: NleProject, id: string): NleComponentSharedValue {
  const sharedValue = findNleSharedValue(value, id);
  assert(sharedValue.declaration.kind === "component", `NLE Shared Value ${id} is not a Component value.`);
  return sharedValue as NleComponentSharedValue;
}

export function resolveNleComponentValue(
  project: NleProject,
  component: NleComponentItem["component"],
  binding: NleComponentValueBinding,
): Readonly<Record<string, unknown>> {
  if (binding.kind === "inline") return structuredClone(binding.value);
  const sharedValue = findNleComponentSharedValue(project, binding.ref);
  assert(sharedValue.declaration.slot === binding.slot,
    `NLE Component slot ${binding.slot} references Shared Value ${binding.ref} for slot ${sharedValue.declaration.slot}.`);
  assert(sharedValue.declaration.component.package === component.package
    && sharedValue.declaration.component.symbol === component.symbol,
  `NLE Shared Value ${binding.ref} belongs to another Component.`);
  return structuredClone(sharedValue.value);
}

export function findNlePictureLayoutSharedValue(value: NleProject, id: string): NlePictureLayoutSharedValue {
  const sharedValue = findNleSharedValue(value, id);
  assert(sharedValue.declaration.kind === "nle" && sharedValue.declaration.slot === "picture.layout",
    `NLE Shared Value ${id} is not a Picture layout.`);
  return sharedValue as NlePictureLayoutSharedValue;
}

export function findNleOperatorSharedValue(value: NleProject, id: string): NleOperatorSharedValue {
  const sharedValue = findNleSharedValue(value, id);
  assert(sharedValue.declaration.kind === "operator", `NLE Shared Value ${id} is not an Operator value.`);
  return sharedValue as NleOperatorSharedValue;
}

export function resolveNleOperatorParameters(
  value: NleProject,
  operator: NleProcess["operator"],
  parameters: NleParameterBinding,
): Readonly<Record<string, unknown>> {
  if (parameters.kind === "inline") return structuredClone(parameters.value);
  const sharedValue = findNleOperatorSharedValue(value, parameters.ref);
  assert(sharedValue.declaration.operator.package === operator.package
    && sharedValue.declaration.operator.symbol === operator.symbol,
  `NLE Shared Value ${parameters.ref} belongs to another Operator.`);
  return structuredClone(sharedValue.value);
}

export function resolveNlePictureLayout(
  value: NleProject,
  layout: NlePictureLayout | NlePictureLayoutReference,
): NlePictureLayout {
  return structuredClone("ref" in layout ? findNlePictureLayoutSharedValue(value, layout.ref).value : layout);
}

export function nleCompositionDuration(value: NleComposition): ExactTemporalValue {
  let duration = exactTemporalZero();
  for (const track of value.tracks) {
    for (const item of track.items) {
      const end = nleItemEnd(item);
      if (compareExactTemporalValues(end, duration) > 0) duration = end;
    }
  }
  return structuredClone(duration);
}

/** Project envelope duration includes disabled author material; enablement changes signal, not edit extent. */
export function nleProjectDuration(value: NleProject): ExactTemporalValue {
  assertNleProject(value);
  return nleCompositionDuration(rootNleComposition(value));
}
