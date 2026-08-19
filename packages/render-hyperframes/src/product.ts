import type { CanonicalValue } from "@hypit/protocol";
import { assertHyperframesDocument } from "@hypit/hyperframes";
import type { HyperframesDocument } from "@hypit/hyperframes";

export function hyperframesVisualRequest(document: HyperframesDocument): CanonicalValue {
  assertHyperframesDocument(document);
  return {
    document,
  };
}
