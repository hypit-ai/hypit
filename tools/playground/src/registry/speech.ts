import { artifactRef } from "../preview/artifacts.js";
import { projectSpeechVisual } from "../svml.js";
import type { MediaArtifactRef, SpeechBasis } from "../svml.js";
import { fields, list, number } from "./types.js";
import type { PreviewComponent } from "./types.js";

/**
 * The speaker's own footage, full bleed.
 *
 * `projectSpeechVisual` takes no appearance at all — it always emits a
 * full-frame `object-fit: cover` element at stacking order 0. So this component
 * has clips and nothing else, which is the honest shape: `speech.full` exists in
 * the golden stylesheet but no Surface reads it, and inventing knobs here would
 * imply a control the compiler does not have.
 */
export const speechComponent: PreviewComponent = {
  id: "speech",
  label: "Speaker footage",

  parameters: { kind: "object", fields: {} },

  content: {
    kind: "object",
    fields: {
      clips: {
        schema: {
          kind: "array",
          minItems: 1,
          items: {
            kind: "object",
            fields: {
              media: { schema: { kind: "blob", mediaTypes: ["image/*", "video/*"] } },
              startSec: { schema: { kind: "number", minimum: 0 } },
              endSec: { schema: { kind: "number", minimum: 0 } },
            },
          },
        },
      },
    },
  },

  defaults: () => ({
    parameters: {},
    content: { clips: [{ media: "", startSec: 0, endSec: 4 }] },
  }),

  build: ({ content, programSpace }) => {
    type Clip = SpeechBasis["visualTrack"]["clips"][number];
    const clips: Clip[] = list(fields(content)["clips"], "clips").flatMap((entry, index): Clip[] => {
      const clip = fields(entry);
      const digest = clip["media"];
      const artifact = artifactRef(typeof digest === "string" && digest !== "" ? digest : undefined);
      // A clip with no media yet contributes nothing rather than a stub digest,
      // which projectSpeechVisual would reject.
      if (artifact === undefined) return [];
      const startSec = number(clip["startSec"], "startSec");
      const endSec = Math.min(
        programSpace.durationSec,
        Math.max(startSec + 1 / 30, number(clip["endSec"], "endSec")),
      );
      // Indexed by position, not by how many survived: two clips must never
      // share a segment id, or their Presents collide.
      return [{ segmentId: `segment-${index + 1}`, artifact, startSec, endSec }];
    });
    if (clips.length === 0) return [];

    // assertSpeechBasisIdentity requires an audio Artifact whose duration equals
    // the ProgramSpace's. projectSpeechVisual never reads it — only the visual
    // clips and the segments — so the first clip's own digest stands in at the
    // program's duration rather than a fabricated one.
    const audio: MediaArtifactRef = {
      ...clips[0]!.artifact,
      durationSec: programSpace.durationSec,
    };

    const basis: SpeechBasis = {
      contract: "svml.speech-basis@1",
      programSpace,
      audio,
      visualTrack: { clips },
      segments: clips.map((clip) => ({
        segmentId: clip.segmentId,
        startSec: clip.startSec,
        endSec: clip.endSec,
      })),
    };
    return [projectSpeechVisual(basis)];
  },
};
