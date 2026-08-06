import { digestOf } from "@svml/protocol";
import type { CanonicalValue } from "@svml/protocol";
import { assertHyperframesDocument } from "@svml/hyperframes";
import type { HyperframesDocument } from "@svml/hyperframes";

export const requestHyperframesVisualImplementationDigest = digestOf("@svml/hyperframes-render/request-visual@1");

export function hyperframesVisualRequest(document: HyperframesDocument): CanonicalValue {
  assertHyperframesDocument(document);
  return {
    contract: "svml.hyperframes-visual-render-request@1",
    document,
  };
}
