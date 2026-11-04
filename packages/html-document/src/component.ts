import type { AudioProgram } from "@hypit/audio-program";
import type { HtmlProgram } from "@hypit/html-program";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import { compileHtmlDocument, assertHtmlDocument } from "./document.js";
import { htmlDocumentProducers, htmlDocumentTypes } from "./manifest.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as unknown as T;
}

export const htmlDocumentComponent = {
  producers: [{
    producer: htmlDocumentProducers.compile,
    handler: ({ inputs }) => ({ kind: "output" as const, value: canonicalize(compileHtmlDocument(
      valueOf<HtmlProgram>(inputs.program?.value, "HtmlProgram"),
      valueOf<AudioProgram>(inputs.audio?.value, "AudioProgram"),
    )) }),
  }],
  refinements: [{
    type: htmlDocumentTypes.document,
    handler: ({ value }) => assertHtmlDocument(value),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
