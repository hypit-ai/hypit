import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { EndpointInvocationContext, ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { geminiCapabilities, geminiModels, verifyGeminiRequest } from "@hypit/gemini";
import type { CapabilityRef } from "@hypit/protocol";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-kit";
import type { GeminiRequest } from "@hypit/gemini";
import { canonicalize } from "@hypit/protocol";
import type { CredentialRef } from "@hypit/runtime";
import { sealText, textTypes } from "@hypit/text";

import { createVertexGeminiGenerator, probeVertexModel, vertexModelId } from "./gemini.js";

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

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

/** Active doctor: can this project reach each declared model on Vertex? Vertex says why when not. */
export async function diagnoseVertexProvider(
  options: Pick<CreateVertexProviderOptions, "location" | "requestTimeoutMs">,
  context: {
    readonly credentials: Readonly<Record<string, { readonly secret: string }>>;
    readonly capabilities?: readonly CapabilityRef[];
  },
): Promise<readonly RuntimeDoctorDiagnostic[]> {
  const project = context.credentials.project?.secret ?? "";
  const credentials = context.credentials.credentials?.secret ?? "";
  if (project.trim().length === 0 || credentials.trim().length === 0) {
    return [{ severity: "error", code: "VERTEX_CREDENTIALS_MISSING", message: "Vertex project and credentials are not both configured" }];
  }
  const requested = context.capabilities ?? geminiModels.map((model) => geminiCapabilities[model]);
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  for (const capability of requested) {
    if (!geminiModels.some((model) => capabilityKey(geminiCapabilities[model]) === capabilityKey(capability))) continue;
    try {
      await probeVertexModel({
        project,
        credentials,
        ...(options.location === undefined ? {} : { location: options.location }),
        ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
      }, vertexModelId(capability.name));
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "VERTEX_MODEL_UNAVAILABLE",
        message: `${project} cannot reach ${vertexModelId(capability.name)} on Vertex: ${error instanceof Error ? error.message.slice(0, 400) : String(error)}`,
        subject: capabilityKey(capability),
      });
    }
  }
  return diagnostics;
}

export function createVertexProvider(options: CreateVertexProviderOptions) {
  // Every declared capability must have a Vertex id before anything is registered.
  for (const model of geminiModels) vertexModelId(model);
  const handler: ImmediateEndpointHandler = async (context) => {
    const request = context.need.constraints as unknown;
    verifyGeminiRequest(request);
    const typed = request as GeminiRequest;
    const generate = createVertexGeminiGenerator({
      project: secret(context, "project"),
      credentials: secret(context, "credentials"),
      model: vertexModelId(context.need.capability.name),
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
      project: options.project,
      credentials: options.credentials,
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
