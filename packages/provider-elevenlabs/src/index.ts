import { aliases } from "./aliases.js";
import { catalog, models } from "@hypit/elevenlabs-models";
import { createProvider } from "@hypit/direct-model-kit/provider";
import type { Options, RemoteTask } from "@hypit/direct-model-kit/provider";
import {
  Client,
  assert,
  object,
  keyFor,
  clean,
} from "@hypit/direct-model-kit/transport";
import { requestFor, validateMedia } from "./requests.js";
export type { Options as ElevenLabsProviderOptions };
export function createElevenLabsProvider(options: Options = {}) {
  const client = new Client(
    "ElevenLabs",
    options.baseUrl ?? "https://api.us.elevenlabs.io",
    "xi-api-key",
    false,
    options.requestTimeoutMs,
    options.fetch,
  );
  return createProvider(
    {
      name: "elevenlabs",
      aliases,
      catalog,
      definition: models.definition,
      pricing: "https://elevenlabs.io/pricing/api",
      validateSupport: (m, r) =>
        validateMedia(
          m,
          r.constraints as unknown as import("@hypit/generation").GenerationRequest,
        ),
      asynchronous: (m) => m.path.startsWith("/v1/flows/"),
      async submit(m, r, c) {
        const request = await requestFor(m, r, c);
        const response = await client.json(
          request.path,
          keyFor(c),
          request.init,
        );
        assert(
          typeof response.id === "string",
          "ElevenLabs submission has no ID",
        );
        return response.id;
      },
      async poll(m, id, c): Promise<RemoteTask> {
        const r = await client.json(
          `${m.path}/${encodeURIComponent(id)}`,
          keyFor(c),
        );
        assert(r.id === id, "ElevenLabs returned a different generation ID");
        if (r.status === "pending" || r.status === "generating")
          return { id, status: "pending" };
        if (r.status === "failed")
          return {
            id,
            status: "failed",
            code: clean(String(r.failure_reason ?? "REMOTE_FAILED"), keyFor(c)),
            message: clean(
              String(r.error_message ?? "Generation failed"),
              keyFor(c),
            ),
          };
        assert(
          r.status === "completed" && typeof r.content_url === "string",
          "Invalid ElevenLabs generation status/output",
        );
        assert(
          typeof r.content_mime_type === "string" &&
            r.content_mime_type.startsWith(m.result + "/"),
          "ElevenLabs output MIME type mismatch",
        );
        return { id, status: "completed", urls: [r.content_url] };
      },
      download: (url, m, c) => client.download(url, m.result, c.resources),
      async immediate(m, r, c) {
        const req = await requestFor(m, r, c);
        if (m.operation === "design") {
          const response = await client.json(req.path, keyFor(c), req.init);
          assert(
            Array.isArray(response.previews) && response.previews.length > 0,
            "ElevenLabs returned no voice previews",
          );
          const ids = response.previews.map(
            (x) => object(x).generated_voice_id,
          );
          assert(
            ids.every((x) => typeof x === "string"),
            "Voice previews missing IDs",
          );
          const blobs = [];
          for (const raw of response.previews) {
            const p = object(raw);
            assert(
              typeof p.audio_base_64 === "string" &&
                p.audio_base_64.length < 140 * 1024 * 1024 &&
                typeof p.media_type === "string" &&
                p.media_type.startsWith("audio/"),
              "Invalid voice preview audio",
            );
            blobs.push(
              await c.resources.put(
                new Uint8Array(Buffer.from(p.audio_base_64, "base64")),
                p.media_type,
              ),
            );
          }
          return { blobs };
        }
        const response = await client.request(req.path, keyFor(c), req.init);
        assert(
          response.type.startsWith("audio/") && response.bytes.length > 0,
          "ElevenLabs returned non-audio data",
        );
        return {
          blobs: [await c.resources.put(response.bytes, response.type)],
        };
      },
    },
    options,
  );
}
export { createElevenLabsVoiceLibrary } from "./voices.js";
