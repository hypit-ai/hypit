import { access } from "node:fs/promises";
import { join } from "node:path";
import { MemoryResourceStore } from "@hypit/driver-node";
import type { Need, StoredValue } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/runtime";
import { sealSpeechEvidenceAudio } from "@hypit/speech";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import type { AlignedTranscriptEvidence } from "@hypit/speech-evidence";
import { whisperXCapabilities, whisperXRequestForEvidenceAudio } from "@hypit/whisperx";
import type { WhisperXLanguage } from "@hypit/whisperx";

import { assert, command, readBytes, round, writeJson } from "./media.js";
import type { Transcript, TranscriptFile, TranscriptPassage, TranscriptWord } from "./types.js";

/**
 * One immediate Need executed through the selected Runtime Profile, outside any Build. The Runtime
 * host provides it; this module never chooses or instantiates a Provider itself, so whichever
 * Endpoint the Profile binds to `whisperx-alignment` — HypiHub, a local service, anything else —
 * measures the transcript.
 */
export type InvokeNeed = (need: Need, resources: ResourceStore) => Promise<{ readonly value: StoredValue }>;

// WhisperX measures in samples of the canonical evidence rate and refuses audio of any other shape,
// so this is both what the audio is extracted at and what its word times are divided by.
const EVIDENCE_SAMPLE_RATE = 16_000;

export async function extractSpeechAudio(videoPath: string, target: string): Promise<string> {
  await command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(EVIDENCE_SAMPLE_RATE), "-c:a", "pcm_s16le", "-bitexact", target], 300_000);
  return target;
}

// The Provider checks that the declared sample count is exactly the one in the file, so the count is
// read out of the file rather than derived from a duration that rounds.
function sampleFrames(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, true);
    if (String.fromCharCode(...bytes.subarray(offset, offset + 4)) === "data") return size / 2;
    offset += 8 + size + (size % 2);
  }
  throw new Error("extracted speech audio has no WAV data chunk");
}

function seconds(sample: number | undefined): number | undefined {
  return sample === undefined ? undefined : round(sample / EVIDENCE_SAMPLE_RATE);
}

// A refused connection arrives as `fetch failed` and says where only in its cause, which is the one
// thing the reader of an unavailable transcript needs.
function reason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause === undefined ? error.message : `${error.message}: ${reason(error.cause)}`;
}

/** Ask the Profile's WhisperX alignment Endpoint for the word times of one canonical evidence WAV. */
export async function transcribeSpeechAudio(
  audioPath: string,
  language: WhisperXLanguage,
  invoke: InvokeNeed,
): Promise<readonly TranscriptPassage[]> {
  const bytes = await readBytes(audioPath);
  const resources = new MemoryResourceStore();
  const artifact = await resources.put(bytes, "audio/wav");
  const evidence = sealSpeechEvidenceAudio({ artifact, sampleFrames: sampleFrames(bytes) });
  const need: Need = {
    id: "need:reference-video-transcript",
    capability: whisperXCapabilities.alignment,
    returns: speechEvidenceTypes.alignedTranscript,
    constraints: whisperXRequestForEvidenceAudio(evidence, { language }),
    result: "record:reference-video-transcript",
  };
  const fulfillment = await invoke(need, resources);
  assert(fulfillment.value.kind === "inline", "WhisperX returned alignment evidence by reference");
  const aligned = fulfillment.value.value as unknown as AlignedTranscriptEvidence;
  return aligned.passages.map((passage): TranscriptPassage => {
    const words = passage.words.map((word): TranscriptWord => {
      const start = seconds(word.startSample);
      const end = seconds(word.endSampleExclusive);
      return {
        text: word.text,
        ...(start === undefined ? {} : { start_seconds: start }),
        ...(end === undefined ? {} : { end_seconds: end }),
        ...(word.score === undefined ? {} : { score: word.score }),
      };
    });
    const start = seconds(passage.startSample);
    const end = seconds(passage.endSampleExclusive);
    return {
      text: words.map((word) => word.text).join(" "),
      ...(start === undefined ? {} : { start_seconds: start }),
      ...(end === undefined ? {} : { end_seconds: end }),
      words,
    };
  });
}

/**
 * The verbatim transcript is deterministic evidence rather than an observation: it is never cached
 * with the Gemini answers and never sent to Gemini. A Profile whose alignment Endpoint cannot answer
 * still prepares everything else, and is told what did not answer instead of losing the preparation.
 */
export async function prepareTranscript(
  reference: string,
  videoPath: string,
  root: string,
  hasAudio: boolean,
  language: WhisperXLanguage,
  redo: boolean,
  invoke: InvokeNeed,
): Promise<Transcript> {
  if (!hasAudio) return { status: "unavailable", transcript_ref: null, word_count: 0, reason: "the reference video has no audio track" };
  try {
    const audioPath = join(root, "speech.wav");
    if (redo || await access(audioPath).then(() => false, () => true)) await extractSpeechAudio(videoPath, audioPath);
    // A refused connection says only "fetch failed"; the reader still has to learn what to start.
    const passages = await transcribeSpeechAudio(audioPath, language, invoke)
      .catch((error: unknown) => { throw new Error(`WhisperX alignment did not answer: ${reason(error)}`); });
    const transcriptPath = join(root, "transcript.json");
    const file: TranscriptFile = { reference_id: reference, audio_ref: audioPath, passages };
    await writeJson(transcriptPath, file);
    return { status: "complete", transcript_ref: transcriptPath, word_count: passages.reduce((total, passage) => total + passage.words.length, 0) };
  } catch (error) {
    return { status: "unavailable", transcript_ref: null, word_count: 0, reason: reason(error) };
  }
}
