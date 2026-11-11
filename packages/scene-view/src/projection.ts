import type { SceneProject } from "@hypit/scene";
import type { ExactTemporalValue, TemporalRate } from "@hypit/temporal/algebra";

import type { SceneObjectObservation, SceneView, SceneWorkbenchScene } from "./types.js";
import { assertSceneViewForProject } from "./view.js";

function frames(value: ExactTemporalValue, rate: TemporalRate): number {
  return Number(BigInt(value.ticks))
    * value.timeBase.numerator / value.timeBase.denominator
    * rate.numerator / rate.denominator;
}

export function projectSceneWorkbench(
  project: SceneProject,
  view: SceneView,
  observations: readonly SceneObjectObservation[] = [],
): SceneWorkbenchScene {
  assertSceneViewForProject(view, project);
  const ids = new Set(project.objects.map((entry) => entry.id));
  const observed = new Map<string, SceneObjectObservation>();
  for (const observation of observations) {
    if (!ids.has(observation.object)) throw new Error(`Scene observation references missing Object ${observation.object}.`);
    if (observed.has(observation.object)) throw new Error(`Scene observations repeat Object ${observation.object}.`);
    observed.set(observation.object, observation);
  }
  return {
    environment: structuredClone(project.environment),
    grid: structuredClone(view.grid),
    objects: project.objects.map((entry) => {
      const state = view.objects.find((candidate) => candidate.object === entry.id);
      const preview = observed.get(entry.id)?.preview;
      return {
        ...structuredClone(entry),
        editorVisible: !(state?.hidden ?? false),
        editable: !(state?.locked ?? false),
        ...(preview === undefined ? {} : { preview: structuredClone(preview) }),
      };
    }),
    cameras: structuredClone(project.cameras),
    performances: project.performances.map((performance) => ({
      id: performance.id,
      name: performance.name,
      durationFrames: frames(performance.duration, view.editRate),
      tracks: performance.tracks.map((entry) => ({
        id: entry.id,
        name: entry.name,
        performance: performance.id,
        subject: structuredClone(entry.subject),
        locked: view.tracks.some((state) => state.performance === performance.id
          && state.track === entry.id && state.locked),
        itemCount: entry.items.length,
      })),
      shots: performance.shots.map((entry) => ({
        id: entry.id,
        name: entry.name,
        camera: entry.camera,
        startFrame: frames(entry.start, view.editRate),
        durationFrames: frames(entry.duration, view.editRate),
      })),
    })),
  };
}
