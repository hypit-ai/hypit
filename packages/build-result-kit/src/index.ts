import type { BuildResultRepository } from "@hypit/build-result";
import type { HostFacet } from "@hypit/host";
import type { CanonicalValue } from "@hypit/protocol";

export const buildResultRepositoryHostAbi = "hypit.build-result-repository-host@1";

export type BuildResultRepositorySelection = {
  readonly use: string;
  readonly config?: CanonicalValue;
};

/** Serializable address carried by a queued Build so a detached Worker can reopen its Repository. */
export type BuildResultRepositoryLocation = {
  readonly root: string;
  readonly selection: BuildResultRepositorySelection;
};

export type BuildResultRepositoryContext = {
  /** Directory containing the configuration that selected this Repository. */
  readonly root: string;
  readonly config: CanonicalValue;
};

export type BuildResultRepositoryOpened = {
  readonly repository: BuildResultRepository;
  readonly close?: () => void | Promise<void>;
};

export type BuildResultRepositoryDiagnostic = {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type BuildResultRepositoryAdapter = {
  validate(context: BuildResultRepositoryContext): void;
  open(context: BuildResultRepositoryContext): BuildResultRepositoryOpened | Promise<BuildResultRepositoryOpened>;
  /** Active, read-only reachability/permission diagnosis for the selected backing store. */
  doctor?(context: BuildResultRepositoryContext): readonly BuildResultRepositoryDiagnostic[] | Promise<readonly BuildResultRepositoryDiagnostic[]>;
};

export type BuildResultRepositoryHostFacet = HostFacet & {
  readonly abi: typeof buildResultRepositoryHostAbi;
  readonly offers: readonly [string];
  readonly implementation: BuildResultRepositoryAdapter;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function createBuildResultRepositoryHostFacet(options: {
  readonly use: string;
  readonly validate: BuildResultRepositoryAdapter["validate"];
  readonly open: BuildResultRepositoryAdapter["open"];
  readonly doctor?: BuildResultRepositoryAdapter["doctor"];
}): BuildResultRepositoryHostFacet {
  assert(options.use.trim().length > 0, "Build Result Repository use name is empty");
  return {
    abi: buildResultRepositoryHostAbi,
    offers: [options.use],
    implementation: {
      validate: options.validate,
      open: options.open,
      ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
    },
  };
}

export function isBuildResultRepositoryHostFacet(value: HostFacet): value is BuildResultRepositoryHostFacet {
  if (value.abi !== buildResultRepositoryHostAbi || value.offers?.length !== 1) return false;
  const implementation = value.implementation as Partial<BuildResultRepositoryAdapter> | null;
  return (
    implementation !== null && typeof implementation === "object"
      && typeof implementation.validate === "function"
      && typeof implementation.open === "function"
      && (implementation.doctor === undefined || typeof implementation.doctor === "function")
  );
}

export class BuildResultRepositoryRegistry {
  readonly #adapters = new Map<string, BuildResultRepositoryAdapter>();

  registerFacet(facet: HostFacet): void {
    assert(isBuildResultRepositoryHostFacet(facet), `Host facet ${facet.abi} is not a Build Result Repository`);
    const use = facet.offers[0];
    assert(!this.#adapters.has(use), `Build Result Repository ${use} is already registered`);
    this.#adapters.set(use, facet.implementation);
  }

  has(use: string): boolean {
    return this.#adapters.has(use);
  }

  validate(selection: BuildResultRepositorySelection, root: string): void {
    const adapter = this.#adapters.get(selection.use);
    assert(adapter !== undefined, `Build Result Repository ${selection.use} is not installed`);
    adapter.validate({ root, config: selection.config ?? {} });
  }

  async open(selection: BuildResultRepositorySelection, root: string): Promise<BuildResultRepositoryOpened> {
    const adapter = this.#adapters.get(selection.use);
    assert(adapter !== undefined, `Build Result Repository ${selection.use} is not installed`);
    const context = { root, config: selection.config ?? {} };
    adapter.validate(context);
    return await adapter.open(context);
  }

  async doctor(
    selection: BuildResultRepositorySelection,
    root: string,
  ): Promise<readonly BuildResultRepositoryDiagnostic[]> {
    const adapter = this.#adapters.get(selection.use);
    assert(adapter !== undefined, `Build Result Repository ${selection.use} is not installed`);
    const context = { root, config: selection.config ?? {} };
    adapter.validate(context);
    return await adapter.doctor?.(context) ?? [];
  }
}

export function buildResultConfigObject(value: CanonicalValue, subject: string): Record<string, CanonicalValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} config must be an object`);
  }
  return value as Record<string, CanonicalValue>;
}

export function buildResultConfigExact(value: Readonly<Record<string, CanonicalValue>>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw new Error(`${subject} config does not accept ${unknown}`);
}

export function buildResultConfigString(value: CanonicalValue | undefined, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

export function buildResultConfigBoolean(value: CanonicalValue | undefined, subject: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${subject} must be a boolean`);
  return value;
}
