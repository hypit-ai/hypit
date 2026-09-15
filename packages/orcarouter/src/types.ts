import type { BlobRef } from "@hypit/protocol";

/** One OrcaRouter chat request, assembled in full before its Need is fulfilled. */
export type OrcaRouterChatRequest = {
  /** Vendor-namespaced catalogue ID, preserved exactly as `GET /v1/models` returned it. */
  readonly model: string;
  readonly prompt: string;
  /** Image Artifacts the request carries alongside the prompt; empty for a text-only ask. */
  readonly images: readonly BlobRef[];
};

/** One OrcaRouter chat completion. */
export type OrcaRouterChatResult = {
  readonly text: string;
};
