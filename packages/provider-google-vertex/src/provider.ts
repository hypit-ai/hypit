import { GoogleGenAI, Type } from "@google/genai";
import type { GenerateContentResponse, GoogleGenAIOptions, Schema } from "@google/genai";
import { captionTypes } from "@narratage/caption";
import {
  captionGeminiCapabilities,
  sealCaptionGeminiPlan,
  verifyCaptionGeminiRequest,
} from "@narratage/caption-gemini";
import type { CaptionGeminiRequest } from "@narratage/caption-gemini";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { EndpointFulfillment, EndpointInvocationContext } from "@narratage/endpoint-kit";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, Digest } from "@narratage/protocol";
import { credentialRef } from "@narratage/runtime";
import type { CredentialRef } from "@narratage/runtime";

export const googleVertexProviderModuleRef = {
  name: "@narratage/provider-google-vertex",
  version: "1",
} as const;
export const googleVertexProviderImplementationDigest = digestOf(
  "@narratage/provider-google-vertex/caption-atom-word-coordinates@1:@google/genai@1.52.0",
);

type GenerateCaptionContentInput = {
  readonly model: string;
  readonly systemInstruction: string;
  readonly prompt: string;
  readonly temperature: number;
  readonly responseSchema: Schema;
  readonly abortSignal: AbortSignal;
  readonly credentialsJson: Readonly<Record<string, unknown>>;
  readonly project: string;
  readonly location: string;
};

export type GenerateCaptionContent = (
  input: GenerateCaptionContentInput,
) => Promise<{ readonly text: string; readonly totalTokenCount?: number; readonly modelVersion?: string }>;

export type CreateGoogleVertexCaptionProviderOptions = {
  readonly project: string;
  readonly location?: string;
  readonly instance?: string;
  readonly lane?: string;
  /** JSON contents, not a filesystem path. A CredentialStore decides where these bytes live. */
  readonly credentialsJson?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
  /** Test/private transport injection; its identity must be locked into Runtime configuration. */
  readonly generateContent?: GenerateCaptionContent;
  readonly generateContentImplementationDigest?: Digest;
};

const captionResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    runs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                atom_count: { type: Type.INTEGER, minimum: 1 },
                fields: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      declaration_id: { type: Type.STRING },
                      atom_number: { type: Type.INTEGER, minimum: 1 },
                      word_number: { type: Type.INTEGER, minimum: 1 },
                      value: { type: Type.STRING },
                    },
                    required: ["declaration_id", "atom_number", "word_number", "value"],
                    propertyOrdering: ["declaration_id", "atom_number", "word_number", "value"],
                  },
                },
              },
              required: ["atom_count", "fields"],
              propertyOrdering: ["atom_count", "fields"],
            },
          },
        },
        required: ["cues"],
        propertyOrdering: ["cues"],
      },
    },
  },
  required: ["runs"],
  propertyOrdering: ["runs"],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function credentialJson(context: EndpointInvocationContext): Readonly<Record<string, unknown>> {
  const secret = context.credentials.googleCredentials?.secret;
  assert(secret !== undefined && secret.length > 0, "Google Vertex credentials JSON is unavailable");
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error("Google Vertex credentials are not valid JSON");
  }
  assert(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed),
    "Google Vertex credentials JSON must be an object");
  const value = parsed as Readonly<Record<string, unknown>>;
  assert(typeof value.type === "string" && value.type.length > 0,
    "Google Vertex credentials JSON has no credential type");
  return value;
}

function requestValue(value: CanonicalValue): CaptionGeminiRequest {
  verifyCaptionGeminiRequest(value);
  return value;
}

function sdkGenerateContent(): GenerateCaptionContent {
  return async (input) => {
    const googleAuthOptions = {
      credentials: input.credentialsJson,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    } as NonNullable<GoogleGenAIOptions["googleAuthOptions"]>;
    const client = new GoogleGenAI({
      vertexai: true,
      project: input.project,
      location: input.location,
      googleAuthOptions,
    });
    const response: GenerateContentResponse = await client.models.generateContent({
      model: input.model,
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      config: {
        systemInstruction: input.systemInstruction,
        temperature: input.temperature,
        responseMimeType: "application/json",
        responseSchema: input.responseSchema,
        abortSignal: input.abortSignal,
      },
    });
    return {
      text: response.text ?? "",
      ...(response.usageMetadata?.totalTokenCount === undefined
        ? {} : { totalTokenCount: response.usageMetadata.totalTokenCount }),
      ...(response.modelVersion === undefined ? {} : { modelVersion: response.modelVersion }),
    };
  };
}

async function withTimeout<T>(timeoutMs: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error("Google Vertex request timed out"));
          reject(new Error("Google Vertex request timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function fulfillment(value: CanonicalValue, metadata: CanonicalValue): EndpointFulfillment {
  return {
    value: { kind: "inline", value },
    conformance: "exact",
    delivery: "executed",
    metadata,
  };
}

export function createGoogleVertexCaptionProvider(options: CreateGoogleVertexCaptionProviderOptions) {
  assert(options.project.trim().length > 0, "Google Vertex project is empty");
  const project = options.project.trim();
  const location = (options.location ?? "global").trim();
  assert(location.length > 0, "Google Vertex location is empty");
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? 120_000, "requestTimeoutMs");
  const maxResponseBytes = positiveInteger(options.maxResponseBytes ?? 2_000_000, "maxResponseBytes");
  if (options.generateContent !== undefined && options.generateContentImplementationDigest === undefined) {
    throw new Error("custom Google Vertex generateContent requires generateContentImplementationDigest");
  }
  if (options.generateContentImplementationDigest !== undefined && !isDigest(options.generateContentImplementationDigest)) {
    throw new Error("generateContentImplementationDigest is invalid");
  }
  const generateContent = options.generateContent ?? sdkGenerateContent();
  const transportDigest = options.generateContentImplementationDigest
    ?? digestOf("@narratage/provider-google-vertex/@google-genai-1.52.0@1");

  return defineEndpointPackage({
    module: googleVertexProviderModuleRef,
    facet: "caption-gemini",
    instance: options.instance ?? "google-vertex.caption",
    ...(options.lane === undefined ? {} : { lane: options.lane }),
    implementation: {
      locator: "@narratage/provider-google-vertex/caption-gemini",
      digest: googleVertexProviderImplementationDigest,
    },
    permissions: ["network:aiplatform.googleapis.com"],
    configuration: canonicalize({ project, location, requestTimeoutMs, maxResponseBytes, transportDigest }),
    credentials: {
      googleCredentials: options.credentialsJson ?? credentialRef("env", "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
    },
    credentialInputs: {
      googleCredentials: { label: "Google Cloud credentials JSON", kind: "json" },
    },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    capabilities: [{
      capability: captionGeminiCapabilities.plan,
      returns: captionTypes.plan,
      lifecycle: "immediate",
      supports: (need) => {
        try {
          verifyCaptionGeminiRequest(need.constraints);
          return true;
        } catch {
          return false;
        }
      },
      handler: async (context) => {
        const request = requestValue(context.need.constraints);
        const response = await withTimeout(requestTimeoutMs, (abortSignal) => generateContent({
          model: request.model,
          systemInstruction: request.systemInstruction,
          prompt: request.prompt,
          temperature: request.temperature,
          responseSchema: captionResponseSchema,
          abortSignal,
          credentialsJson: credentialJson(context),
          project,
          location,
        }));
        const responseBytes = Buffer.byteLength(response.text, "utf8");
        assert(responseBytes > 0, "Google Vertex returned an empty Caption plan");
        assert(responseBytes <= maxResponseBytes, "Google Vertex Caption response exceeded its configured limit");
        let raw: unknown;
        try {
          raw = JSON.parse(response.text);
        } catch {
          throw new Error("Google Vertex returned invalid Caption JSON");
        }
        const plan = sealCaptionGeminiPlan(request, raw);
        return fulfillment(canonicalize(plan), canonicalize({
          provider: "google-vertex",
          project,
          location,
          requestedModel: request.model,
          ...(response.modelVersion === undefined ? {} : { modelVersion: response.modelVersion }),
          ...(response.totalTokenCount === undefined ? {} : { totalTokenCount: response.totalTokenCount }),
          responseDigest: digestOf(response.text),
        }));
      },
    }],
  });
}
