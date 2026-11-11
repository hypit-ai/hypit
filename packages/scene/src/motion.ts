import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  evaluateTemporalControl,
  exactTemporalZero,
  sealLocalTemporalDomain,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type Rational,
  type TemporalControl,
} from "@hypit/temporal/algebra";

import {
  assertSceneCameraLens,
  assertScenePose,
  assertSceneProject,
  assertSceneTransform,
  findScenePerformance,
} from "./project.js";

import type {
  SceneCameraState,
  SceneObjectState,
  ScenePerformance,
  ScenePerformanceItem,
  ScenePerformanceSubject,
  ScenePerformanceTrack,
  SceneProject,
  SceneShot,
  SceneSubjectState,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type SceneBehaviorEvaluationContext = {
  /** Position in the owning Performance domain. */
  readonly at: ExactTemporalValue;
  /** Resolve only one dependency explicitly declared by this behavior. */
  readonly state: (subject: ScenePerformanceSubject) => SceneSubjectState;
};

/** Transient package resolution. Persistent Scene JSON keeps only `using` and package-owned parameters. */
export type SceneResolvedBehavior = {
  readonly domain: LocalTemporalDomain;
  readonly dependencies: readonly ScenePerformanceSubject[];
  readonly evaluate: (at: ExactTemporalValue, context: SceneBehaviorEvaluationContext) => SceneSubjectState;
};

export type SceneBehaviorResolverContext = {
  readonly project: SceneProject;
  readonly performance: ScenePerformance;
  readonly track: ScenePerformanceTrack;
  readonly domain: LocalTemporalDomain;
};

export type SceneLoweringHost = {
  readonly resolveBehavior: (
    item: ScenePerformanceItem,
    context: SceneBehaviorResolverContext,
  ) => SceneResolvedBehavior;
};

export type SceneProgramBehavior = SceneResolvedBehavior & {
  readonly id: string;
  readonly name: string;
  readonly subject: ScenePerformanceSubject;
  readonly start: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
};

/** Transient, executable projection of one Performance. It is never persisted or used as Undo authority. */
export type SceneProgram = {
  readonly id: string;
  readonly name: string;
  readonly domain: LocalTemporalDomain;
  readonly objects: Readonly<Record<string, SceneObjectState>>;
  readonly cameras: Readonly<Record<string, SceneCameraState>>;
  readonly behaviors: readonly SceneProgramBehavior[];
  readonly shots: readonly SceneShot[];
};

export type EvaluatedScene = {
  readonly at: ExactTemporalValue;
  readonly objects: Readonly<Record<string, SceneObjectState>>;
  readonly cameras: Readonly<Record<string, SceneCameraState>>;
  readonly activeCamera?: string;
};

export function sceneSubjectKey(value: ScenePerformanceSubject): string {
  return `${value.kind}:${value.ref}`;
}

function sameDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id && compareExactTemporalValues(left.duration, right.duration) === 0;
}

function assertSubjectExists(project: SceneProject, value: ScenePerformanceSubject, label: string): void {
  const exists = value.kind === "object"
    ? project.objects.some((entry) => entry.id === value.ref)
    : project.cameras.some((entry) => entry.id === value.ref);
  assert(exists, `${label} references missing ${value.kind} ${value.ref}.`);
}

function assertState(value: SceneSubjectState, subject: ScenePerformanceSubject, label: string): void {
  assert(value !== null && typeof value === "object", `${label} must be an object.`);
  assert(value.kind === subject.kind, `${label} produced ${value.kind} state for ${subject.kind} ${subject.ref}.`);
  if (value.kind === "object") assertSceneTransform(value.transform, `${label} Transform`);
  else {
    assertScenePose(value.pose, `${label} Pose`);
    assertSceneCameraLens(value.lens, `${label} Lens`);
  }
}

/** Convenience for resolvers that compile their parameters to the shared exact TemporalControl algebra. */
export function sceneControlBehavior<State extends SceneSubjectState, Interpolation>(
  control: TemporalControl<State, Interpolation>,
  dependencies: readonly ScenePerformanceSubject[],
  interpolate: (from: State, to: State, progress: Rational, interpolation: Interpolation) => State,
): SceneResolvedBehavior {
  return {
    domain: structuredClone(control.domain),
    dependencies: structuredClone(dependencies),
    evaluate: (at) => evaluateTemporalControl(control, at, interpolate),
  };
}

export function lowerScenePerformance(
  project: SceneProject,
  performanceId: string,
  host: SceneLoweringHost,
): SceneProgram {
  assertSceneProject(project);
  const performance = findScenePerformance(project, performanceId);
  const domain = sealLocalTemporalDomain({ id: `${performance.id}:time`, duration: performance.duration });
  const behaviors: SceneProgramBehavior[] = [];
  for (const track of performance.tracks) {
    for (const item of track.items) {
      if (!item.enabled) continue;
      const itemDomain = sealLocalTemporalDomain({ id: `${item.id}:time`, duration: item.duration });
      const resolved = host.resolveBehavior(structuredClone(item), {
        project: structuredClone(project),
        performance: structuredClone(performance),
        track: structuredClone(track),
        domain: itemDomain,
      });
      assert(sameDomain(resolved.domain, itemDomain),
        `Scene Behavior ${item.id} resolved a different local time domain.`);
      const dependencyKeys = new Set<string>();
      for (const dependency of resolved.dependencies) {
        assertSubjectExists(project, dependency, `Scene Behavior ${item.id} dependency`);
        const key = sceneSubjectKey(dependency);
        assert(key !== sceneSubjectKey(track.subject), `Scene Behavior ${item.id} depends on itself.`);
        assert(!dependencyKeys.has(key), `Scene Behavior ${item.id} repeats dependency ${key}.`);
        dependencyKeys.add(key);
      }
      behaviors.push({
        ...resolved,
        id: item.id,
        name: item.name,
        subject: structuredClone(track.subject),
        start: structuredClone(item.start),
        duration: structuredClone(item.duration),
      });
    }
  }
  return {
    id: performance.id,
    name: performance.name,
    domain,
    objects: Object.fromEntries(project.objects.map((entry) => [entry.id, {
      kind: "object" as const,
      transform: structuredClone(entry.transform),
    }])),
    cameras: Object.fromEntries(project.cameras.map((entry) => [entry.id, {
      kind: "camera" as const,
      pose: structuredClone(entry.pose),
      lens: structuredClone(entry.lens),
    }])),
    behaviors,
    shots: structuredClone(performance.shots),
  };
}

function active(at: ExactTemporalValue, start: ExactTemporalValue, duration: ExactTemporalValue): boolean {
  return compareExactTemporalValues(at, start) >= 0
    && compareExactTemporalValues(at, addExactTemporalValues(start, duration)) < 0;
}

export function evaluateSceneProgramAt(program: SceneProgram, at: ExactTemporalValue): EvaluatedScene {
  assertExactTemporalValue(at, "Scene evaluation position");
  assert(compareExactTemporalValues(at, exactTemporalZero()) >= 0
    && compareExactTemporalValues(at, program.domain.duration) < 0,
  `Scene evaluation position lies outside Performance ${program.id}.`);
  const activeBehaviors = new Map<string, SceneProgramBehavior>();
  for (const behavior of program.behaviors.filter((entry) => active(at, entry.start, entry.duration))) {
    const key = sceneSubjectKey(behavior.subject);
    assert(!activeBehaviors.has(key),
      `Scene Program has multiple active Behaviors for ${key} at one position.`);
    activeBehaviors.set(key, behavior);
  }
  const states = new Map<string, SceneSubjectState>();
  const visiting = new Set<string>();
  const resolve = (subject: ScenePerformanceSubject): SceneSubjectState => {
    const key = sceneSubjectKey(subject);
    const cached = states.get(key);
    if (cached !== undefined) return cached;
    assert(!visiting.has(key), `Scene Behavior dependency cycle reaches ${key}.`);
    visiting.add(key);
    const behavior = activeBehaviors.get(key);
    let state: SceneSubjectState;
    if (behavior === undefined) {
      const base = subject.kind === "object" ? program.objects[subject.ref] : program.cameras[subject.ref];
      assert(base !== undefined, `Scene Program has no base state for ${key}.`);
      state = structuredClone(base);
    } else {
      const allowed = new Set(behavior.dependencies.map(sceneSubjectKey));
      state = behavior.evaluate(subtractExactTemporalValues(at, behavior.start), {
        at: structuredClone(at),
        state: (dependency) => {
          const dependencyKey = sceneSubjectKey(dependency);
          assert(allowed.has(dependencyKey),
            `Scene Behavior ${behavior.id} read undeclared dependency ${dependencyKey}.`);
          return structuredClone(resolve(dependency));
        },
      });
      assertState(state, subject, `Scene Behavior ${behavior.id}`);
    }
    visiting.delete(key);
    states.set(key, structuredClone(state));
    return state;
  };
  const objects = Object.fromEntries(Object.keys(program.objects).map((id) =>
    [id, resolve({ kind: "object", ref: id }) as SceneObjectState]));
  const cameras = Object.fromEntries(Object.keys(program.cameras).map((id) =>
    [id, resolve({ kind: "camera", ref: id }) as SceneCameraState]));
  const shot = program.shots.find((entry) => active(at, entry.start, entry.duration));
  return {
    at: structuredClone(at),
    objects,
    cameras,
    ...(shot === undefined ? {} : { activeCamera: shot.camera }),
  };
}
