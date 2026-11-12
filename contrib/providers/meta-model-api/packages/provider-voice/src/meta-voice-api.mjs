/**
 * Meta Model API transport for Muse Voice Transcribe, with no Hypit imports.
 *
 * POST /v1/asr/transcribe takes multipart/form-data: a JSON `request` part and the
 * WAV in an `audio` part. It returns turn-level timings only — the API has no word
 * timestamps — so callers must treat word times as derived, not measured.
 */

export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MODEL = "muse-voice-transcribe-1.0";
export const SUPPORTED_SAMPLE_RATES = Object.freeze([16000, 24000]);

export function wavHeader(bytes) {
  if (bytes.byteLength < 44) throw new Error("Muse Voice evidence is shorter than a WAV header");
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") throw new Error("Muse Voice evidence is not a WAV file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        codec: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    }
    if (id === "data") break;
    offset = body + size + (size % 2);
  }
  if (format === undefined) throw new Error("Muse Voice evidence has no fmt chunk");
  return format;
}

export function assertTranscribableWav(bytes, sampleFrames) {
  const format = wavHeader(bytes);
  if (format.codec !== 1 || format.bits !== 16 || format.channels !== 1) {
    throw new Error(`Muse Voice needs mono 16-bit PCM; evidence is codec=${format.codec} bits=${format.bits} channels=${format.channels}`);
  }
  if (!SUPPORTED_SAMPLE_RATES.includes(format.sampleRate)) {
    throw new Error(`Muse Voice needs 16 kHz or 24 kHz audio; evidence is ${format.sampleRate} Hz`);
  }
  const frames = (bytes.byteLength - 44) / 2;
  if (Number.isFinite(sampleFrames) && Math.abs(frames - sampleFrames) > format.sampleRate) {
    throw new Error(`Muse Voice evidence holds ${frames} frames but the request declares ${sampleFrames}`);
  }
  return format;
}

/**
 * @returns {Promise<{turns: Array<{startMs: number, endMs: number, transcript: string, speaker?: string}>,
 *                    transcript: string, audioDurationMs: number, sessionId: string}>}
 */
export async function transcribe(options) {
  if (!options.apiKey) throw new Error("Muse Voice requires an API key");
  const settings = {
    model: options.model ?? DEFAULT_MODEL,
    audioEncoding: "WAV",
    mode: options.mode ?? "ENDPOINTING",
    ...(options.language === undefined ? {} : { language: options.language }),
  };

  const form = new FormData();
  form.set("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
  form.set("audio", new Blob([options.wav], { type: "audio/wav" }), "evidence.wav");

  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, "");
  const response = await (options.fetch ?? globalThis.fetch)(`${base}/asr/transcribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}`, accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(options.timeoutMs ?? 300_000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message;
    throw Object.assign(
      new Error(`Muse Voice transcribe returned HTTP ${response.status}${detail === undefined ? "" : `: ${detail}`}`),
      body?.error?.code === undefined ? {} : { code: String(body.error.code) },
    );
  }
  if (typeof body.transcript !== "string") throw new Error("Muse Voice response has no transcript");
  return {
    turns: Array.isArray(body.turns) ? body.turns : [],
    transcript: body.transcript,
    audioDurationMs: body.audioDurationMs,
    sessionId: body.sessionId,
  };
}
