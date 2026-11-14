import type { NleProject } from "@hypit/nle";
import type { TemporalRate } from "@hypit/temporal/algebra";

import type {
  NleTimelineGroup,
  NleTimelineProjectReference,
  NleTimelineView,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], label: string): void {
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} must contain only ${keys.join(", ")}.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
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

function assertRate(value: TemporalRate): void {
  object(value, "NLE Timeline edit rate");
  exactKeys(value, ["numerator", "denominator"], "NLE Timeline edit rate");
  assert(Number.isSafeInteger(value.numerator) && value.numerator > 0,
    "NLE Timeline edit-rate numerator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.denominator) && value.denominator > 0,
    "NLE Timeline edit-rate denominator must be a positive safe integer.");
}

function assertProjectReference(value: NleTimelineProjectReference): void {
  object(value, "NLE Timeline Project reference");
  exactKeys(value, ["path"], "NLE Timeline Project reference");
  portablePath(value.path, "NLE Timeline Project path");
}

function assertGroup(value: NleTimelineGroup): void {
  object(value, "NLE Timeline Group");
  exactKeys(value, ["id", "name", "items"], "NLE Timeline Group");
  identity(value.id, "NLE Timeline Group id");
  assert(typeof value.name === "string" && value.name.trim().length > 0,
    `NLE Timeline Group ${value.id} name is empty.`);
  assert(Array.isArray(value.items) && value.items.length >= 2,
    `NLE Timeline Group ${value.id} must contain at least two Items.`);
  const items = new Set<string>();
  for (const item of value.items) {
    identity(item, `NLE Timeline Group ${value.id} Item`);
    assert(!items.has(item), `NLE Timeline Group ${value.id} repeats Item ${item}.`);
    items.add(item);
  }
}

export function assertNleTimelineView(value: NleTimelineView): void {
  object(value, "NLE Timeline View");
  exactKeys(value, ["format", "id", "name", "revision", "project", "editRate", "tracks", "groups"],
    "NLE Timeline View");
  assert(value.format === "hypit.nle-view@1", "Unsupported NLE Timeline View format.");
  identity(value.id, "NLE Timeline View id");
  assert(typeof value.name === "string" && value.name.trim().length > 0, "NLE Timeline View name is empty.");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "NLE Timeline View revision must be a non-negative safe integer.");
  assertProjectReference(value.project);
  assertRate(value.editRate);
  assert(Array.isArray(value.tracks), "NLE Timeline View Tracks are invalid.");
  const tracks = new Set<string>();
  for (const state of value.tracks) {
    object(state, "NLE Timeline Track state");
    exactKeys(state, state.heightPx === undefined
      ? ["track", "locked"] : ["track", "locked", "heightPx"], "NLE Timeline Track state");
    identity(state.track, "NLE Timeline Track reference");
    assert(typeof state.locked === "boolean", `NLE Timeline Track ${state.track} lock is invalid.`);
    const heightPx = state.heightPx;
    if (heightPx !== undefined) {
      assert(typeof heightPx === "number" && Number.isSafeInteger(heightPx) && heightPx >= 32 && heightPx <= 240,
        `NLE Timeline Track ${state.track} height must be an integer from 32 through 240 pixels.`);
    }
    assert(!tracks.has(state.track), `NLE Timeline View repeats Track ${state.track}.`);
    tracks.add(state.track);
  }
  assert(Array.isArray(value.groups), "NLE Timeline View Groups are invalid.");
  const groups = new Set<string>();
  const grouped = new Set<string>();
  for (const group of value.groups) {
    assertGroup(group);
    assert(!groups.has(group.id), `NLE Timeline View repeats Group ${group.id}.`);
    groups.add(group.id);
    for (const item of group.items) {
      assert(!grouped.has(item), `NLE Timeline Item ${item} belongs to multiple Groups.`);
      grouped.add(item);
    }
  }
}

export function assertNleTimelineViewForProject(view: NleTimelineView, project: NleProject): void {
  assertNleTimelineView(view);
  const tracks = new Set(project.tracks.map((track) => track.id));
  const items = new Set(project.tracks.flatMap((track) => track.items.map((item) => item.id)));
  for (const state of view.tracks) {
    assert(tracks.has(state.track), `NLE Timeline View references missing Track ${state.track}.`);
  }
  for (const group of view.groups) {
    for (const item of group.items) {
      assert(items.has(item), `NLE Timeline Group ${group.id} references missing Item ${item}.`);
    }
  }
}

export function sealNleTimelineView(value: NleTimelineView): NleTimelineView {
  assertNleTimelineView(value);
  return structuredClone(value);
}

export function createNleTimelineView(input: {
  readonly id: string;
  readonly name: string;
  readonly project: NleTimelineProjectReference;
  readonly editRate?: TemporalRate;
  readonly tracks?: readonly string[];
}): NleTimelineView {
  return sealNleTimelineView({
    format: "hypit.nle-view@1",
    id: input.id,
    name: input.name,
    revision: 0,
    project: structuredClone(input.project),
    editRate: structuredClone(input.editRate ?? { numerator: 30, denominator: 1 }),
    tracks: (input.tracks ?? []).map((track) => ({ track, locked: false })),
    groups: [],
  });
}

export function parseNleTimelineView(text: string): NleTimelineView {
  return sealNleTimelineView(JSON.parse(text) as NleTimelineView);
}

export function serializeNleTimelineView(value: NleTimelineView): string {
  assertNleTimelineView(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function nleTimelineTrackLocked(view: NleTimelineView, track: string): boolean {
  assertNleTimelineView(view);
  return view.tracks.find((state) => state.track === track)?.locked ?? false;
}

/** Drop stale projection references after an independently accepted Project edit. */
export function reconcileNleTimelineView(view: NleTimelineView, project: NleProject): NleTimelineView {
  assertNleTimelineView(view);
  const tracks = new Set(project.tracks.map((track) => track.id));
  const items = new Set(project.tracks.flatMap((track) => track.items.map((item) => item.id)));
  const nextTracks = view.tracks.filter((state) => tracks.has(state.track));
  const nextGroups = view.groups.filter((group) => group.items.every((item) => items.has(item)));
  if (nextTracks.length === view.tracks.length && nextGroups.length === view.groups.length) {
    return structuredClone(view);
  }
  return sealNleTimelineView({
    ...view,
    revision: view.revision + 1,
    tracks: nextTracks,
    groups: nextGroups,
  });
}
