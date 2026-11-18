import { modelObject, modelText, readModelReference, requireModelInputs, type Capability, type ModelReference } from "@hypit/execution/model";
import { assertTimedTranscript } from "@hypit/timed-transcript";

export { interpretWhisperXTranscript } from "./transcript.js";

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
        if (Object.keys(resources).length !== 0) throw new Error("Transcript output contains timed values.");
        assertTimedTranscript(value);
        return value;
      },
    },
  },
};
