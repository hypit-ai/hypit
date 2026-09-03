import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { EndpointInvocationContext, ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { geminiCapabilities, geminiModels, verifyGeminiRequest } from "@hypit/gemini";
import type { GeminiRequest } from "@hypit/gemini";
import { canonicalize } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef } from "@hypit/runtime";
import { sealText, textTypes } from "@hypit/text";

import { createVertexGeminiGenerator } from "./gemini.js";

export const vertexProviderModuleRef = { name: "@hypit/provider-vertex", version: "1" } as const;

export type CreateVertexProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly project: CredentialRef;
  readonly credentials: CredentialRef;
  readonly location?: string;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
};

function secret(context: EndpointInvocationContext, name: "project" | "credentials"): string {
  const value = context.credentials[name]?.secret;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Vertex ${name} credential is unavailable`);
  return value;
}

export function createVertexProvider(options: CreateVertexProviderOptions) {
  const handler: ImmediateEndpointHandler = async (context) => {
    const request = context.need.constraints as unknown;
    verifyGeminiRequest(request);
    const typed = request as GeminiRequest;
    const generate = createVertexGeminiGenerator({
      project: secret(context, "project"),
      credentials: secret(context, "credentials"),
      model: context.need.capability.name,
      ...(options.location === undefined ? {} : { location: options.location }),
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
    });
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: typed.prompt }];
    for (const item of typed.media) {
      const bytes = await context.resources.get(item.artifact.resource);
      if (bytes === undefined) throw new Error(`Vertex Gemini reference artifact ${item.artifact.resource} is unavailable`);
      parts.push({ inlineData: { mimeType: item.artifact.mediaType, data: Buffer.from(bytes).toString("base64") } });
    }
    const value = await generate({ parts, instruction: typed.instruction });
    return { value: { kind: "inline", value: canonicalize(sealText(value)) } };
  };
  return defineEndpointPackage({
    module: vertexProviderModuleRef,
    facet: "gemini",
    instance: options.instance ?? "vertex.default",
    pool: options.pool ?? options.instance ?? "vertex.default",
    pricing: { kind: "page", url: "https://cloud.google.com/vertex-ai/generative-ai/pricing" },
    credentials: {
      project: options.project ?? credentialRef("env", "GOOGLE_CLOUD_PROJECT"),
      credentials: options.credentials ?? credentialRef("env", "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
    },
    credentialInputs: {
      project: { label: "Google Cloud project" },
      credentials: { label: "Google application credentials", kind: "json" },
    },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    capabilities: geminiModels.map((model) => ({
      capability: geminiCapabilities[model],
      returns: textTypes.text,
      lifecycle: "immediate" as const,
      handler,
      lane: model,
    })),
  });
}
