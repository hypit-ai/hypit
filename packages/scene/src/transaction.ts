import { assertSceneProject } from "./project.js";
import type {
  SceneCamera,
  SceneCameraLens,
  SceneEnvironment,
  SceneObject,
  ScenePerformance,
  ScenePerformanceItem,
  ScenePerformanceTrack,
  SceneProject,
  ScenePose,
  SceneShot,
  SceneTransform,
} from "./types.js";

export type SceneCommand =
  | { readonly kind: "project.update"; readonly name: string }
  | { readonly kind: "environment.replace"; readonly environment: SceneEnvironment }
  | { readonly kind: "object.add"; readonly object: SceneObject; readonly before?: string }
  | { readonly kind: "object.replace"; readonly object: SceneObject }
  | { readonly kind: "object.transform.set"; readonly id: string; readonly transform: SceneTransform }
  | { readonly kind: "object.remove"; readonly id: string }
  | { readonly kind: "camera.add"; readonly camera: SceneCamera; readonly before?: string }
  | { readonly kind: "camera.replace"; readonly camera: SceneCamera }
  | { readonly kind: "camera.pose.set"; readonly id: string; readonly pose: ScenePose }
  | { readonly kind: "camera.lens.set"; readonly id: string; readonly lens: SceneCameraLens }
  | { readonly kind: "camera.remove"; readonly id: string }
  | { readonly kind: "performance.add"; readonly performance: ScenePerformance; readonly before?: string }
  | { readonly kind: "performance.replace"; readonly performance: ScenePerformance }
  | { readonly kind: "performance.remove"; readonly id: string }
  | { readonly kind: "track.add"; readonly performance: string; readonly track: ScenePerformanceTrack; readonly before?: string }
  | { readonly kind: "track.replace"; readonly performance: string; readonly track: ScenePerformanceTrack }
  | { readonly kind: "track.remove"; readonly performance: string; readonly id: string }
  | { readonly kind: "performance-item.add"; readonly performance: string; readonly track: string; readonly item: ScenePerformanceItem; readonly before?: string }
  | { readonly kind: "performance-item.replace"; readonly performance: string; readonly track: string; readonly item: ScenePerformanceItem }
  | { readonly kind: "performance-item.remove"; readonly performance: string; readonly track: string; readonly id: string }
  | { readonly kind: "shot.add"; readonly performance: string; readonly shot: SceneShot; readonly before?: string }
  | { readonly kind: "shot.replace"; readonly performance: string; readonly shot: SceneShot }
  | { readonly kind: "shot.remove"; readonly performance: string; readonly id: string };

export type SceneTransaction = {
  readonly revision: number;
  readonly commands: readonly SceneCommand[];
};

export class SceneRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Scene Project changed: expected revision ${expected}, found ${actual}.`);
    this.name = "SceneRevisionConflict";
  }
}

type MutableTrack = Omit<ScenePerformanceTrack, "items"> & {
  items: ScenePerformanceItem[];
};

type MutablePerformance = Omit<ScenePerformance, "tracks" | "shots"> & {
  tracks: MutableTrack[];
  shots: SceneShot[];
};

type MutableProject = Omit<SceneProject, "revision" | "name" | "environment" | "objects" | "cameras" | "performances"> & {
  revision: number;
  name: string;
  environment: SceneEnvironment;
  objects: SceneObject[];
  cameras: SceneCamera[];
  performances: MutablePerformance[];
};

function insert<T extends { readonly id: string }>(values: readonly T[], value: T, before?: string): T[] {
  const next = [...values];
  const index = before === undefined ? next.length : next.findIndex((entry) => entry.id === before);
  if (index < 0) throw new Error(`Unknown Scene insertion target: ${before}.`);
  next.splice(index, 0, structuredClone(value));
  return next;
}

function replace<T extends { readonly id: string }>(values: T[], value: T, label: string): void {
  const index = values.findIndex((entry) => entry.id === value.id);
  if (index < 0) throw new Error(`Unknown ${label}: ${value.id}`);
  values.splice(index, 1, structuredClone(value));
}

function remove<T extends { readonly id: string }>(values: T[], id: string, label: string): void {
  const index = values.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`Unknown ${label}: ${id}`);
  values.splice(index, 1);
}

function performance(project: MutableProject, id: string): MutablePerformance {
  const value = project.performances.find((entry) => entry.id === id);
  if (value === undefined) throw new Error(`Unknown Scene Performance: ${id}`);
  return value;
}

function track(project: MutableProject, performanceId: string, id: string): MutableTrack {
  const value = performance(project, performanceId).tracks.find((entry) => entry.id === id);
  if (value === undefined) throw new Error(`Unknown Scene Track: ${id}`);
  return value;
}

/** One complete authoring intention becomes one validated Scene revision. */
export function applySceneTransaction(project: SceneProject, transaction: SceneTransaction): SceneProject {
  assertSceneProject(project);
  if (transaction.revision !== project.revision) {
    throw new SceneRevisionConflict(transaction.revision, project.revision);
  }
  const next = structuredClone(project) as MutableProject;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "project.update": next.name = command.name; break;
      case "environment.replace": next.environment = structuredClone(command.environment); break;
      case "object.add": next.objects = insert(next.objects, command.object, command.before); break;
      case "object.replace": replace(next.objects, command.object, "Scene Object"); break;
      case "object.transform.set": {
        const value = next.objects.find((entry) => entry.id === command.id);
        if (value === undefined) throw new Error(`Unknown Scene Object: ${command.id}`);
        (value as { transform: SceneTransform }).transform = structuredClone(command.transform);
        break;
      }
      case "object.remove": remove(next.objects, command.id, "Scene Object"); break;
      case "camera.add": next.cameras = insert(next.cameras, command.camera, command.before); break;
      case "camera.replace": replace(next.cameras, command.camera, "Scene Camera"); break;
      case "camera.pose.set": {
        const value = next.cameras.find((entry) => entry.id === command.id);
        if (value === undefined) throw new Error(`Unknown Scene Camera: ${command.id}`);
        (value as { pose: ScenePose }).pose = structuredClone(command.pose);
        break;
      }
      case "camera.lens.set": {
        const value = next.cameras.find((entry) => entry.id === command.id);
        if (value === undefined) throw new Error(`Unknown Scene Camera: ${command.id}`);
        (value as { lens: SceneCameraLens }).lens = structuredClone(command.lens);
        break;
      }
      case "camera.remove": remove(next.cameras, command.id, "Scene Camera"); break;
      case "performance.add": next.performances = insert(next.performances, command.performance, command.before)
        .map((entry) => ({
          ...entry,
          tracks: entry.tracks.map((value) => ({ ...value, items: [...value.items] })),
          shots: [...entry.shots],
        })); break;
      case "performance.replace": replace(next.performances, {
        ...structuredClone(command.performance),
        tracks: command.performance.tracks.map((value) => ({ ...structuredClone(value), items: [...value.items] })),
        shots: [...command.performance.shots],
      }, "Scene Performance"); break;
      case "performance.remove": remove(next.performances, command.id, "Scene Performance"); break;
      case "track.add": {
        const value = performance(next, command.performance);
        value.tracks = insert(value.tracks, command.track, command.before)
          .map((entry) => ({ ...entry, items: [...entry.items] }));
        break;
      }
      case "track.replace": replace(performance(next, command.performance).tracks, command.track, "Scene Track"); break;
      case "track.remove": remove(performance(next, command.performance).tracks, command.id, "Scene Track"); break;
      case "performance-item.add": {
        const value = track(next, command.performance, command.track);
        value.items = insert(value.items, command.item, command.before);
        break;
      }
      case "performance-item.replace": {
        const value = track(next, command.performance, command.track);
        replace(value.items, command.item, "Scene Performance Item");
        break;
      }
      case "performance-item.remove": {
        const value = track(next, command.performance, command.track);
        remove(value.items, command.id, "Scene Performance Item");
        break;
      }
      case "shot.add": {
        const value = performance(next, command.performance);
        value.shots = insert(value.shots, command.shot, command.before);
        break;
      }
      case "shot.replace": replace(performance(next, command.performance).shots, command.shot, "Scene Shot"); break;
      case "shot.remove": remove(performance(next, command.performance).shots, command.id, "Scene Shot"); break;
    }
  }
  next.revision += 1;
  assertSceneProject(next);
  return structuredClone(next);
}
