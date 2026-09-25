import {
  Client,
  assert,
  object,
  post,
} from "@hypit/direct-model-kit/transport";
/** Explicit account operations; never called implicitly by a video Build. Resolve the key from a credential store. */
export function createElevenLabsVoiceLibrary(options: {
  readonly credential: () => Promise<string>;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}) {
  const client = new Client(
    "ElevenLabs",
    options.baseUrl ?? "https://api.us.elevenlabs.io",
    "xi-api-key",
    false,
    300000,
    options.fetch,
  );
  const voiceId = (r: Record<string, unknown>) => {
    assert(
      typeof r.voice_id === "string" && r.voice_id.length > 0,
      "ElevenLabs returned no voice ID",
    );
    return r.voice_id;
  };
  return {
    async listVoices(cursor?: string) {
      return client.json(
        `/v2/voices?page_size=100${cursor ? `&next_page_token=${encodeURIComponent(cursor)}` : ""}`,
        await options.credential(),
      );
    },
    async listModels() {
      const r = await client.request("/v1/models", await options.credential());
      const value: unknown = JSON.parse(new TextDecoder().decode(r.bytes));
      assert(Array.isArray(value), "Invalid model list");
      return value.map((m) => object(m));
    },
    async cloneVoice(input: {
      name: string;
      description?: string;
      samples: readonly {
        bytes: Uint8Array;
        mediaType: string;
        name: string;
      }[];
    }) {
      assert(
        input.name.trim().length > 0 && input.samples.length > 0,
        "Voice name and samples are required",
      );
      const form = new FormData();
      form.set("name", input.name);
      if (input.description) form.set("description", input.description);
      for (const sample of input.samples) {
        assert(
          sample.mediaType.startsWith("audio/") &&
            sample.bytes.length > 0 &&
            sample.bytes.length <= 100 * 1024 * 1024,
          "Invalid voice sample",
        );
        form.append(
          "files",
          new Blob([new Uint8Array(sample.bytes)], { type: sample.mediaType }),
          sample.name,
        );
      }
      const response = await client.json(
        "/v1/voices/add",
        await options.credential(),
        { method: "POST", body: form },
      );
      return {
        voiceId: voiceId(response),
        requiresVerification: response.requires_verification === true,
      };
    },
    async designPreviews(input: {
      description: string;
      text: string;
      model?: "eleven_ttv_v3" | "eleven_multilingual_ttv_v2";
    }) {
      assert(
        input.description.length >= 20 &&
          input.description.length <= 1000 &&
          input.text.length >= 100 &&
          input.text.length <= 1000,
        "Voice description or preview text is outside supported limits",
      );
      return client.json(
        "/v1/text-to-voice/design",
        await options.credential(),
        post({
          voice_description: input.description,
          text: input.text,
          model_id: input.model ?? "eleven_ttv_v3",
        }),
      );
    },
    async saveDesignedVoice(input: {
      name: string;
      description: string;
      generatedVoiceId: string;
    }) {
      assert(
        input.name.trim() &&
          input.description.trim() &&
          input.generatedVoiceId.trim(),
        "Name, description and generated voice ID are required",
      );
      return voiceId(
        await client.json(
          "/v1/text-to-voice",
          await options.credential(),
          post({
            voice_name: input.name,
            voice_description: input.description,
            generated_voice_id: input.generatedVoiceId,
          }),
        ),
      );
    },
  };
}
