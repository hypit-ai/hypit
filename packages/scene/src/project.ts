import { canonicalize } from "@hypit/protocol";
import { isModuleRef } from "@hypit/module";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal/algebra";

import { assertSceneLibraryReference } from "./library.js";

import type {
  SceneCamera,
  SceneEnvironment,
  SceneObject,
  SceneCameraLens,
  ScenePackageSymbol,
  ScenePose,
  ScenePerformance,
  ScenePerformanceItem,
  ScenePerformanceSubject,
  SceneProject,
  SceneQuaternion,
  SceneShot,
  SceneTransform,
  SceneVector3,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function name(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is empty.`);
}

function finite(value: unknown, label: string): asserts value is number {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be finite.`);
}

function vector(value: SceneVector3, label: string): void {
  object(value, label);
  finite(value.x, `${label} x`);
  finite(value.y, `${label} y`);
  finite(value.z, `${label} z`);
}

function quaternion(value: SceneQuaternion, label: string): void {
  vector(value, label);
  finite(value.w, `${label} w`);
  const length = Math.hypot(value.x, value.y, value.z, value.w);
  assert(length > 0, `${label} must not be zero.`);
}

export function assertScenePose(value: ScenePose, label = "Scene Pose"): void {
  object(value, label);
  vector(value.position, `${label} position`);
  quaternion(value.rotation, `${label} rotation`);
}

export function assertSceneTransform(value: SceneTransform, label = "Scene Transform"): void {
  assertScenePose(value, label);
  vector(value.scale, `${label} scale`);
  assert(value.scale.x !== 0 && value.scale.y !== 0 && value.scale.z !== 0,
    `${label} scale components must not be zero.`);
}

export function assertSceneCameraLens(value: SceneCameraLens, label = "Scene Camera Lens"): void {
  object(value, label);
  assert(value.fov > 0 && value.fov < 180, `${label} fov must be between 0 and 180.`);
  object(value.aspect, `${label} aspect`);
  assert(Number.isSafeInteger(value.aspect.numerator) && value.aspect.numerator > 0,
    `${label} aspect numerator must be a positive safe integer.`);
  assert(Number.isSafeInteger(value.aspect.denominator) && value.aspect.denominator > 0,
    `${label} aspect denominator must be a positive safe integer.`);
}

function symbol(value: ScenePackageSymbol, label: string): void {
  object(value, label);
  assert(isModuleRef(value.module), `${label} Module is invalid.`);
  identity(value.name, `${label} name`);
}

function nonNegativeTime(value: ScenePerformanceItem["start"], label: string): void {
  assertExactTemporalValue(value, label);
  assert(compareExactTemporalValues(value, exactTemporalZero()) >= 0, `${label} must not be negative.`);
}

function positiveTime(value: ScenePerformanceItem["duration"], label: string): void {
  assertExactTemporalValue(value, label);
  assert(compareExactTemporalValues(value, exactTemporalZero()) > 0, `${label} must be positive.`);
}

function environment(value: SceneEnvironment): void {
  object(value, "Scene Environment");
  symbol(value.using, "Scene Environment using");
  canonicalize(value.parameters);
}

function sceneObject(value: SceneObject): void {
  object(value, "Scene Object");
  identity(value.id, "Scene Object id");
  name(value.name, `Scene Object ${value.id} name`);
  symbol(value.using, `Scene Object ${value.id} using`);
  assertSceneTransform(value.transform, `Scene Object ${value.id} Transform`);
  assert(typeof value.enabled === "boolean", `Scene Object ${value.id} enabled is invalid.`);
  canonicalize(value.parameters);
}

function camera(value: SceneCamera): void {
  object(value, "Scene Camera");
  identity(value.id, "Scene Camera id");
  name(value.name, `Scene Camera ${value.id} name`);
  assertScenePose(value.pose, `Scene Camera ${value.id} Pose`);
  assertSceneCameraLens(value.lens, `Scene Camera ${value.id} Lens`);
}

function subject(value: ScenePerformanceSubject, objects: ReadonlySet<string>, cameras: ReadonlySet<string>, label: string): void {
  object(value, label);
  identity(value.ref, `${label} reference`);
  assert(value.kind === "object" || value.kind === "camera", `${label} kind is invalid.`);
  assert(value.kind === "object" ? objects.has(value.ref) : cameras.has(value.ref),
    `${label} references missing ${value.kind === "object" ? "Object" : "Camera"} ${value.ref}.`);
}

function performance(value: ScenePerformance, objects: ReadonlySet<string>, cameras: ReadonlySet<string>): void {
  object(value, "Scene Performance");
  identity(value.id, "Scene Performance id");
  name(value.name, `Scene Performance ${value.id} name`);
  positiveTime(value.duration, `Scene Performance ${value.id} duration`);
  assert(Array.isArray(value.tracks) && Array.isArray(value.shots),
    `Scene Performance ${value.id} collections are invalid.`);
  const identities = new Set<string>();
  const subjectItems = new Map<string, {
    readonly track: string;
    readonly item: string;
    readonly start: ScenePerformanceItem["start"];
    readonly end: ScenePerformanceItem["start"];
  }[]>();
  for (const track of value.tracks) {
    identity(track.id, `Scene Performance ${value.id} Track id`);
    assert(!identities.has(track.id), `Scene Performance ${value.id} repeats identity ${track.id}.`);
    identities.add(track.id);
    name(track.name, `Scene Track ${track.id} name`);
    subject(track.subject, objects, cameras, `Scene Track ${track.id} subject`);
    const subjectKey = `${track.subject.kind}:${track.subject.ref}`;
    assert(Array.isArray(track.items), `Scene Track ${track.id} Items are invalid.`);
    let previousEnd = exactTemporalZero();
    for (const item of track.items) {
      identity(item.id, `Scene Track ${track.id} Item id`);
      assert(!identities.has(item.id), `Scene Performance ${value.id} repeats identity ${item.id}.`);
      identities.add(item.id);
      name(item.name, `Scene Item ${item.id} name`);
      nonNegativeTime(item.start, `Scene Item ${item.id} start`);
      positiveTime(item.duration, `Scene Item ${item.id} duration`);
      assert(compareExactTemporalValues(addExactTemporalValues(item.start, item.duration), value.duration) <= 0,
        `Scene Item ${item.id} exceeds Performance ${value.id}.`);
      assert(compareExactTemporalValues(item.start, previousEnd) >= 0,
        `Scene Item ${item.id} overlaps or precedes another Item on Track ${track.id}.`);
      previousEnd = addExactTemporalValues(item.start, item.duration);
      assert(typeof item.enabled === "boolean", `Scene Item ${item.id} enabled is invalid.`);
      symbol(item.using, `Scene Item ${item.id} using`);
      canonicalize(item.parameters);
      if (item.enabled) {
        const entries = subjectItems.get(subjectKey) ?? [];
        entries.push({ track: track.id, item: item.id, start: item.start, end: previousEnd });
        subjectItems.set(subjectKey, entries);
      }
    }
  }
  for (const [subjectKey, entries] of subjectItems) {
    entries.sort((left, right) => compareExactTemporalValues(left.start, right.start));
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1]!;
      const current = entries[index]!;
      assert(compareExactTemporalValues(current.start, previous.end) >= 0,
        `Scene Performance ${value.id} overlaps enabled Items ${previous.item} and ${current.item} across Tracks for ${subjectKey}.`);
    }
  }
  let previousShotEnd = exactTemporalZero();
  for (const shot of value.shots) {
    identity(shot.id, `Scene Performance ${value.id} Shot id`);
    assert(!identities.has(shot.id), `Scene Performance ${value.id} repeats identity ${shot.id}.`);
    identities.add(shot.id);
    name(shot.name, `Scene Shot ${shot.id} name`);
    identity(shot.camera, `Scene Shot ${shot.id} Camera reference`);
    assert(cameras.has(shot.camera), `Scene Shot ${shot.id} references missing Camera ${shot.camera}.`);
    nonNegativeTime(shot.start, `Scene Shot ${shot.id} start`);
    positiveTime(shot.duration, `Scene Shot ${shot.id} duration`);
    assert(compareExactTemporalValues(addExactTemporalValues(shot.start, shot.duration), value.duration) <= 0,
      `Scene Shot ${shot.id} exceeds Performance ${value.id}.`);
    assert(compareExactTemporalValues(shot.start, previousShotEnd) >= 0,
      `Scene Shot ${shot.id} overlaps or precedes another Shot in Performance ${value.id}.`);
    previousShotEnd = addExactTemporalValues(shot.start, shot.duration);
  }
}

export function assertSceneProject(value: SceneProject): void {
  object(value, "Scene Project");
  assert(value.format === "hypit.scene@1", "Unsupported Scene Project format.");
  identity(value.id, "Scene Project id");
  name(value.name, "Scene Project name");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "Scene Project revision must be a non-negative safe integer.");
  assert(Array.isArray(value.libraries), "Scene Project libraries must be an array.");
  const libraryPaths = new Set<string>();
  for (const library of value.libraries) {
    assertSceneLibraryReference(library);
    assert(!libraryPaths.has(library.path), `Scene Project repeats Library ${library.path}.`);
    libraryPaths.add(library.path);
  }
  environment(value.environment);
  assert(Array.isArray(value.objects) && Array.isArray(value.cameras) && Array.isArray(value.performances),
    "Scene Project collections are invalid.");
  const identities = new Set<string>([value.id]);
  for (const entry of value.objects) {
    sceneObject(entry);
    assert(!identities.has(entry.id), `Scene identity ${entry.id} is duplicated.`);
    identities.add(entry.id);
  }
  for (const entry of value.cameras) {
    camera(entry);
    assert(!identities.has(entry.id), `Scene identity ${entry.id} is duplicated.`);
    identities.add(entry.id);
  }
  const objectIds = new Set(value.objects.map((entry) => entry.id));
  const cameraIds = new Set(value.cameras.map((entry) => entry.id));
  for (const entry of value.performances) {
    assert(!identities.has(entry.id), `Scene identity ${entry.id} is duplicated.`);
    identities.add(entry.id);
    performance(entry, objectIds, cameraIds);
  }
}

export function sealSceneProject(value: SceneProject): SceneProject {
  assertSceneProject(value);
  return structuredClone(value);
}

export function createSceneProject(input: {
  readonly id: string;
  readonly name: string;
  readonly libraries?: readonly import("./types.js").SceneLibraryReference[];
  readonly environment: SceneEnvironment;
  readonly objects?: readonly SceneObject[];
  readonly cameras?: readonly SceneCamera[];
  readonly performances?: readonly ScenePerformance[];
}): SceneProject {
  return sealSceneProject({
    format: "hypit.scene@1",
    id: input.id,
    name: input.name,
    revision: 0,
    libraries: structuredClone(input.libraries ?? []),
    environment: structuredClone(input.environment),
    objects: structuredClone(input.objects ?? []),
    cameras: structuredClone(input.cameras ?? []),
    performances: structuredClone(input.performances ?? []),
  });
}

export function parseSceneProject(text: string): SceneProject {
  return sealSceneProject(JSON.parse(text) as SceneProject);
}

export function serializeSceneProject(value: SceneProject): string {
  assertSceneProject(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function findSceneObject(project: SceneProject, id: string): SceneObject {
  assertSceneProject(project);
  const value = project.objects.find((entry) => entry.id === id);
  if (value === undefined) throw new Error(`Unknown Scene Object: ${id}`);
  return structuredClone(value);
}

export function findSceneCamera(project: SceneProject, id: string): SceneCamera {
  assertSceneProject(project);
  const value = project.cameras.find((entry) => entry.id === id);
  if (value === undefined) throw new Error(`Unknown Scene Camera: ${id}`);
  return structuredClone(value);
}

export function findScenePerformance(project: SceneProject, id: string): ScenePerformance {
  assertSceneProject(project);
  const value = project.performances.find((entry) => entry.id === id);
  if (value === undefined) throw new Error(`Unknown Scene Performance: ${id}`);
  return structuredClone(value);
}
