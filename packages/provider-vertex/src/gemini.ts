import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";

export type VertexGeminiPart =
  | { readonly text?: string; readonly inlineData?: never }
  | { readonly inlineData?: { readonly mimeType: string; readonly data: string }; readonly text?: never };

export type VertexGeminiGenerateInput = {
  readonly parts: readonly VertexGeminiPart[];
  readonly instruction: string;
};

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

/** Vertex Gemini VLM generator for text, image and video inline parts. */
export function createVertexGeminiGenerator(options: VertexGeminiGeneratorOptions) {
  const project = options.project.trim();
  assert(project.length > 0, "Vertex project is empty");
  const model = options.model?.trim() || "gemini-3.1-pro-preview";
  const client = new GoogleGenAI({
    vertexai: true,
    project,
    location: options.location?.trim() || "global",
    googleAuthOptions: {
      credentials: parseCredentials(options.credentials),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
  });

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
