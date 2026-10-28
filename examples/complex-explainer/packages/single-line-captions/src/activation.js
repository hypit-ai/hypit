import { captionFineStudioTrackCompanions } from "@hypit/caption-fine/studio";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createAuthorDeclarationFacet, sealGraphFragment } from "@hypit/hypit/author";
import { canonicalize } from "@hypit/hypit/protocol";
import {
  captionFineManifest,
  captionFineModuleRef,
  captionFineProducers,
  captionFineMarkupDeclarations,
  fineCaptionTrackAuthorDeclaration,
  scheduleFineCaption,
  assertFineCaptionSchedule,
} from "@hypit/caption-fine";
const module = { name: "@explainer/single-line-captions", version: "1" },
  producer = { module, name: "schedule" };
const manifest = {
  format: "hypit.module@1",
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
  format: "hypit.package@1",
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(producers),
    createStudioTrackCompanionFacet(
      captionFineStudioTrackCompanions.map((companion) => ({
        ...companion,
        output: { ...companion.output, modules: [module] },
      })),
    ),
    createAuthorDeclarationFacet(declaration),
    createMarkupDeclarationFacet({
      module,
      declaration: captionFineMarkupDeclarations.find((item) => item.name === "caption"),
    }),
  ],
};
export default hypitPackage;
