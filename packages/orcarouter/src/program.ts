import { canonicalize } from "@hypit/protocol";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import { verifyText } from "@hypit/text";

import type { OrcaRouterChatRequest } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** The model ID is the catalogue's own string; only its shape is checked here. */
export function assertOrcaRouterModel(model: unknown): asserts model is string {
  assert(typeof model === "string" && model.trim().length > 0,
    "OrcaRouter model must be the catalogue ID of the model to call");
  assert(model.trim() === model && !/\s/u.test(model),
    "OrcaRouter model must be the exact catalogue ID, with no surrounding or embedded whitespace");
  assert(model.includes("/"),
    "OrcaRouter model must keep its vendor namespace, for example anthropic/claude-opus-4.8");
}

function imageReference(value: StoredValue | undefined, subject: string): BlobRef {
  assert(value?.kind === "blob", `${subject} must be an image Blob Artifact`);
  assert(value.mediaType.startsWith("image/"), `${subject} must be image media`);
  return value;
}

export function assertOrcaRouterChatRequest(value: OrcaRouterChatRequest): void {
  assertOrcaRouterModel(value.model);
  assert(typeof value.prompt === "string", "OrcaRouter prompt must be Text");
  verifyText({ value: value.prompt });
  assert(Array.isArray(value.images), "OrcaRouter images must be a list");
  value.images.forEach((image, index) => {
    assert(image.kind === "blob" && image.mediaType.startsWith("image/"),
      `OrcaRouter image ${index + 1} must be image media`);
  });
}

/** Assemble one request from an authored prompt and its optional image Artifacts. */
export function orcaRouterChatRequest(
  model: string,
  prompt: string,
  images: readonly (StoredValue | undefined)[] = [],
): OrcaRouterChatRequest {
  const value = {
    model,
    prompt,
    images: images.map((image, index) => imageReference(image, `OrcaRouter image ${index + 1}`)),
  };
  assertOrcaRouterChatRequest(value);
  return canonicalize(value) as unknown as OrcaRouterChatRequest;
}

/** The wire text an attached image contributes: the OpenAI-compatible data URL form. */
export function imageDataUrl(image: BlobRef, bytes: Uint8Array): string {
  assert(bytes.byteLength > 0, `OrcaRouter image ${image.resource} is empty`);
  return `data:${image.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
