import type {
  AuthorDeclarationOutput,
  AuthorResolvedReference,
  AuthorValueRef,
  GraphFragment,
} from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { canonicalize, isBlobRef, sameType } from "@hypit/hypit/protocol";
import { textTypes, verifyText } from "@hypit/hypit/text";

import type { FieldModelOperation } from "./model.js";
import { modelArtifactInputNames, modelTextInputName } from "./model.js";
import { isArtifactField, modelField } from "./fields.js";
import type { ModelArtifactBinding, ModelFieldBuilder } from "./request.js";
import { sealModelArtifactBinding } from "./request.js";

export type FieldModelAuthorArtifactInput = ModelArtifactBinding & {
  /** Stable local input name inside this Fragment shape. */
  readonly name: string;
  /** Exact Model field receiving the artifact. */
  readonly field: string;
  readonly source: AuthorResolvedReference;
};

export type FieldModelAuthorTextInput = {
  /** Stable local input name inside this Fragment shape. */
  readonly name: string;
  /** Exact Model field receiving the Text value. */
  readonly field: string;
  readonly source: AuthorResolvedReference;
};

export type FieldModelAuthorComponentOptions = {
  readonly id: string;
  readonly range: { readonly start: number; readonly end: number };
  readonly endpoint: FieldModelOperation;
  readonly draft: ModelFieldBuilder;
  readonly fragment: GraphFragment;
  readonly outputs: Readonly<Record<string, string>>;
  readonly artifacts?: readonly FieldModelAuthorArtifactInput[];
  readonly text?: readonly FieldModelAuthorTextInput[];
};

/**
 * Assemble author graph mechanics for the optional field-oriented Model helper.
 * Model-specific syntax, values, mode selection and cross-field rules stay in the Model package.
 */
export function fieldModelAuthorComponent(options: FieldModelAuthorComponentOptions): AuthorDeclarationOutput {
  const records: AuthorDeclarationOutput["records"][number][] = [{
    id: `${options.id}.draft`,
    type: options.endpoint.draftType,
    value: canonicalize(options.draft),
    range: options.range,
  }];
  const inputs: Record<string, AuthorValueRef> = {
    draft: { kind: "record", id: `${options.id}.draft` },
  };
  for (const input of options.text ?? []) {
    if (!sameType(input.source.type, textTypes.text)) {
      throw new Error(`${options.endpoint.fields.model}.${input.field} must reference Text.`);
    }
    if (input.source.record !== undefined) verifyText(input.source.record.value);
    if (options.endpoint.textBindings[input.field] === undefined) {
      throw new Error(`${options.endpoint.fields.model} has no text field ${input.field}.`);
    }
    inputs[modelTextInputName(input.name)] = input.source.ref;
  }
  for (const input of options.artifacts ?? []) {
    if (!sameType(input.source.type, blobTypes.blob)) {
      throw new Error(`${options.endpoint.fields.model}.${input.field} must reference a Blob.`);
    }
    if (input.source.record !== undefined
      && (!isBlobRef(input.source.record.value)
        || !input.source.record.value.mediaType.startsWith(`${input.role}/`))) {
      throw new Error(`${options.endpoint.fields.model}.${input.field} must reference ${input.role} media.`);
    }
    const endpoint = options.endpoint.mediaBindings[input.field];
    if (endpoint === undefined) throw new Error(`${options.endpoint.fields.model} has no artifact field ${input.field}.`);
    const field = modelField(options.endpoint.fields, input.field);
    if (!isArtifactField(field)) throw new Error(`${options.endpoint.fields.model}.${input.field} is not an artifact field.`);
    const bindingId = `${options.id}.${input.name}.binding`;
    records.push({
      id: bindingId,
      type: endpoint.type,
      value: canonicalize(sealModelArtifactBinding(field, {
        role: input.role,
        ...(input.fields === undefined ? {} : { fields: input.fields }),
      })),
      range: options.range,
    });
    const names = modelArtifactInputNames(input.name);
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = input.source.ref;
  }
  return {
    records,
    components: [{
      id: options.id,
      fragment: options.fragment,
      inputs,
      outputs: { ...options.outputs },
      range: options.range,
    }],
  };
}
