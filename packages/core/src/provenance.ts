import type {
  Derivation,
  DerivationId,
  Digest,
  Need,
  Receipt,
  ReceiptId,
} from "@svml/protocol";

import { digestOf } from "./canonical.js";

export function commandId(build: string, kind: string, subject: string): string {
  return `command:${digestOf({ build, kind, subject })}`;
}

export function eventDigest(event: unknown): Digest {
  return digestOf(event);
}

export function needRequestDigest(
  need: Pick<Need, "wants" | "constraints" | "result" | "accepts" | "conformanceFloor">,
): Digest {
  return digestOf({
    wants: need.wants,
    constraints: need.constraints,
    result: need.result,
    accepts: need.accepts,
    conformanceFloor: need.conformanceFloor,
  });
}

export function derivationId(derivation: Omit<Derivation, "id">): DerivationId {
  return `derivation:${digestOf(derivation)}`;
}

export function receiptId(receipt: Omit<Receipt, "id">): ReceiptId {
  return `receipt:${digestOf(receipt)}`;
}
