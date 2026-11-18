import type { JsonValue } from "@hypit/execution";
import type { Capability } from "@hypit/execution/model";
import { bindProviderEndpoint, type ProviderDirectContext, type ProviderOutputs } from "@hypit/execution/provider";
import { fishS21ProFree, fishVoiceClone, fishVoiceDesign } from "@hypit/fishaudio-speech";
import { miMoVoiceClone, miMoVoiceDesign } from "@hypit/mimo-speech";
import { interpretWhisperXTranscript, whisperX } from "@hypit/whisperx";
import { failed, record, rejectedSubmission, transient, type HypiHubClient, type HypiHubInputs } from "./client.js";
import { verifyOffering, type ReportOffering } from "./catalog.js";
import { HypiHubHttpError } from "./errors.js";
import { quoteHypiHub } from "./pricing.js";

function audioMime(format: string | undefined): string {
  switch (format) {
    case "wav": return "audio/wav";
    case "opus": return "audio/ogg";
    default: return "audio/mpeg";
  }
}

async function receiveAudio(
  client: HypiHubClient, response: Response, fallback: string, context: ProviderDirectContext,
): Promise<ProviderOutputs> {
  if (!response.headers.get("content-type")?.includes("json")) {
    await context.writeResource("audio", "audio-1", client.resource(response, fallback));
    return { status: "complete", values: { audio: { audios: ["audio-1"] } } };
  }
  const envelope = record(await response.json(), "speech response");
  const audio = Array.isArray(envelope.previews) ? envelope.previews : [envelope];
  if (audio.length === 0) throw new Error("HypiHub speech returned no audio.");
  const names: string[] = [];
  for (const [index, item] of audio.entries()) {
    const preview = record(item, "speech preview");
    const name = `audio-${index + 1}`;
    const mediaType = typeof preview.mime_type === "string" && preview.mime_type.startsWith("audio/") ? preview.mime_type : fallback;
    if (typeof preview.b64_json === "string" && preview.b64_json !== "") {
      if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(preview.b64_json) || preview.b64_json.length % 4 !== 0) {
        throw new Error("HypiHub speech returned invalid Base64 audio.");
      }
      const bytes = Buffer.from(preview.b64_json, "base64");
      await context.writeResource("audio", name, { mediaType, bytes: [bytes] });
    } else {
      await context.writeResource("audio", name, await client.download(preview.url, context.signal, mediaType));
    }
    names.push(name);
  }
  return { status: "complete", values: { audio: { audios: names } } };
}

function bindSpeech<Request extends JsonValue & { readonly text?: string; readonly autoGenerateText?: boolean }>(
  id: string, client: HypiHubClient, capability: Capability<Request>, model: string, report: ReportOffering,
  prepare: (request: Request, input: HypiHubInputs) => object | Promise<object>,
) {
  const selection = { model, operation: "audio_speech" } as const;
  report(capability.id, [selection]);
  return bindProviderEndpoint<Request>({
    kind: "direct", id, capability,
    quote: (request, inputs, signal) => quoteHypiHub(client, selection, inputs, signal,
      request.text === undefined || request.autoGenerateText === true ? {} : { text: request.text }),
    async run(context) {
      let body: object;
      try {
        await verifyOffering(client, selection, context.signal);
        body = await prepare(context.request, client.inputs(context));
      } catch (error) {
        context.signal.throwIfAborted();
        return failed(error, "hypihub-prepare-failed");
      }
      let response;
      try {
        response = await client.response("/audio/speech", context.signal, client.post({ model, ...body }, context.invocation));
      } catch (error) {
        if (rejectedSubmission(error)) return failed(error, "hypihub-submission-rejected");
        throw error;
      }
      const { response_format: format } = body as { response_format?: string };
      return await receiveAudio(client, response, audioMime(format), context);
    },
  });
}

function transcript(value: Record<string, unknown>, language: string | undefined): ProviderOutputs {
  return { status: "complete", values: { transcript: interpretWhisperXTranscript(value, language) } };
}

const transcriptionModel = "victor-upmeet/whisperx";
const transcriptionPath = "/audio/transcriptions";

function transcriptionReceipt(response: Response, base: string): string | undefined {
  const id = response.headers.get("x-request-id");
  const location = response.headers.get("location");
  if (id === null || !/^[A-Za-z0-9_-]{1,200}$/u.test(id) || location === null) return undefined;
  try {
    return new URL(location, base).href === `${base}${transcriptionPath}/${encodeURIComponent(id)}` ? id : undefined;
  } catch { return undefined; }
}

function bindWhisperX(id: string, client: HypiHubClient, report: ReportOffering) {
  const selection = { model: transcriptionModel, operation: "transcriptions" } as const;
  report(whisperX.id, [selection]);
  return bindProviderEndpoint({
    kind: "direct", id, capability: whisperX,
    quote: (request, inputs, signal) => quoteHypiHub(client, selection, inputs, signal, { audio: request.audio.resource }),
    async run(context) {
      const { request, signal } = context;
      let url: string;
      try {
        await verifyOffering(client, selection, signal);
        url = await client.inputs(context).url(request.audio);
      } catch (error) {
        signal.throwIfAborted();
        return failed(error, "hypihub-prepare-failed");
      }
      let acknowledged = false;
      try {
        const result = await client.json(transcriptionPath, signal, client.post({
          model: transcriptionModel, url, response_format: "verbose_json", language: request.language,
          prompt: request.prompt, timestamp_granularities: ["segment", "word"],
        }, context.invocation), async response => {
          const receipt = transcriptionReceipt(response, client.base);
          if (receipt !== undefined) {
            await context.checkpointReceipt({ id: receipt, resume: { startedAt: Date.now() } });
            acknowledged = true;
          }
        });
        return transcript(result, request.language);
      } catch (error) {
        if (!acknowledged && rejectedSubmission(error)) return failed(error, "hypihub-submission-rejected");
        throw error;
      }
    },
    async recover({ receipt, signal, request }) {
      const startedAt = record(receipt.resume, "transcription receipt").startedAt;
      if (typeof startedAt !== "number") throw new Error("Invalid HypiHub transcription receipt.");
      if (Date.now() - startedAt >= client.operationTimeout) {
        return failed(new Error("HypiHub transcription exceeded its recovery deadline."), "hypihub-transcription-timeout");
      }
      try {
        const saved = await client.json(`${transcriptionPath}/${encodeURIComponent(receipt.id)}`, signal);
        if (saved.status === "completed") return transcript(record(saved.result, "saved transcription"), request.language);
        if (saved.status === "failed" || saved.status === "cancelled" || saved.status === "expired") {
          return failed(new Error(`HypiHub transcription ${saved.status}.`), "hypihub-transcription-failed");
        }
        return client.pending(undefined, "waiting for saved transcription");
      } catch (error) {
        signal.throwIfAborted();
        const authorization = client.credentialPending(error);
        if (authorization !== undefined) return authorization;
        if (transient(error) || error instanceof HypiHubHttpError && error.status === 404) {
          return client.pending(error, "retrying saved transcription");
        }
        return failed(error, "hypihub-transcription-lookup-failed");
      }
    },
  });
}

export function hypiHubDirect(id: string, client: HypiHubClient, report: ReportOffering) {
  return [
    bindSpeech(id, client, miMoVoiceDesign, "xiaomi/mimo-v2.5-tts-voicedesign", report, request => ({
      input: request.text, voice_description: request.description, auto_generate_text: request.autoGenerateText,
      response_format: request.format,
    })),
    bindSpeech(id, client, miMoVoiceClone, "xiaomi/mimo-v2.5-tts-voiceclone", report, async (request, input) => ({
      input: request.text, reference_audio: [await input.inline(request.reference, 7_864_320)],
      response_format: request.format,
    })),
    bindSpeech(id, client, fishVoiceDesign, "fishaudio/voice-design-1", report, request => ({
      input: request.text, voice_description: request.description, language: request.language, output: "b64_json",
    })),
    bindSpeech(id, client, fishVoiceClone, "fishaudio/voice-clone", report, async (request, input) => {
      const reference_audio: string[] = [];
      for (const sample of request.references) reference_audio.push(await input.url(sample));
      return { input: request.text, voice_description: request.title, reference_audio,
        visibility: "private", response_format: request.format };
    }),
    bindSpeech(id, client, fishS21ProFree, "fishaudio/s2.1-pro-free", report, request => ({
      input: request.text, voice: request.voice, response_format: request.format,
    })),
    bindWhisperX(id, client, report),
  ];
}
