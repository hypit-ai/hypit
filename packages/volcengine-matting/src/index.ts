import { mediaOutput, modelObject, modelOption, readModelReference, requireModelInputs,
  type Capability, type ModelReference } from "@hypit/execution/model";

export type PortraitMattingRequest = {
  readonly source: ModelReference;
  readonly format: "WEBM" | "MOV" | "MP4";
  readonly backgroundColor?: "black" | "white" | "green";
};

export const portraitMatting: Capability<PortraitMattingRequest> = {
  id: "@hypit/volcengine-matting/matte-portrait-video",
  title: "Volcengine Portrait Matting",
  authoring: [
    { name: "source", kind: "resource", media: "video", required: true },
    { name: "format", kind: "choice", choices: ["WEBM", "MOV", "MP4"], default: "WEBM" },
    { name: "backgroundColor", kind: "choice", choices: ["black", "white", "green"] },
  ],
  outputs: mediaOutput("video"),
  readRequest(value) {
    const input = modelObject(value, "Portrait Matting", ["source", "format", "backgroundColor"]);
    const format = modelOption(input.format ?? "WEBM", "Matting output format", ["WEBM", "MOV", "MP4"] as const);
    if (input.backgroundColor !== undefined && format !== "MP4") throw new Error("Background color requires MP4 output.");
    return { source: readModelReference(input.source, "source"), format,
      ...(format === "MP4" ? { backgroundColor: modelOption(input.backgroundColor ?? "green", "Background color",
        ["black", "white", "green"] as const) } : {}) };
  },
  checkInputs: (request, inputs) => requireModelInputs(inputs, [[request.source, "video"]]),
};
