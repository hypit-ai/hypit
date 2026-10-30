/**
 * Optional authoring helper for the current field-oriented Model packages.
 * It is not the Generation request protocol: a Model may define and validate
 * any canonical request shape without using this entry point.
 */
export {
  assertModelFieldTable,
  defineModelFields,
  isArtifactField,
  modelField,
} from "./fields.js";
export type {
  ModelArtifactField,
  ModelArtifactFieldKind,
  ModelArtifactItemField,
  ModelArtifactRole,
  ModelArtifactValue,
  ModelField,
  ModelFieldKind,
  ModelFieldRequirement,
  ModelFieldTable,
  ModelFieldValue,
  ModelItemRequirement,
  ModelScalarField,
  ModelScalarKind,
} from "./fields.js";
export {
  artifactBindingSchema,
  bindModelArtifact,
  bindModelText,
  finalizeModelFieldBuilder,
  modelFieldBuilderSchema,
  modelFieldRequestSchema,
  modelFieldsSchema,
  sealModelArtifactBinding,
  sealModelFieldRequest,
  sealModelFieldBuilder,
  verifyModelArtifactBinding,
  verifyModelFieldBuilder,
  verifyModelFields,
  verifyModelFieldRequest,
} from "./request.js";
export {
  createFieldModelGenerationFragment,
  createFieldModelPrimaryFragment,
  defineFieldModelModule,
  modelArtifactInputNames,
  modelTextInputName,
  standardGenerationResults,
} from "./model.js";
export type {
  DefineFieldModelModuleOptions,
  FieldModelOperation,
  ModelArtifactInput,
  FieldModelFragmentExports,
  FieldModelModule,
  ModelTextInput,
  FieldModelOperationSpec,
} from "./model.js";
export type {
  ModelArtifactBinding,
  ModelFieldSubset,
  ModelFieldRequest,
  ModelFieldBuilder,
} from "./request.js";
