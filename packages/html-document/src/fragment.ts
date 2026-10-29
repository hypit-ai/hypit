import { sealGraphFragment } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { htmlDocumentProducers, htmlDocumentTypes } from "./manifest.js";

export const htmlDocumentFragment = sealGraphFragment({
  inputs: [{ name: "composition", type: compositionTypes.composition }],
  operations: [{
    id: "compile-document",
    producer: htmlDocumentProducers.compile,
    inputs: {
      composition: { kind: "fragment-input", name: "composition" },
    },
    result: { kind: "output", name: "document" },
  }],
  exports: [{
    name: "document",
    type: htmlDocumentTypes.document,
    root: { kind: "fragment-operation", operation: "compile-document" },
  }],
});
