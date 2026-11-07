import { materializeProducts } from "@hypit/hypit/product";
import type {
  ProductMaterializationState,
  ProductMaterializationTarget,
} from "@hypit/hypit/product";
import type { PublicationIntent } from "@hypit/hypit/protocol";

import type {
  BuildResultDraft,
  BuildResultSync,
} from "./types.js";

export type BuildResultWriterState = ProductMaterializationState & {
  readonly publication: PublicationIntent;
};

export type BuildResultWriteTarget = ProductMaterializationTarget;

export type BuildResultSyncResult = {
  readonly changed: boolean;
  readonly manifest: BuildResultDraft;
  readonly writer: BuildResultWriterState;
};

/** Transitional Result adapter: Product owns value materialization while Result still owns the draft. */
export async function syncBuildResultOutputs(input: {
  readonly manifest: BuildResultDraft;
  readonly writer: BuildResultWriterState;
  readonly sync: BuildResultSync;
  readonly target: BuildResultWriteTarget;
}): Promise<BuildResultSyncResult> {
  const materialized = await materializeProducts({
    publication: input.writer.publication,
    products: input.manifest.outputs,
    state: input.writer,
    records: input.sync.records,
    resources: input.sync.resources,
    target: input.target,
  });
  return {
    changed: materialized.changed,
    manifest: { ...input.manifest, outputs: materialized.products },
    writer: { ...materialized.state, publication: input.writer.publication },
  };
}
