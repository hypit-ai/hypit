import { mediaOutput, modelObject, modelOption, modelText, readModelReferences, requireModelInputs,
  type Capability, type ModelReference } from "@hypit/execution/model";

export type FishDesignRequest = { readonly description: string; readonly text?: string; readonly language?: string };
export type FishCloneRequest = { readonly references: readonly ModelReference[]; readonly text: string; readonly title: string; readonly format: FishFormat };
export type FishSynthesisRequest = { readonly text: string; readonly voice?: string; readonly format: FishFormat };
const formats = ["mp3", "opus"] as const;
type FishFormat = typeof formats[number];

export const fishVoiceDesign: Capability<FishDesignRequest> = {
  id: "@hypit/fishaudio-speech/voice-design-1",
  title: "Fish Audio Voice Design",
  authoring: [
    { name: "description", kind: "text", required: true },
    { name: "text", kind: "text" },
    { name: "language", kind: "text" },
  ],
  outputs: mediaOutput("audio"),
  readRequest(value) {
    const input = modelObject(value, "Fish Audio Voice Design", ["description", "text", "language"]);
    return { description: modelText(input.description, "Voice description"),
      ...(input.text === undefined ? {} : { text: modelText(input.text, "Preview text") }),
      ...(input.language === undefined ? {} : { language: modelText(input.language, "Language", 35) }) };
  },
  checkInputs: (_request, inputs) => requireModelInputs(inputs, []),
};
export const fishVoiceClone: Capability<FishCloneRequest> = {
  id: "@hypit/fishaudio-speech/voice-clone",
  title: "Fish Audio Voice Clone",
  authoring: [
    { name: "references", kind: "resources", media: "audio", maxItems: 20, required: true },
    { name: "text", kind: "text", required: true },
    { name: "title", kind: "text", default: "reference" },
    { name: "format", kind: "choice", choices: formats, default: "mp3" },
  ],
  outputs: mediaOutput("audio"),
  readRequest(value) {
    const input = modelObject(value, "Fish Audio Voice Clone", ["references", "text", "title", "format"]);
    const references = readModelReferences(input.references, "Voice references", 20);
    if (references.length === 0) throw new Error("Voice cloning requires a reference recording.");
    return { references, text: modelText(input.text, "Speech text"), title: modelText(input.title ?? "reference", "Voice title"),
      format: modelOption(input.format ?? "mp3", "Audio format", formats) };
  },
  checkInputs: (request, inputs) => requireModelInputs(inputs, request.references.map(ref => [ref, "audio"])),
};
export const fishS21ProFree: Capability<FishSynthesisRequest> = {
  id: "@hypit/fishaudio-speech/s2.1-pro-free",
  title: "Fish Audio S2.1 Pro Free",
  authoring: [
    { name: "text", kind: "text", required: true },
    { name: "voice", kind: "text" },
    { name: "format", kind: "choice", choices: formats, default: "mp3" },
  ],
  outputs: mediaOutput("audio"),
  readRequest(value) {
    const input = modelObject(value, "Fish Audio S2.1", ["text", "voice", "format"]);
    return { text: modelText(input.text, "Speech text"), format: modelOption(input.format ?? "mp3", "Audio format", formats),
      ...(input.voice === undefined ? {} : { voice: modelText(input.voice, "Stored voice ID", 256) }) };
  },
  checkInputs: (_request, inputs) => requireModelInputs(inputs, []),
};
