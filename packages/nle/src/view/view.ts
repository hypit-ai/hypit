import type { TemporalRate } from "@hypit/temporal/algebra";
import type { NleProject } from "../types.js";
import {
  nleViewFormat,
  type NleEditGroup,
  type NleView,
  type NleViewProjectReference,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function onlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], label: string): void {
  const accepted = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !accepted.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  assert(unknown.length === 0, `${label} has unknown fields: ${unknown.join(", ")}.`);
  assert(missing.length === 0, `${label} is missing fields: ${missing.join(", ")}.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function text(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty text.`);
}

function portablePath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must be a portable relative path.`);
  const relative = value.startsWith("./") ? value.slice(2) : value;
  const parts = relative.split("/");
  assert(relative.length > 0 && parts.every((part) => part.length > 0 && part !== "."),
    `${label} must not contain empty or current segments.`);
  const firstOwned = parts.findIndex((part) => part !== "..");
  assert(firstOwned >= 0 && parts.slice(firstOwned).every((part) => part !== ".."),
    `${label} may contain parent segments only before its owned path.`);
}

function assertRate(value: unknown): asserts value is TemporalRate {
  record(value, "NLE View edit rate");
  onlyKeys(value, ["numerator", "denominator"], "NLE View edit rate");
  assert(Number.isSafeInteger(value.numerator) && (value.numerator as number) > 0,
    "NLE View edit-rate numerator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.denominator) && (value.denominator as number) > 0,
    "NLE View edit-rate denominator must be a positive safe integer.");
}

function assertProjectReference(value: unknown): asserts value is NleViewProjectReference {
  record(value, "NLE View Project reference");
  onlyKeys(value, ["path"], "NLE View Project reference");
  portablePath(value.path, "NLE View Project path");
}

function assertGroup(value: unknown, composition: string): asserts value is NleEditGroup {
  record(value, `NLE View Composition ${composition} Group`);
  onlyKeys(value, ["id", "name", "items"], `NLE View Composition ${composition} Group`);
  identity(value.id, `NLE View Composition ${composition} Group id`);
  text(value.name, `NLE View Group ${value.id}.name`);
  assert(Array.isArray(value.items) && value.items.length >= 2,
    `NLE View Group ${value.id} must contain at least two Items.`);
  const items = new Set<string>();
  for (const item of value.items) {
    identity(item, `NLE View Group ${value.id} Item`);
    assert(!items.has(item), `NLE View Group ${value.id} repeats Item ${item}.`);
    items.add(item);
  }
}

export function assertNleView(value: unknown): asserts value is NleView {
  record(value, "NLE View");
  onlyKeys(value, ["format", "id", "name", "project", "activeComposition", "editRate", "compositions"],
    "NLE View");
  assert(value.format === nleViewFormat, `Unsupported NLE View format: ${String(value.format)}.`);
  identity(value.id, "NLE View.id");
  text(value.name, "NLE View.name");
  assertProjectReference(value.project);
  identity(value.activeComposition, "NLE View.activeComposition");
  assertRate(value.editRate);
  assert(Array.isArray(value.compositions), "NLE View.compositions must be an array.");
  const compositionIds = new Set<string>();
  for (const state of value.compositions) {
    record(state, "NLE View Composition state");
    onlyKeys(state, ["composition", "tracks", "groups"], "NLE View Composition state");
    identity(state.composition, "NLE View Composition reference");
    assert(!compositionIds.has(state.composition),
      `NLE View repeats Composition state ${state.composition}.`);
    compositionIds.add(state.composition);

    assert(Array.isArray(state.tracks), `NLE View Composition ${state.composition}.tracks must be an array.`);
    const tracks = new Set<string>();
    for (const track of state.tracks) {
      record(track, `NLE View Composition ${state.composition} Track state`);
      onlyKeys(track, track.heightPx === undefined ? ["track", "locked"] : ["track", "locked", "heightPx"],
        `NLE View Composition ${state.composition} Track state`);
      identity(track.track, `NLE View Composition ${state.composition} Track reference`);
      assert(!tracks.has(track.track),
        `NLE View Composition ${state.composition} repeats Track ${track.track}.`);
      tracks.add(track.track);
      assert(typeof track.locked === "boolean", `NLE View Track ${track.track}.locked must be boolean.`);
      if (track.heightPx !== undefined) {
        assert(typeof track.heightPx === "number" && Number.isSafeInteger(track.heightPx)
          && track.heightPx >= 32 && track.heightPx <= 240,
          `NLE View Track ${track.track} height must be an integer from 32 through 240 pixels.`);
      }
    }

    assert(Array.isArray(state.groups), `NLE View Composition ${state.composition}.groups must be an array.`);
    const groups = new Set<string>();
    const grouped = new Set<string>();
    for (const group of state.groups) {
      assertGroup(group, state.composition as string);
      assert(!groups.has(group.id),
        `NLE View Composition ${state.composition} repeats Group ${group.id}.`);
      groups.add(group.id);
      for (const item of group.items) {
        assert(!grouped.has(item), `NLE View Item ${item} belongs to multiple Groups.`);
        grouped.add(item);
      }
    }
  }
}

export function assertNleViewForProject(view: NleView, project: NleProject): void {
  assertNleView(view);
  const active = project.compositions.find((composition) => composition.id === view.activeComposition);
  assert(active !== undefined,
    `NLE View active Composition ${view.activeComposition} does not exist in Project ${project.id}.`);
  for (const state of view.compositions) {
    const composition = project.compositions.find((candidate) => candidate.id === state.composition);
    assert(composition !== undefined,
      `NLE View references missing Composition ${state.composition}.`);
    const tracks = new Set(composition.tracks.map((track) => track.id));
    const items = new Set(composition.tracks.flatMap((track) => track.items.map((item) => item.id)));
    for (const track of state.tracks) {
      assert(tracks.has(track.track),
        `NLE View Composition ${state.composition} references missing Track ${track.track}.`);
    }
    for (const group of state.groups) {
      for (const item of group.items) {
        assert(items.has(item),
          `NLE View Group ${group.id} references missing Item ${item} in Composition ${state.composition}.`);
      }
    }
  }
}

export function sealNleView(value: NleView): NleView {
  assertNleView(value);
  return structuredClone(value);
}

export function createNleView(value: {
  readonly id: string;
  readonly name: string;
  readonly project: NleViewProjectReference;
  readonly activeComposition: string;
  readonly editRate?: TemporalRate;
  readonly tracks?: readonly string[];
}): NleView {
  return sealNleView({
    format: nleViewFormat,
    id: value.id,
    name: value.name,
    project: structuredClone(value.project),
    activeComposition: value.activeComposition,
    editRate: structuredClone(value.editRate ?? { numerator: 30, denominator: 1 }),
    compositions: value.tracks === undefined ? [] : [{
      composition: value.activeComposition,
      tracks: value.tracks.map((track) => ({ track, locked: false })),
      groups: [],
    }],
  });
}

export function readNleView(json: string): NleView {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`NLE View is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertNleView(value);
  return structuredClone(value);
}

export function serializeNleView(value: NleView): string {
  assertNleView(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function nleViewTrackLocked(
  view: NleView,
  composition: string,
  track: string,
): boolean {
  assertNleView(view);
  return view.compositions.find((state) => state.composition === composition)
    ?.tracks.find((state) => state.track === track)?.locked ?? false;
}

/**
 * Explicitly discard references made stale by an independently accepted Project edit.
 * This is a caller-selected owner mutation, never an implicit cross-file transaction.
 */
export function reconcileNleView(view: NleView, project: NleProject): NleView {
  assertNleView(view);
  const compositions = view.compositions.flatMap((state) => {
    const composition = project.compositions.find((candidate) => candidate.id === state.composition);
    if (composition === undefined) return [];
    const tracks = new Set(composition.tracks.map((track) => track.id));
    const items = new Set(composition.tracks.flatMap((track) => track.items.map((item) => item.id)));
    return [{
      composition: state.composition,
      tracks: state.tracks.filter((track) => tracks.has(track.track)),
      groups: state.groups.filter((group) => group.items.every((item) => items.has(item))),
    }];
  });
  const next: NleView = {
    ...view,
    activeComposition: project.compositions.some((composition) => composition.id === view.activeComposition)
      ? view.activeComposition
      : project.rootComposition,
    compositions,
  };
  assertNleViewForProject(next, project);
  return structuredClone(next);
}
