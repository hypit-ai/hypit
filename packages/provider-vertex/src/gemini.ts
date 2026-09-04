import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";
import type { GeminiGenerateInput, GeminiInlinePart } from "@hypit/gemini";

export type VertexGeminiPart = GeminiInlinePart;
export type VertexGeminiGenerateInput = GeminiGenerateInput;

export type VertexGeminiGeneratorOptions = {
  readonly project: string;
  readonly credentials: Record<string, unknown> | string;
  readonly location?: string;
  readonly model?: string;
  readonly requestTimeoutMs?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseCredentials(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") return value;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON"); }
  assert(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed), "Google credentials must be an object");
  return parsed as Record<string, unknown>;
}

/**
 * The Vertex publisher id behind each Hypit Gemini capability. The capability names the model the
 * author chose; the id Vertex serves it under is this Provider's fact. A capability without an
 * entry is refused rather than sent under a name Vertex may not recognise.
 */
const VERTEX_MODEL_IDS: Readonly<Record<string, string>> = {
  "gemini-3.1-pro": "gemini-3.1-pro-preview",
};

export function vertexModelId(capabilityName: string): string {
  const id = VERTEX_MODEL_IDS[capabilityName];
  if (id === undefined) throw new Error(`Vertex Provider has no published model id for ${capabilityName}`);
  return id;
}

export type VertexClientOptions = {
  readonly project: string;
  readonly credentials: Record<string, unknown> | string;
  readonly location?: string;
  readonly requestTimeoutMs?: number;
};

export function createVertexClient(options: VertexClientOptions): GoogleGenAI {
  const project = options.project.trim();
  assert(project.length > 0, "Vertex project is empty");
  return new GoogleGenAI({
    vertexai: true,
    project,
    location: options.location?.trim() || "global",
    googleAuthOptions: {
      credentials: parseCredentials(options.credentials),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
    httpOptions: { timeout: options.requestTimeoutMs ?? 300_000 },
  });
}

/** Ask Vertex whether this project can reach the model; the service's own message says why not. */
export async function probeVertexModel(options: VertexClientOptions, modelId: string): Promise<void> {
  await createVertexClient(options).models.get({ model: modelId });
}

/** Vertex Gemini VLM generator for text, image and video inline parts. */
export function createVertexGeminiGenerator(options: VertexGeminiGeneratorOptions) {
  const model = options.model?.trim() || vertexModelId("gemini-3.1-pro");
  const client = createVertexClient(options);

  return async (input: VertexGeminiGenerateInput): Promise<string> => {
    const result = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: input.parts as unknown as Content["parts"] }] as never,
      config: { systemInstruction: input.instruction, temperature: 1.0, responseMimeType: "text/plain" },
    });
    const text = result.text?.trim() ?? "";
    assert(text.length > 0, "Vertex Gemini returned an empty response");
    return text;
  };
}
