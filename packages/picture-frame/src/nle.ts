import type {
  NleOperatorParameterAuthoring,
  NleOperatorOccurrenceAuthoring,
  NlePackageSymbol,
  NlePictureOperatorResolver,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";

import { pictureFrameModuleRef } from "./manifest.js";
import { assertPictureFrameTreatment, pictureFrameOperator, type PictureFrameTreatment } from "./program.js";

export type PictureFrameNleParameters = { readonly treatment: PictureFrameTreatment };
export type PictureFrameNleEdit = { readonly kind: "set-treatment"; readonly treatment: PictureFrameTreatment };

export const pictureFrameNleSymbol: NlePackageSymbol = { module: pictureFrameModuleRef, name: "frame" };

function assertParameters(value: unknown): asserts value is PictureFrameNleParameters {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 1 || !("treatment" in value)) {
    throw new Error("NLE Picture Frame parameters have invalid fields.");
  }
  assertPictureFrameTreatment(value.treatment as PictureFrameTreatment, "NLE Picture Frame treatment");
}

export const pictureFrameNleResolver: NlePictureOperatorResolver = {
  operator: pictureFrameNleSymbol,
  resolve: (application) => {
    const parameters = application.parameters as unknown;
    assertParameters(parameters);
    return { operator: pictureFrameOperator(parameters.treatment) };
  },
};

export const pictureFrameNleAuthoring: NleOperatorParameterAuthoring = {
  operator: pictureFrameNleSymbol,
  inspect: ({ application }) => {
    const parameters = application.parameters as unknown;
    assertParameters(parameters);
    return canonicalize(parameters);
  },
  edit: (operation, { application }) => {
    const parameters = application.parameters as unknown;
    assertParameters(parameters);
    if (operation === null || typeof operation !== "object" || Array.isArray(operation)
      || Object.keys(operation).sort().join("\u0000") !== ["kind", "treatment"].sort().join("\u0000")
      || !("kind" in operation) || operation.kind !== "set-treatment" || !("treatment" in operation)) {
      throw new Error("NLE Picture Frame edit is invalid.");
    }
    assertPictureFrameTreatment(operation.treatment as PictureFrameTreatment, "NLE Picture Frame edit.treatment");
    return canonicalize({ treatment: operation.treatment as PictureFrameTreatment });
  },
};

export const pictureFrameNleOccurrence: NleOperatorOccurrenceAuthoring = {
  operator: pictureFrameNleSymbol,
  temporalSupport: ({ application, medium }) => {
    if (medium !== "picture") throw new Error("Picture Frame must be a Picture Operator Application.");
    assertParameters(application.parameters);
    return { timeWindow: true };
  },
};
