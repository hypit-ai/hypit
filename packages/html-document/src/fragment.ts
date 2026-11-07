import { sealGraphFragment } from "@hypit/author";
import { audioProgramTypes } from "@hypit/audio-program";
import { htmlProgramTypes } from "@hypit/html-program";
import { htmlDocumentProducers, htmlDocumentTypes } from "./manifest.js";

export const htmlDocumentFragment = sealGraphFragment({
  inputs: [
    { name: "program", type: htmlProgramTypes.program },
    { name: "audio", type: audioProgramTypes.program },
  ],
  operations: [{
    id: "compile-document",
    producer: htmlDocumentProducers.compile,
    inputs: {
      program: { kind: "fragment-input", name: "program" },
      audio: { kind: "fragment-input", name: "audio" },
    },
    result: { kind: "output", name: "document" },
  }],
  exports: [{
    name: "document",
    type: htmlDocumentTypes.document,
    root: { kind: "fragment-operation", operation: "compile-document" },
  }],
});
