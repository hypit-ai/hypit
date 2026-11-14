import type { Facet } from "@hypit/facet";
import { assertProjectObjectRef } from "@hypit/project";

import { assertProjectBench, projectBenchesFromFacets } from "./facet.js";
import type {
  ProjectBench,
  ProjectBenchHost,
  ProjectBenchRequest,
  ProjectBenchSession,
} from "./types.js";

function benchMap(values: readonly ProjectBench[]): ReadonlyMap<string, ProjectBench> {
  const result = new Map<string, ProjectBench>();
  for (const value of values) {
    assertProjectBench(value);
    if (result.has(value.id)) throw new Error(`Project Bench ${value.id} has multiple selected providers.`);
    result.set(value.id, value);
  }
  return result;
}

function verifySession(value: ProjectBenchSession, bench: string): ProjectBenchSession {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.title !== "string" || value.title.trim().length === 0
    || value.surface === null || typeof value.surface !== "object" || Array.isArray(value.surface)
    || value.surface.kind !== "web" || typeof value.surface.url !== "string"
    || typeof value.close !== "function") {
    throw new Error(`Project Bench ${bench} returned an invalid session.`);
  }
  try {
    new URL(value.surface.url);
  } catch {
    throw new Error(`Project Bench ${bench} returned an invalid Surface URL.`);
  }
  return value;
}

export function createProjectBenchHost(values: readonly ProjectBench[]): ProjectBenchHost {
  const benches = benchMap(values);
  // Provider selection is shared; opened sessions are not. The embedding Agent Host owns
  // tab identity, cardinality, ordering and closure, so opening the same Bench/Object again
  // always asks the provider for another disposable session.
  return {
    available(object) {
      assertProjectObjectRef(object);
      return [...benches.values()]
        .filter((bench) => bench.formats.includes(object.format))
        .map((bench) => ({ id: bench.id, label: bench.label }));
    },
    async open(id: string, request: ProjectBenchRequest) {
      assertProjectObjectRef(request.object);
      if (typeof request.projectRoot !== "string" || request.projectRoot.trim().length === 0) {
        throw new Error("Project Bench request has no Project Boundary.");
      }
      const bench = benches.get(id);
      if (bench === undefined) throw new Error(`Project Bench ${id} is not selected.`);
      if (!bench.formats.includes(request.object.format)) {
        throw new Error(`Project Bench ${id} cannot open ${request.object.format}.`);
      }
      return verifySession(await bench.open(request), id);
    },
  };
}

export function createProjectBenchHostFromFacets(facets: readonly Facet[]): ProjectBenchHost {
  return createProjectBenchHost(projectBenchesFromFacets(facets));
}
