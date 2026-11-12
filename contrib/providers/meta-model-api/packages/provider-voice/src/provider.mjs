import { canonicalize, defineEndpoint } from "@hypit/hypit/endpoint";
import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@hypit/speech-evidence";
import { verifyWhisperXAlignmentRequest, whisperXCapabilities } from "@hypit/whisperx";
import { assertTranscribableWav, transcribe } from "./meta-voice-api.mjs";

/**
 * Muse Voice Transcribe as a Hypit speech-alignment Provider.
 *
 * IMPORTANT, and true of the API rather than this wrapper: Muse returns turn-level
 * timings only. There are no word timestamps, no per-word confidence, and no sound
 * events. Hypit's alignment contract needs a time for every Token, so word times here
 * are DERIVED: each turn's span is split across its words in proportion to word length.
 * The text, turn boundaries and language are measured; only the within-turn word split
 * is estimated (bounded by one turn, usually under two seconds). Do not present the
 * derived word times as measured.
 */
export const providerModule = { name: "@example/provider-meta-voice", version: "1" };

function tokensOf(text) {
  return String(text ?? "").split(/\s+/u).filter((token) => token.length > 0);
}

function passagesOf(result, sampleFrames, sampleRate) {
  const toSample = (ms) => Math.max(0, Math.min(sampleFrames, Math.round((ms / 1000) * sampleRate)));
  const durationMs = typeof result.audioDurationMs === "number"
    ? result.audioDurationMs : Math.round((sampleFrames / sampleRate) * 1000);
  const turns = result.turns.length > 0
    ? result.turns
    : [{ startMs: 0, endMs: durationMs, transcript: result.transcript }];

  return turns.map((turn) => {
    const start = toSample(turn.startMs ?? 0);
    const end = Math.max(start + 1, toSample(turn.endMs ?? durationMs));
    const words = tokensOf(turn.transcript);
    const total = words.reduce((sum, word) => sum + word.length, 0) || 1;
    const span = end - start;
    let cursor = start;
    const timed = words.map((text, index) => {
      const remainingWords = words.length - index - 1;
      const proportional = Math.round((span * text.length) / total);
      const width = Math.max(1, Math.min(proportional, end - cursor - remainingWords));
      const word = { text, startSample: cursor, endSampleExclusive: cursor + width };
      cursor += width;
      return word;
    });
    return { startSample: start, endSampleExclusive: end, words: timed, chars: [] };
  });
}

export function createMetaVoiceProvider(options) {
  async function handler(context) {
    const request = verifyWhisperXAlignmentRequest(context.need.constraints);
    const bytes = await context.resources.get(request.audio.resource);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new Error(`Muse Voice evidence ${request.audio.resource} is unavailable`);
    }
    const format = assertTranscribableWav(bytes, request.sampleFrames);
    const apiKey = context.credentials.apiKey?.secret;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error("Muse Voice API key credential is unavailable for this Endpoint");
    }

    await context.reportProgress?.({ phase: `Transcribing with ${options.model ?? "muse-voice-transcribe-1.0"}` });
    const result = await transcribe({
      apiKey,
      wav: bytes,
      language: request.language,
      mode: options.mode,
      model: options.model,
      baseUrl: options.baseUrl,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });

    const passages = passagesOf(result, request.sampleFrames, format.sampleRate);
    const wordCount = passages.reduce((sum, passage) => sum + passage.words.length, 0);
    await context.reportDiagnostic?.({
      level: "info",
      message: `Muse Voice: ${passages.length} turn(s), ${wordCount} words; turn boundaries measured, `
        + "word times derived proportionally within each turn (API has no word timestamps)",
    });
    await context.reportProgress?.({ phase: "Turn timing ready" });

    const evidence = sealAlignedTranscriptEvidence({
      domainId: request.domainId,
      sampleFrames: request.sampleFrames,
      passages,
    });
    return { value: { kind: "inline", value: canonicalize(evidence) } };
  }

  return defineEndpoint({
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    credentialInputs: { apiKey: { label: "Meta Model API key" } },
    defaultConcurrency: options.concurrency ?? 1,
    pricing: { kind: "page", url: "https://dev.meta.ai/docs/pricing-rate-limits" },
    capabilities: [{
      lifecycle: "immediate",
      capability: whisperXCapabilities.alignment,
      returns: speechEvidenceTypes.alignedTranscript,
      handler,
    }],
  });
}
