import type { DirectModel } from "@hypit/direct-model-kit";
import type {
  GenerationMediaValue,
  GenerationRequest,
} from "@hypit/generation";
import type { EndpointInvocationContext } from "@hypit/endpoint-kit";
import { assert, bytesFor, post } from "@hypit/direct-model-kit/transport";
const imageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const types = {
  image: imageTypes,
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/mpeg", "audio/wav"],
};
export function validateMedia(model: DirectModel, request: GenerationRequest) {
  for (const values of Object.values(request.ports))
    for (const value of values) {
      if (typeof value !== "object" || !("artifact" in value)) continue;
      const rawAudio =
        model.operation === "sts" || model.operation === "isolation";
      if (!rawAudio)
        assert(
          types[value.role].includes(value.artifact.mediaType),
          `ElevenLabs does not accept ${value.artifact.mediaType}`,
        );
      const maximum = rawAudio ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
      assert(
        value.artifact.size > 0 && value.artifact.size <= maximum,
        "ElevenLabs reference exceeds byte limit",
      );
    }
}
export async function requestFor(
  model: DirectModel,
  request: GenerationRequest,
  context: EndpointInvocationContext,
) {
  const values = request.ports;
  const body: Record<string, unknown> = {};
  for (const port of model.ports) {
    const v = values[port.name];
    if (!v) continue;
    const mapping = model.fields[port.name]!;
    if (port.value.kind === "media") {
      if (model.operation === "sts" || model.operation === "isolation")
        continue;
      const refs = [];
      for (const item of v) {
        const media = item as GenerationMediaValue;
        assert(
          types[media.role].includes(media.artifact.mediaType),
          `ElevenLabs ${port.name} does not accept ${media.artifact.mediaType}`,
        );
        const bytes = await bytesFor(media.artifact, context);
        const ref = {
          type: "inline_base64",
          content_base64: Buffer.from(bytes).toString("base64"),
          mime_type: media.artifact.mediaType,
        };
        refs.push(
          mapping.veo ? { image: ref, role: media.fields?.referenceRole } : ref,
        );
      }
      body[mapping.field] = mapping.array ? refs : refs[0];
    } else body[mapping.field] = mapping.array ? [...v] : v[0];
  }
  let path = model.path;
  if (model.operation === "tts" || model.operation === "sts") {
    const voiceId = String(body.voice_id);
    assert(/^[A-Za-z0-9_-]+$/.test(voiceId), "Invalid voiceId");
    path = path.replace("{voiceId}", encodeURIComponent(voiceId));
    delete body.voice_id;
    const settings: Record<string, unknown> = {};
    for (const k of [
      "stability",
      "similarity_boost",
      "style",
      "speed",
      "use_speaker_boost",
    ])
      if (body[k] !== undefined) {
        settings[k] = body[k];
        delete body[k];
      }
    if (Object.keys(settings).length) body.voice_settings = settings;
  }
  if (model.operation === "dialogue") {
    const texts = body.texts as string[],
      voices = body.voice_ids as string[];
    assert(
      texts.length === voices.length,
      "Dialogue texts and voiceIds must match",
    );
    body.inputs = texts.map((text, i) => ({ text, voice_id: voices[i] }));
    delete body.texts;
    delete body.voice_ids;
    const settings: Record<string, unknown> = {};
    for (const k of ["stability", "similarity"])
      if (body[k] !== undefined) {
        settings[k] = body[k];
        delete body[k];
      }
    if (Object.keys(settings).length) body.settings = settings;
  }
  if (model.operation === "sts" || model.operation === "isolation") {
    const audio = values.audio![0] as GenerationMediaValue;
    const bytes = await bytesFor(audio.artifact, context, 100 * 1024 * 1024);
    delete body.audio;
    const form = new FormData();
    form.set(
      "audio",
      new Blob([new Uint8Array(bytes)], { type: audio.artifact.mediaType }),
      "input",
    );
    if (model.operation === "sts") body.model_id = model.model;
    for (const [k, v] of Object.entries(body))
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    return { path, init: { method: "POST", body: form } as RequestInit };
  }
  body.model_id = model.operation === "dialogue" ? "eleven_v3" : model.model;
  return { path, init: post(body) };
}
