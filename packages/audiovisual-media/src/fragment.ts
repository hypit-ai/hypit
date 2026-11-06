import { audiovisualTypes } from "@hypit/audiovisual";
import { sealGraphFragment } from "@hypit/hypit/author";
import { mediaTypes } from "@hypit/media";

import { audiovisualMediaProducers } from "./manifest.js";

export const preparedMediaProgramSourceFragment = sealGraphFragment({
  inputs: [{ name: "media", type: mediaTypes.prepared }],
  operations: [{
    id: "source",
    producer: audiovisualMediaProducers.source,
    inputs: { media: { kind: "fragment-input", name: "media" } },
    result: { kind: "output", name: "source" },
  }],
  exports: [{
    name: "source",
    type: audiovisualTypes.programSource,
    root: { kind: "fragment-operation", operation: "source" },
  }],
});
