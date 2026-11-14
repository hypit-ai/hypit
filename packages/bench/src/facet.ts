import type { Facet } from "@hypit/facet";

import type { ProjectBench } from "./types.js";

export const projectBenchFacetKind = "hypit.project-bench";

export type ProjectBenchFacet = Facet & {
  readonly kind: typeof projectBenchFacetKind;
  readonly address: string;
  readonly implementation: ProjectBench;
};

function assertBenchId(value: string): void {
  if (value.trim().length === 0 || value.trim() !== value || /\s/u.test(value)
    || /@[1-9][0-9]*$/u.test(value)) {
    throw new Error("Project Bench id must be one non-empty unversioned identity.");
  }
}

function assertFormatIdentity(value: string, label: string): void {
  if (value.trim() !== value || !/@[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} must name one exact format major.`);
  }
}

export function assertProjectBench(value: ProjectBench): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project Bench must be an object.");
  }
  assertBenchId(value.id);
  if (typeof value.label !== "string" || value.label.trim().length === 0) {
    throw new Error(`Project Bench ${value.id} has an empty label.`);
  }
  if (!Array.isArray(value.formats) || value.formats.length === 0) {
    throw new Error(`Project Bench ${value.id} must name at least one object format.`);
  }
  const formats = new Set<string>();
  for (const format of value.formats) {
    assertFormatIdentity(format, `Project Bench ${value.id} format`);
    if (formats.has(format)) throw new Error(`Project Bench ${value.id} repeats format ${format}.`);
    formats.add(format);
  }
  if (typeof value.open !== "function") throw new Error(`Project Bench ${value.id} has no opener.`);
}

export function createProjectBenchFacet(value: ProjectBench): ProjectBenchFacet {
  assertProjectBench(value);
  return { kind: projectBenchFacetKind, address: value.id, implementation: value };
}

export function projectBenchesFromFacets(facets: readonly Facet[]): readonly ProjectBench[] {
  return facets.flatMap((facet) => {
    if (facet.kind !== projectBenchFacetKind) return [];
    const bench = (facet as ProjectBenchFacet).implementation;
    assertProjectBench(bench);
    if (facet.address !== bench.id) throw new Error("Project Bench facet address does not match its id.");
    return [bench];
  });
}
