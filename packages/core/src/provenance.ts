import type {
  Derivation,
  DerivationId,
  Digest,
  Need,
  Receipt,
  ReceiptId,
} from "@narratage/protocol";

import { digestOf } from "./canonical.js";

export function commandId(build: string, kind: string, subject: string): string {
  return `command:${digestOf({ build, kind, subject })}`;
}

export function eventDigest(event: unknown): Digest {
  return digestOf(event);
}

export function needRequestDigest(
  need: Pick<Need, "capability" | "returns" | "constraints" | "result">,
): Digest {
  return digestOf({
    capability: need.capability,
    returns: need.returns,
    constraints: need.constraints,
    result: need.result,
  });
}

export function derivationId(derivation: Omit<Derivation, "id">): DerivationId {
  return `derivation:${digestOf(derivation)}`;
}

export function receiptId(receipt: Omit<Receipt, "id">): ReceiptId {
  return `receipt:${digestOf(receipt)}`;
}
