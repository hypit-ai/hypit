import type { BuildDefinition } from "@hypit/protocol";
import type { BuildCatalogDescriptor } from "./catalog.js";
import type { BuildExecutionRequest, BuildExecutionSnapshot } from "./execution.js";

export type PendingBuildSubmission = BuildExecutionRequest & {
  readonly createdAt: number;
};

export type PendingBuildCommit = BuildExecutionRequest & {
  readonly definition: BuildDefinition;
  readonly catalog: BuildCatalogDescriptor;
};

/**
 * One exact cross-store submission transaction. A pending submission is not schedulable and can
 * only become active execution or be explicitly discarded with its Result draft and temporary resources.
 */
export type PendingBuildStore = {
  prepare(request: BuildExecutionRequest, options?: { readonly now?: number }): Promise<PendingBuildSubmission>;
  read(build: string): Promise<PendingBuildSubmission | undefined>;
  list(): Promise<readonly PendingBuildSubmission[]>;
  commit(request: PendingBuildCommit): Promise<BuildExecutionSnapshot>;
  discard(build: string): Promise<void>;
};
