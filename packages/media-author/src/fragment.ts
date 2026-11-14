import { sealGraphFragment } from "@hypit/generation-authoring/author";
import { blobTypes } from "@hypit/blob";
import { temporalTypes } from "@hypit/temporal-graph";

import { mediaProducers, mediaTypes } from "@hypit/media";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * One Media author object exposes its Resource and derives prepared facets lazily.
 * Generation Build target closure omits inspect/select/prepare when only `resource` is demanded.
 */
export const mediaSourceFragment = sealGraphFragment({
  inputs: [
    { name: "resource", type: blobTypes.blob },
    { name: "request", type: mediaTypes.selectionRequest },
    { name: "domain", type: mediaTypes.domainSpec },
  ],
  operations: [
    {
      id: "resource",
      producer: mediaProducers.resource,
      inputs: { resource: input("resource") },
      result: { kind: "output" as const, name: "resource" },
    },
    {
      id: "inspect",
      producer: mediaProducers.inspect,
      inputs: { source: input("resource") },
      result: { kind: "need" as const, name: "inspection" },
    },
    {
      id: "select",
      producer: mediaProducers.select,
      inputs: { inspection: operation("inspect"), request: input("request") },
      result: { kind: "output" as const, name: "selection" },
    },
    {
      id: "prepare",
      producer: mediaProducers.prepare,
      inputs: {
        source: input("resource"),
        inspection: operation("inspect"),
        selection: operation("select"),
        spec: input("domain"),
      },
      result: { kind: "output" as const, name: "media" },
    },
    {
      id: "domain",
      producer: mediaProducers.localDomain,
      inputs: { media: operation("prepare") },
      result: { kind: "output" as const, name: "domain" },
    },
    {
      id: "extent",
      producer: mediaProducers.extent,
      inputs: { domain: operation("domain") },
      result: { kind: "output" as const, name: "extent" },
    },
  ],
  exports: [
    { name: "default", type: blobTypes.blob, root: operation("resource") },
    { name: "resource", type: blobTypes.blob, root: operation("resource") },
    { name: "source", type: mediaTypes.prepared, root: operation("prepare") },
    { name: "domain", type: temporalTypes.localDomain, root: operation("domain") },
    { name: "extent", type: temporalTypes.extent, root: operation("extent") },
  ],
});
