import { mediaOutput, modelBoolean, modelObject, modelOption, modelText, readModelReference, requireModelInputs,
  type Capability, type ModelReference } from "@hypit/execution/model";

export type MiMoDesignRequest = { readonly description: string; readonly text?: string; readonly autoGenerateText: boolean; readonly format: "wav" | "mp3" };
export type MiMoCloneRequest = { readonly reference: ModelReference; readonly text: string; readonly format: "wav" | "mp3" };
const formats = ["wav", "mp3"] as const;

export const miMoVoiceDesign: Capability<MiMoDesignRequest> = {
  id: "@hypit/mimo-speech/mimo-v2.5-tts-voicedesign",
  title: "MiMo 2.5 Voice Design",
  outputs: mediaOutput("audio"),
  readRequest(value) {
    const input = modelObject(value, "MiMo Voice Design", ["description", "text", "autoGenerateText", "format"]);
    const autoGenerateText = modelBoolean(input.autoGenerateText ?? false, "autoGenerateText");
    const text = input.text === undefined && autoGenerateText ? undefined : modelText(input.text, "Speech text");
    return { description: modelText(input.description, "Voice description"), autoGenerateText,
      format: modelOption(input.format ?? "wav", "Audio format", formats),
      ...(text === undefined ? {} : { text }) };
  },
  checkInputs: (_request, inputs) => requireModelInputs(inputs, []),
};
export const miMoVoiceClone: Capability<MiMoCloneRequest> = {
  id: "@hypit/mimo-speech/mimo-v2.5-tts-voiceclone",
  title: "MiMo 2.5 Voice Clone",
  outputs: mediaOutput("audio"),
  readRequest(value) {
    const input = modelObject(value, "MiMo Voice Clone", ["reference", "text", "format"]);
    return { reference: readModelReference(input.reference, "Voice reference"), text: modelText(input.text, "Speech text"),
      format: modelOption(input.format ?? "wav", "Audio format", formats) };
  },
  checkInputs: (request, inputs) => requireModelInputs(inputs, [[request.reference, "audio", ["audio/wav", "audio/mpeg"]]]),
};
