import { sealAlignedTranscriptEvidence, speechEvidenceTypes } from "@hypit/speech-evidence";
import type { AlignedTranscriptEvidence, SpeechTranscriptPassage } from "@hypit/speech-evidence";
import type { ArtifactStore } from "@hypit/runtime";
import { whisperXCapabilities } from "@hypit/whisperx";
import type { WhisperXAlignmentRequest } from "@hypit/whisperx";
import type { HypiHubAuth } from "./oauth.js";

type RawWord = { readonly word?: unknown; readonly text?: unknown; readonly start?: unknown; readonly end?: unknown; readonly score?: unknown };
type RawSegment = { readonly start?: unknown; readonly end?: unknown; readonly words?: unknown };
export type HypiHubWhisperXResponse = { readonly language?: unknown; readonly segments?: unknown; readonly words?: unknown };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sampleWindow(start: unknown, end: unknown, sampleFrames: number) {
  if (!finite(start) || !finite(end) || start < 0 || end < start) return undefined;
  const startSample = Math.round(start * 16_000);
  const endSampleExclusive = Math.round(end * 16_000);
  if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(endSampleExclusive)
    || startSample > sampleFrames || endSampleExclusive > sampleFrames) return undefined;
  return { startSample, endSampleExclusive };
}

function word(value: unknown) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "HypiHub WhisperX word is invalid");
  const item = value as RawWord;
  const text = typeof item.word === "string" ? item.word.trim()
    : typeof item.text === "string" ? item.text.trim() : "";
  if (text.length === 0) return undefined;
  const score = finite(item.score) && item.score >= 0 && item.score <= 1 ? item.score : undefined;
  return {
    text,
    window: sampleWindow(item.start, item.end, Number.MAX_SAFE_INTEGER),
    ...(score === undefined ? {} : { score }),
    start: item.start,
    end: item.end,
  };
}

/** Map HypiHub's OpenAI-shaped verbose response into Hypit's sample-domain evidence. */
export function interpretHypiHubWhisperXResponse(
  response: HypiHubWhisperXResponse,
  sampleFrames: number,
): AlignedTranscriptEvidence {
  assert(Number.isSafeInteger(sampleFrames) && sampleFrames > 0, "WhisperX evidence sample count is invalid");
  assert(Array.isArray(response.segments), "HypiHub WhisperX response has no Segment array");
  const topWords = Array.isArray(response.words) ? response.words.map(word).filter((item): item is NonNullable<ReturnType<typeof word>> => item !== undefined) : [];
  const passages: SpeechTranscriptPassage[] = response.segments.map((value, index) => {
    assert(value !== null && typeof value === "object" && !Array.isArray(value), `HypiHub WhisperX Segment ${index} is invalid`);
    const segment = value as RawSegment;
    const passageWindow = sampleWindow(segment.start, segment.end, sampleFrames);
    const nested = Array.isArray(segment.words)
      ? segment.words.map(word).filter((item): item is NonNullable<ReturnType<typeof word>> => item !== undefined)
      : [];
    const candidates = nested.length > 0 ? nested : topWords.filter((item) => {
      if (!passageWindow || !item.window) return false;
      return item.window.endSampleExclusive > passageWindow.startSample
        && item.window.startSample < passageWindow.endSampleExclusive;
    });
    return {
      ...passageWindow,
      words: candidates.map((item) => ({
        text: item.text,
        ...(item.window === undefined ? {} : sampleWindow(item.start, item.end, sampleFrames)),
        ...(item.score === undefined ? {} : { score: item.score }),
      })),
      chars: [],
    };
  });
  assert(passages.some((passage) => passage.words.length > 0), "HypiHub WhisperX response has no word timestamps");
  return sealAlignedTranscriptEvidence({ passages });
}

export function whisperXAlignmentRequest(value: unknown): WhisperXAlignmentRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "WhisperX alignment request must be an object");
  const request = value as WhisperXAlignmentRequest;
  assert(request.audio?.kind === "blob" && request.audio.mediaType === "audio/wav"
    && Number.isSafeInteger(request.sampleFrames) && request.sampleFrames > 0
    && (request.language === "en" || request.language === "zh" || request.language === "es"),
  "WhisperX alignment request is invalid");
  return request;
}

export async function transcribeWithHypiHub(
  client: {
    upload(artifact: WhisperXAlignmentRequest["audio"], artifacts: ArtifactStore, auth: HypiHubAuth): Promise<string>;
    transcribe(body: Record<string, unknown>, auth: HypiHubAuth): Promise<HypiHubWhisperXResponse>;
  },
  request: WhisperXAlignmentRequest,
  artifacts: ArtifactStore,
  auth: HypiHubAuth,
  model: string,
): Promise<AlignedTranscriptEvidence> {
  const bytes = await artifacts.get(request.audio.digest);
  assert(bytes !== undefined && bytes.byteLength === request.audio.size,
    `HypiHub WhisperX evidence Artifact ${request.audio.digest} is unavailable or has changed`);
  const url = await client.upload(request.audio, artifacts, auth);
  return interpretHypiHubWhisperXResponse(await client.transcribe({
    model,
    url,
    language: request.language,
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  }, auth), request.sampleFrames);
}

export { speechEvidenceTypes, whisperXCapabilities };
