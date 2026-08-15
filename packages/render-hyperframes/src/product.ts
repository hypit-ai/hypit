import { digestOf } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import { assertHyperframesDocument } from "@narratage/hyperframes";
import type { HyperframesDocument } from "@narratage/hyperframes";

export function hyperframesVisualRequest(document: HyperframesDocument): CanonicalValue {
  assertHyperframesDocument(document);
  return {
    document,
  };
}
