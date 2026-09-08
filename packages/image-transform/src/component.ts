import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage } from "@hypit/component-kit";
import type { BlobRef, CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import { rasterTransformRequest } from "@hypit/raster";

import { imageTransformProducers, imageTransformTypes } from "./manifest.js";
import { rasterCapabilities } from "@hypit/raster";
import { verifyImageTransformProgram } from "./program.js";
import type { ImageTransformProgram } from "./types.js";

function inline(value: StoredValue | undefined, subject: string): ImageTransformProgram {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as ImageTransformProgram;
}

function blob(value: StoredValue | undefined, subject: string): BlobRef {
  if (value?.kind !== "blob") throw new Error(`${subject} must be a BlobArtifact`);
  if (!value.mediaType.startsWith("image/")) throw new Error(`${subject} must be image media`);
  return value;
}

export const imageTransformComponent = {
  validators: [{
    type: imageTransformTypes.program,
    handler: ({ value }) => {
      verifyImageTransformProgram(inline(value, "ImageTransformProgram"));
    },
  }],
  producers: [{
    producer: imageTransformProducers.request,
    handler: ({ inputs }) => {
      const source = blob(inputs.source?.value, "ImageTransform source");
      const program = inline(inputs.program?.value, "ImageTransformProgram");
      verifyImageTransformProgram(program);
      return { outputs: {}, needs: { image: canonicalize(rasterTransformRequest(source, program.operations)) } };
    },
  }],
  plannedNeeds: [{
    producer: imageTransformProducers.request,
    port: "image",
    capability: rasterCapabilities.execute,
    plan({ state, step }) {
      const operation = state.plan.steps.find((item) => item.id === step);
      const programRecord = operation?.inputs.program;
      const program = programRecord === undefined
        ? undefined
        : state.records.find((record) => record.id === programRecord)?.value;
      if (program?.kind !== "inline") return undefined;
      return {
        constraints: { kind: "transform", program: program.value as CanonicalValue },
        pendingInputs: plannedNeedInputs(state, step, { source: "image" }),
      };
    },
    present(specification) {
      const fields = specification.constraints as Readonly<Record<string, CanonicalValue>>;
      const program = fields.program as Readonly<Record<string, CanonicalValue>> | undefined;
      const operations = Array.isArray(program?.operations) ? program.operations.length : undefined;
      return {
        fields: operations === undefined ? {} : { operations: [operations] },
        references: {
          image: specification.pendingInputs.filter((input) => input.role === "image").length,
        },
      };
    },
  }],
} satisfies ComponentPackage;
