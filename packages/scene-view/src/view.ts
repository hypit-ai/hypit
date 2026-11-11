import type { SceneProject } from "@hypit/scene";
import type { TemporalRate } from "@hypit/temporal/algebra";

import type { SceneView, SceneViewGrid, SceneViewProjectReference } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function portablePath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be non-empty.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must be a portable relative path.`);
  const relative = value.startsWith("./") ? value.slice(2) : value;
  assert(relative.length > 0 && relative.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${label} must not contain empty, current, or parent segments.`);
}

function rate(value: TemporalRate): void {
  object(value, "Scene View edit rate");
  assert(Number.isSafeInteger(value.numerator) && value.numerator > 0,
    "Scene View edit-rate numerator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.denominator) && value.denominator > 0,
    "Scene View edit-rate denominator must be a positive safe integer.");
}

function grid(value: SceneViewGrid): void {
  object(value, "Scene View Grid");
  assert(typeof value.visible === "boolean", "Scene View Grid visibility is invalid.");
  assert(typeof value.snap === "boolean", "Scene View Grid snap is invalid.");
  assert(typeof value.spacing === "number" && Number.isFinite(value.spacing) && value.spacing > 0,
    "Scene View Grid spacing must be positive and finite.");
}

export function assertSceneView(value: SceneView): void {
  object(value, "Scene View");
  assert(value.format === "hypit.scene-view@1", "Unsupported Scene View format.");
  identity(value.id, "Scene View id");
  assert(typeof value.name === "string" && value.name.trim().length > 0, "Scene View name is empty.");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "Scene View revision must be a non-negative safe integer.");
  object(value.project, "Scene View Project reference");
  portablePath(value.project.path, "Scene View Project path");
  rate(value.editRate);
  grid(value.grid);
  assert(Array.isArray(value.objects) && Array.isArray(value.tracks), "Scene View collections are invalid.");
  const objects = new Set<string>();
  for (const state of value.objects) {
    identity(state.object, "Scene View Object reference");
    assert(!objects.has(state.object), `Scene View repeats Object ${state.object}.`);
    objects.add(state.object);
    assert(typeof state.hidden === "boolean" && typeof state.locked === "boolean",
      `Scene View Object ${state.object} state is invalid.`);
  }
  const tracks = new Set<string>();
  for (const state of value.tracks) {
    identity(state.performance, "Scene View Track Performance reference");
    identity(state.track, "Scene View Track reference");
    const key = `${state.performance}\u0000${state.track}`;
    assert(!tracks.has(key), `Scene View repeats Track ${state.track}.`);
    tracks.add(key);
    assert(typeof state.locked === "boolean", `Scene View Track ${state.track} lock is invalid.`);
  }
}

export function assertSceneViewForProject(view: SceneView, project: SceneProject): void {
  assertSceneView(view);
  const objects = new Set(project.objects.map((entry) => entry.id));
  for (const state of view.objects) {
    assert(objects.has(state.object), `Scene View references missing Object ${state.object}.`);
  }
  for (const state of view.tracks) {
    const performance = project.performances.find((entry) => entry.id === state.performance);
    assert(performance !== undefined, `Scene View references missing Performance ${state.performance}.`);
    assert(performance.tracks.some((entry) => entry.id === state.track),
      `Scene View references missing Track ${state.track}.`);
  }
}

export function sealSceneView(value: SceneView): SceneView {
  assertSceneView(value);
  return structuredClone(value);
}

export function createSceneView(input: {
  readonly id: string;
  readonly name: string;
  readonly project: SceneViewProjectReference;
  readonly editRate?: TemporalRate;
  readonly grid?: SceneViewGrid;
  readonly objects?: readonly string[];
}): SceneView {
  return sealSceneView({
    format: "hypit.scene-view@1",
    id: input.id,
    name: input.name,
    revision: 0,
    project: structuredClone(input.project),
    editRate: structuredClone(input.editRate ?? { numerator: 24, denominator: 1 }),
    grid: structuredClone(input.grid ?? { visible: true, snap: false, spacing: 1 }),
    objects: (input.objects ?? []).map((entry) => ({ object: entry, hidden: false, locked: false })),
    tracks: [],
  });
}

export function parseSceneView(text: string): SceneView {
  return sealSceneView(JSON.parse(text) as SceneView);
}

export function serializeSceneView(value: SceneView): string {
  assertSceneView(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function reconcileSceneView(view: SceneView, project: SceneProject): SceneView {
  assertSceneView(view);
  const objects = new Set(project.objects.map((entry) => entry.id));
  const tracks = new Set(project.performances.flatMap((performance) =>
    performance.tracks.map((entry) => `${performance.id}\u0000${entry.id}`)));
  const nextObjects = view.objects.filter((state) => objects.has(state.object));
  const nextTracks = view.tracks.filter((state) => tracks.has(`${state.performance}\u0000${state.track}`));
  if (nextObjects.length === view.objects.length && nextTracks.length === view.tracks.length) {
    return structuredClone(view);
  }
  return sealSceneView({ ...view, revision: view.revision + 1, objects: nextObjects, tracks: nextTracks });
}
