import {
  assertProjectObjectRef,
  projectObjectRefKey,
  type ProjectObjectRef,
} from "@hypit/project";
import type { Facet } from "@hypit/facet";

import { projectObjectOwnersFromFacets } from "./facet.js";
import type {
  ProductionContext,
  ProductionContextHost,
  ProjectObjectObservation,
  ProjectObjectOwner,
} from "./types.js";

function ownerMap(values: readonly ProjectObjectOwner[]): ReadonlyMap<string, ProjectObjectOwner> {
  const result = new Map<string, ProjectObjectOwner>();
  for (const value of values) {
    if (result.has(value.format)) throw new Error(`Project Object format ${value.format} has multiple owners.`);
    result.set(value.format, value);
  }
  return result;
}

function verifyObservation(
  value: ProjectObjectObservation,
  expected: ProjectObjectRef,
): ProjectObjectObservation {
  assertProjectObjectRef(value.ref);
  if (projectObjectRefKey(value.ref) !== projectObjectRefKey(expected)) {
    throw new Error(`Project Object owner returned an observation for another object.`);
  }
  if (typeof value.label !== "string" || value.label.trim().length === 0) {
    throw new Error(`Project Object ${expected.path} has an empty observation label.`);
  }
  for (const reference of value.references) assertProjectObjectRef(reference);
  return {
    ref: { ...value.ref },
    label: value.label,
    references: value.references.map((reference) => ({ ...reference })),
  };
}

export function createProductionContextHost(
  values: readonly ProjectObjectOwner[],
): ProductionContextHost {
  const owners = ownerMap(values);

  const observe = async (projectRoot: string, ref: ProjectObjectRef): Promise<ProjectObjectObservation> => {
    assertProjectObjectRef(ref);
    const owner = owners.get(ref.format);
    if (owner === undefined) throw new Error(`No Project Object owner is selected for ${ref.format}.`);
    return verifyObservation(await owner.observe(ref, { projectRoot }), ref);
  };

  return {
    observe,
    async project(projectRoot, seeds = []) {
      const discovered = (await Promise.all([...owners.values()].map(async (owner) => {
        const refs = await owner.discover({ projectRoot });
        for (const ref of refs) {
          assertProjectObjectRef(ref);
          if (ref.format !== owner.format) {
            throw new Error(`Project Object owner ${owner.format} discovered ${ref.format}.`);
          }
        }
        return refs;
      }))).flat();

      const queued = new Map<string, ProjectObjectRef>();
      for (const ref of [...discovered, ...seeds]) queued.set(projectObjectRefKey(ref), ref);
      const observations = new Map<string, ProjectObjectObservation>();
      const unresolved = new Map<string, ProjectObjectRef>();

      while (queued.size > 0) {
        const entry = queued.entries().next().value as [string, ProjectObjectRef] | undefined;
        if (entry === undefined) break;
        const [key, ref] = entry;
        queued.delete(key);
        if (observations.has(key) || unresolved.has(key)) continue;
        if (!owners.has(ref.format)) {
          unresolved.set(key, { ...ref });
          continue;
        }
        const observation = await observe(projectRoot, ref);
        observations.set(key, observation);
        for (const reference of observation.references) {
          const referenceKey = projectObjectRefKey(reference);
          if (!observations.has(referenceKey) && !unresolved.has(referenceKey)) {
            queued.set(referenceKey, reference);
          }
        }
      }

      return {
        projectRoot,
        objects: [...observations.values()].sort((left, right) =>
          projectObjectRefKey(left.ref).localeCompare(projectObjectRefKey(right.ref))),
        unresolved: [...unresolved.values()].sort((left, right) =>
          projectObjectRefKey(left).localeCompare(projectObjectRefKey(right))),
      } satisfies ProductionContext;
    },
  };
}

export function createProductionContextHostFromFacets(
  facets: readonly Facet[],
): ProductionContextHost {
  return createProductionContextHost(projectObjectOwnersFromFacets(facets));
}
