import type { Facet } from "@hypit/facet";
import { canonicalize, type CanonicalValue } from "@hypit/protocol";

import { scenePackageSymbolKey } from "./package.js";
import { findSceneObject, findScenePerformance } from "./project.js";
import type { SceneTransaction } from "./transaction.js";
import type {
  SceneObject,
  SceneEnvironment,
  ScenePackageSymbol,
  ScenePerformance,
  ScenePerformanceItem,
  ScenePerformanceTrack,
  SceneProject,
} from "./types.js";

export const sceneAuthoringFacetAbi = "hypit.scene-authoring@1";

export type SceneObjectParameterAuthoringContext = {
  readonly project: SceneProject;
  readonly object: SceneObject;
};

export type SceneBehaviorParameterAuthoringContext = {
  readonly project: SceneProject;
  readonly performance: ScenePerformance;
  readonly track: ScenePerformanceTrack;
  readonly item: ScenePerformanceItem;
};

export type SceneEnvironmentParameterAuthoringContext = {
  readonly project: SceneProject;
  readonly environment: SceneEnvironment;
};

/** Package-owned parameter projection and edit semantics for one exact Object symbol. */
export type SceneObjectParameterAuthoring = {
  readonly object: ScenePackageSymbol;
  readonly inspect: (context: SceneObjectParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: SceneObjectParameterAuthoringContext,
  ) => CanonicalValue;
};

/** Package-owned parameter projection and edit semantics for one exact Behavior symbol. */
export type SceneBehaviorParameterAuthoring = {
  readonly behavior: ScenePackageSymbol;
  readonly inspect: (context: SceneBehaviorParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: SceneBehaviorParameterAuthoringContext,
  ) => CanonicalValue;
};

/** Package-owned parameter projection and edit semantics for one exact Environment symbol. */
export type SceneEnvironmentParameterAuthoring = {
  readonly environment: ScenePackageSymbol;
  readonly inspect: (context: SceneEnvironmentParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: SceneEnvironmentParameterAuthoringContext,
  ) => CanonicalValue;
};

export type SceneAuthoringPackage = {
  readonly environmentParameters?: readonly SceneEnvironmentParameterAuthoring[];
  readonly objectParameters?: readonly SceneObjectParameterAuthoring[];
  readonly behaviorParameters?: readonly SceneBehaviorParameterAuthoring[];
};

export type SceneAuthoringFacet = Facet & {
  readonly abi: typeof sceneAuthoringFacetAbi;
  readonly implementation: SceneAuthoringPackage;
};

export type SceneAuthoringHost = {
  readonly hasEnvironmentParameterAuthoring: (environment: ScenePackageSymbol) => boolean;
  readonly hasObjectParameterAuthoring: (object: ScenePackageSymbol) => boolean;
  readonly hasBehaviorParameterAuthoring: (behavior: ScenePackageSymbol) => boolean;
  readonly inspectEnvironmentParameters: (project: SceneProject) => CanonicalValue;
  readonly planEnvironmentParameterEdit: (
    project: SceneProject,
    operation: CanonicalValue,
  ) => SceneTransaction;
  readonly inspectObjectParameters: (project: SceneProject, object: string) => CanonicalValue;
  readonly planObjectParameterEdit: (
    project: SceneProject,
    object: string,
    operation: CanonicalValue,
  ) => SceneTransaction;
  readonly inspectBehaviorParameters: (
    project: SceneProject,
    performance: string,
    track: string,
    item: string,
  ) => CanonicalValue;
  readonly planBehaviorParameterEdit: (
    project: SceneProject,
    performance: string,
    track: string,
    item: string,
    operation: CanonicalValue,
  ) => SceneTransaction;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPackage(value: SceneAuthoringPackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Scene authoring package must be an object.");
  const keys = new Set<string>();
  for (const authoring of value.environmentParameters ?? []) {
    const key = scenePackageSymbolKey(authoring.environment);
    assert(!keys.has(`environment:${key}`), `Scene authoring package repeats Environment parameters ${key}.`);
    keys.add(`environment:${key}`);
    assert(typeof authoring.inspect === "function", `Scene Environment authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `Scene Environment authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.objectParameters ?? []) {
    const key = scenePackageSymbolKey(authoring.object);
    assert(!keys.has(`object:${key}`), `Scene authoring package repeats Object parameters ${key}.`);
    keys.add(`object:${key}`);
    assert(typeof authoring.inspect === "function", `Scene Object authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `Scene Object authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.behaviorParameters ?? []) {
    const key = scenePackageSymbolKey(authoring.behavior);
    assert(!keys.has(`behavior:${key}`), `Scene authoring package repeats Behavior parameters ${key}.`);
    keys.add(`behavior:${key}`);
    assert(typeof authoring.inspect === "function", `Scene Behavior authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `Scene Behavior authoring ${key} edit is not callable.`);
  }
}

function behaviorContext(
  project: SceneProject,
  performanceId: string,
  trackId: string,
  itemId: string,
): SceneBehaviorParameterAuthoringContext {
  const performance = findScenePerformance(project, performanceId);
  const track = performance.tracks.find((entry) => entry.id === trackId);
  if (track === undefined) throw new Error(`Unknown Scene Track: ${trackId}`);
  const item = track.items.find((entry) => entry.id === itemId);
  if (item === undefined) throw new Error(`Unknown Scene Performance Item: ${itemId}`);
  return { project, performance, track, item };
}

export function createSceneAuthoringFacet(value: SceneAuthoringPackage): SceneAuthoringFacet {
  assertPackage(value);
  return { abi: sceneAuthoringFacetAbi, implementation: value };
}

export function sceneAuthoringPackagesFromFacets(facets: readonly Facet[]): readonly SceneAuthoringPackage[] {
  return facets.flatMap((facet) => facet.abi === sceneAuthoringFacetAbi
    ? [(facet as SceneAuthoringFacet).implementation]
    : []);
}

export function createSceneAuthoringHost(packages: readonly SceneAuthoringPackage[]): SceneAuthoringHost {
  const environments = new Map<string, SceneEnvironmentParameterAuthoring>();
  const objects = new Map<string, SceneObjectParameterAuthoring>();
  const behaviors = new Map<string, SceneBehaviorParameterAuthoring>();
  for (const value of packages) {
    assertPackage(value);
    for (const authoring of value.environmentParameters ?? []) {
      const key = scenePackageSymbolKey(authoring.environment);
      assert(!environments.has(key), `Scene authoring Host has multiple Environment parameter owners for ${key}.`);
      environments.set(key, authoring);
    }
    for (const authoring of value.objectParameters ?? []) {
      const key = scenePackageSymbolKey(authoring.object);
      assert(!objects.has(key), `Scene authoring Host has multiple Object parameter owners for ${key}.`);
      objects.set(key, authoring);
    }
    for (const authoring of value.behaviorParameters ?? []) {
      const key = scenePackageSymbolKey(authoring.behavior);
      assert(!behaviors.has(key), `Scene authoring Host has multiple Behavior parameter owners for ${key}.`);
      behaviors.set(key, authoring);
    }
  }
  const objectAuthoring = (context: SceneObjectParameterAuthoringContext): SceneObjectParameterAuthoring => {
    const key = scenePackageSymbolKey(context.object.using);
    const authoring = objects.get(key);
    if (authoring === undefined) throw new Error(`Scene Object parameter authoring ${key} is not installed.`);
    return authoring;
  };
  const environmentAuthoring = (
    context: SceneEnvironmentParameterAuthoringContext,
  ): SceneEnvironmentParameterAuthoring => {
    const key = scenePackageSymbolKey(context.environment.using);
    const authoring = environments.get(key);
    if (authoring === undefined) throw new Error(`Scene Environment parameter authoring ${key} is not installed.`);
    return authoring;
  };
  const behaviorAuthoring = (context: SceneBehaviorParameterAuthoringContext): SceneBehaviorParameterAuthoring => {
    const key = scenePackageSymbolKey(context.item.using);
    const authoring = behaviors.get(key);
    if (authoring === undefined) throw new Error(`Scene Behavior parameter authoring ${key} is not installed.`);
    return authoring;
  };
  return {
    hasEnvironmentParameterAuthoring: (environment) => environments.has(scenePackageSymbolKey(environment)),
    hasObjectParameterAuthoring: (object) => objects.has(scenePackageSymbolKey(object)),
    hasBehaviorParameterAuthoring: (behavior) => behaviors.has(scenePackageSymbolKey(behavior)),
    inspectEnvironmentParameters(project) {
      const context = { project, environment: project.environment };
      return canonicalize(environmentAuthoring(context).inspect(context));
    },
    planEnvironmentParameterEdit(project, operation) {
      const context = { project, environment: project.environment };
      const parameters = canonicalize(environmentAuthoring(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "environment.replace",
          environment: { ...structuredClone(project.environment), parameters },
        }],
      };
    },
    inspectObjectParameters(project, id) {
      const object = findSceneObject(project, id);
      const context = { project, object };
      return canonicalize(objectAuthoring(context).inspect(context));
    },
    planObjectParameterEdit(project, id, operation) {
      const object = findSceneObject(project, id);
      const context = { project, object };
      const parameters = canonicalize(objectAuthoring(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{ kind: "object.replace", object: { ...structuredClone(object), parameters } }],
      };
    },
    inspectBehaviorParameters(project, performanceId, trackId, itemId) {
      const context = behaviorContext(project, performanceId, trackId, itemId);
      return canonicalize(behaviorAuthoring(context).inspect(context));
    },
    planBehaviorParameterEdit(project, performanceId, trackId, itemId, operation) {
      const context = behaviorContext(project, performanceId, trackId, itemId);
      const parameters = canonicalize(behaviorAuthoring(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "performance-item.replace",
          performance: performanceId,
          track: trackId,
          item: { ...structuredClone(context.item), parameters },
        }],
      };
    },
  };
}

export function createSceneAuthoringHostFromFacets(facets: readonly Facet[]): SceneAuthoringHost {
  return createSceneAuthoringHost(sceneAuthoringPackagesFromFacets(facets));
}
