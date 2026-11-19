import { modelObject, modelText, readModelReference, requireModelInputs, type Capability, type ModelReference } from "@hypit/execution/model";
import { encodeTimedTranscript } from "@hypit/timed-transcript";

import { interpretWhisperXTranscript, type WhisperXTranscriptResponse } from "./transcript.js";

export { interpretWhisperXTranscript } from "./transcript.js";

export const whisperXTranscriptResource = "transcript-json";
export function whisperXTranscriptBytes(response: WhisperXTranscriptResponse, language?: string): Uint8Array {
  const transcript = interpretWhisperXTranscript(response, language);
  return new TextEncoder().encode(encodeTimedTranscript(transcript));
}

export type WhisperXRequest = {
  readonly audio: ModelReference;
  readonly language?: string;
  readonly prompt?: string;
};

export const whisperX: Capability<WhisperXRequest> = {
  id: "@hypit/whisperx/whisperx-transcription",
  title: "WhisperX transcription",
  readRequest(value) {
    const input = modelObject(value, "WhisperX request", ["audio", "language", "prompt"]);
    return { audio: readModelReference(input.audio, "audio"),
      ...(input.language === undefined ? {} : { language: modelText(input.language, "Language", 35) }),
      ...(input.prompt === undefined ? {} : { prompt: modelText(input.prompt, "Prompt") }) };
  },
  checkInputs: (request, inputs) => requireModelInputs(inputs, [[request.audio, "audio"]]),
  outputs: {
    transcript: {
      type: "@hypit/timed-transcript/transcript",
      read(value, resources) {
        if (value !== null || Object.keys(resources).length !== 1 || resources[whisperXTranscriptResource]?.mediaType !== "application/json") {
          throw new Error("Transcript output requires one named JSON resource.");
        }
        return null;
      },
    },
  },
};
