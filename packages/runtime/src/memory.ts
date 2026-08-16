import { materializeBuild } from "@narratage/core";
import type { BuildDefinition, BuildFact } from "@narratage/protocol";

import type {
  BuildSnapshot,
  BuildStore,
} from "./types.js";

type StoredBuild = {
  readonly build: string;
  readonly definition: BuildDefinition;
  readonly facts: readonly BuildFact[];
};

function snapshotBuild(stored: StoredBuild): BuildSnapshot {
  const definition = structuredClone(stored.definition);
  const facts = structuredClone(stored.facts);
  return {
    build: stored.build,
    definition,
    facts,
    state: materializeBuild(definition, facts),
  };
}

/** Reference Fact Store for tests and one-process local Builds. It does not persist Operations. */
export class MemoryBuildStore implements BuildStore {
  readonly #builds = new Map<string, StoredBuild>();

  async create(build: string, definition: BuildDefinition): Promise<BuildSnapshot> {
    if (build.trim().length === 0) throw new Error("build id must not be empty");
    if (this.#builds.has(build)) throw new Error(`build ${build} already exists`);
    const stored = { build, definition: structuredClone(definition), facts: [] };
    this.#builds.set(build, stored);
    return snapshotBuild(stored);
  }

  async read(build: string): Promise<BuildSnapshot | undefined> {
    const snapshot = this.#builds.get(build);
    return snapshot === undefined ? undefined : snapshotBuild(snapshot);
  }

  async list(): Promise<readonly BuildSnapshot[]> {
    return [...this.#builds.values()]
      .sort((left, right) => left.build.localeCompare(right.build))
      .map(snapshotBuild);
  }

  async append(build: string, fact: BuildFact): Promise<void> {
    const current = this.#builds.get(build);
    if (current === undefined) throw new Error(`build ${build} does not exist`);
    const stored = {
      build,
      definition: current.definition,
      facts: [...current.facts, structuredClone(fact)],
    };
    this.#builds.set(build, stored);
  }
}
