import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createModuleFacet } from "@hypit/hypit/module";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { createAuthorDeclarationFacet, sealGraphFragment } from "@hypit/hypit/generation/author";
import { canonicalize } from "@hypit/hypit/value";
import {
  captionFineManifest,
  captionFineModuleRef,
  captionFineProducers,
  captionFineMarkupDeclarations,
  fineCaptionTrackAuthorDeclaration,
  scheduleFineCaption,
  assertFineCaptionSchedule,
} from "@hypit/caption-fine";
const module = { name: "@explainer/single-line-captions" },
  producer = { module, name: "schedule" };
const manifest = {
  ...module,
  dependencies: [
    ...captionFineManifest.dependencies,
    captionFineModuleRef,
  ],
  types: [],
  capabilities: [],
  producers: [
    {
      ...captionFineManifest.producers.find(
        (p) => p.name === captionFineProducers.schedule.name,
      ),
      name: producer.name,
    },
  ],
};
const valueOf = (r) => r.value;
export function singleLineSchedule(timing, program, document) {
  const schedule = scheduleFineCaption(timing, program, document);
  const cues = [...schedule.cues].sort(
    (a, b) => a.visibleStartFrame - b.visibleStartFrame,
  );
  // This production has one shared subtitle row. A new cue takes that row.
  // Only visibility is clipped; accepted semantic word times remain intact.
  const result = {
    ...schedule,
    cues: cues
      .map((cue, i) => {
        const next = cues[i + 1]?.visibleStartFrame ?? Infinity;
        return {
          ...cue,
          visibility: cue.visibility
            .map((s) => ({
              ...s,
              endFrameExclusive: Math.min(s.endFrameExclusive, next),
            }))
            .filter((s) => s.startFrame < s.endFrameExclusive),
        };
      })
      .filter((c) => c.visibility.length),
  };
  assertFineCaptionSchedule(result);
  return result;
}
const declaration = {
  ...fineCaptionTrackAuthorDeclaration,
  module,
  async compile(context) {
  const result = await fineCaptionTrackAuthorDeclaration.compile(context);
  return {
    ...result,
    components: result.components.map((component) => {
      const f = component.fragment;
    if (
      !f.operations.some(
        (op) =>
          op.producer.module.name === captionFineModuleRef.name &&
          op.producer.name === captionFineProducers.schedule.name,
      )
    )
      return component;
    const replacement = sealGraphFragment({
      inputs: f.inputs,
      operations: f.operations.map((op) =>
        op.producer.module.name === captionFineModuleRef.name &&
        op.producer.name === captionFineProducers.schedule.name
          ? { ...op, producer }
          : op,
      ),
      exports: f.exports,
    });
      return { ...component, fragment: replacement };
    }),
  };
  },
};
const producers = [
        {
          producer,
          handler: ({ inputs: i }) => ({
            kind: "output",
            value: (canonicalize(
                  singleLineSchedule(
                    valueOf(i.timing),
                    valueOf(i.program),
                    valueOf(i.document),
                  ),
                )),
          }),
        },
      ];
export const hypitPackage = {
  facets: [
    createModuleFacet(manifest),
    createGenerationModuleFacet(manifest),
    createProducerPackageFacet(producers),
    createAuthorDeclarationFacet(declaration),
    createMarkupDeclarationFacet({
      module,
      declaration: captionFineMarkupDeclarations.find((item) => item.name === "caption"),
    }),
  ],
};
export default hypitPackage;
