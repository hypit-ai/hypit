import type { RawSurfaceHandler } from "@hypit/hypit/markup";
import { canonicalize } from "@hypit/hypit/protocol";

import { speechEvidenceTypes } from "./index.js";
import { decodeSpeechTranscriptEvidence } from "./transcript-document.js";

const RECORD_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

export const decodeSpeechTranscriptSurface: RawSurfaceHandler = (input) => {
  const unknown = Object.keys(input.attributes).filter((name) => name !== "id");
  if (unknown.length) throw new Error(`<${input.tag}> does not declare attribute ${JSON.stringify(unknown[0])}`);
  const id = input.attributes.id;
  if (typeof id !== "string" || !RECORD_ID.test(id)) {
    throw new Error(`<${input.tag}> id must be a canonical lower-case identifier`);
  }
  const close = `</${input.tag}>`;
  const closeStart = input.source.indexOf(close, input.contentStart);
  if (closeStart < 0) throw new Error(`Raw Surface <${input.tag}> is not closed`);
  const evidence = decodeSpeechTranscriptEvidence(
    input.source.slice(input.contentStart, closeStart).trim(),
    `${input.sourceName} <${input.tag}>`,
  );
  const end = closeStart + close.length;
  return {
    nextOffset: end,
    records: [{
      id,
      type: speechEvidenceTypes.transcript,
      value: canonicalize(evidence),
      range: { start: input.openingStart, end },
    }],
    components: [],
  };
};
