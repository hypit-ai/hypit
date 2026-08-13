import { verifyBuildState } from "@narratage/core";
import type { BuildState } from "@narratage/protocol";

import type {
  BuildSnapshot,
  BuildStore,
  BuildStoreWrite,
} from "./types.js";

function copy(snapshot: BuildSnapshot): BuildSnapshot {
  return structuredClone(snapshot);
}

function durableState(state: BuildState): BuildState {
  const normalized = { ...structuredClone(state), outstanding: [] };
  verifyBuildState(normalized);
  return normalized;
}

/** Reference CAS Store for tests and one-process local Builds. It does not persist Operations. */
export class MemoryBuildStore implements BuildStore {
  readonly #builds = new Map<string, BuildSnapshot>();

  async create(build: string, state: BuildState): Promise<BuildSnapshot> {
    if (build.trim().length === 0) throw new Error("build id must not be empty");
    if (this.#builds.has(build)) throw new Error(`build ${build} already exists`);
    const snapshot = { build, revision: 0, state: durableState(state) };
    this.#builds.set(build, snapshot);
    return copy(snapshot);
  }

  async read(build: string): Promise<BuildSnapshot | undefined> {
    const snapshot = this.#builds.get(build);
    return snapshot === undefined ? undefined : copy(snapshot);
  }

  async list(): Promise<readonly BuildSnapshot[]> {
    return [...this.#builds.values()]
      .sort((left, right) => left.build.localeCompare(right.build))
      .map(copy);
  }

  async compareAndSwap(
    build: string,
    expectedRevision: number,
    state: BuildState,
  ): Promise<BuildStoreWrite> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("expected revision must be a non-negative safe integer");
    }
    const current = this.#builds.get(build);
    if (current === undefined) throw new Error(`build ${build} does not exist`);
    if (current.revision !== expectedRevision) {
      return { status: "conflict", current: copy(current) };
    }
    const snapshot = {
      build,
      revision: current.revision + 1,
      state: durableState(state),
    };
    this.#builds.set(build, snapshot);
    return { status: "stored", snapshot: copy(snapshot) };
  }
}
