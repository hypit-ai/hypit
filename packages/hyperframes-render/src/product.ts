import { digestOf } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import { assertHyperframesDocument } from "@narratage/hyperframes";
import type { HyperframesDocument } from "@narratage/hyperframes";

export const requestHyperframesVisualImplementationDigest = digestOf("@narratage/hyperframes-render/request-visual@1");

export function hyperframesVisualRequest(document: HyperframesDocument): CanonicalValue {
  assertHyperframesDocument(document);
  return {
    contract: "svml.hyperframes-visual-render-request@1",
    document,
  };
}
