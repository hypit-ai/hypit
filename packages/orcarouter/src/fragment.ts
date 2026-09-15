import { sealGraphFragment } from "@hypit/elaborator";

import { orcaRouterProducers, orcaRouterTypes } from "./manifest.js";

/**
 * One request producer whose only result is the external Need. Image Artifacts and their Texts are
 * sealed into the request Record before this fragment runs, so the Provider receives a complete
 * request rather than a graph to reverse-engineer.
 */
export const orcaRouterFragment = sealGraphFragment({
  inputs: [{ name: "request", type: orcaRouterTypes.chatRequest }],
  operations: [{
    id: "chat:generate",
    producer: orcaRouterProducers.request,
    inputs: { request: { kind: "fragment-input", name: "request" } },
    result: { kind: "need", name: "chat" },
  }],
  exports: [{
    name: "chat",
    type: orcaRouterTypes.chat,
    root: { kind: "fragment-operation", operation: "chat:generate" },
  }],
});
