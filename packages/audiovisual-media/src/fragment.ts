import { audiovisualTypes } from "@hypit/audiovisual";
import { sealGraphFragment } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { mediaTypes } from "@hypit/media";

import { audiovisualMediaProducers, audiovisualMediaTypes } from "./manifest.js";

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

export const stillPictureProgramSourceFragment = sealGraphFragment({
  inputs: [
    { name: "spec", type: audiovisualMediaTypes.stillPictureSpec },
    { name: "artifact", type: blobTypes.blob },
    { name: "picture", type: mediaTypes.pictureInterpretation },
  ],
  operations: [{
    id: "picture",
    producer: audiovisualMediaProducers.resolveStillPicture,
    inputs: {
      spec: { kind: "fragment-input", name: "spec" },
      artifact: { kind: "fragment-input", name: "artifact" },
      picture: { kind: "fragment-input", name: "picture" },
    },
    result: { kind: "output", name: "picture" },
  }, {
    id: "source",
    producer: audiovisualMediaProducers.stillPictureSource,
    inputs: { picture: { kind: "fragment-operation", operation: "picture" } },
    result: { kind: "output", name: "source" },
  }],
  exports: [{
    name: "source",
    type: audiovisualTypes.programSource,
    root: { kind: "fragment-operation", operation: "source" },
  }, {
    name: "picture",
    type: audiovisualMediaTypes.stillPicture,
    root: { kind: "fragment-operation", operation: "picture" },
  }],
});
