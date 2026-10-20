/**
 * Optional authoring helper for the current field-oriented Model packages.
 * It is not the Generation request protocol: a Model may define and validate
 * any canonical request shape without using this entry point.
 */
export {
  assertGenerationPortTable as assertModelFieldTable,
  generationPort as modelField,
  isMediaPort as isArtifactField,
  sealGenerationPortTable as defineModelFields,
} from "./ports.js";
export type {
  GenerationItemRequirement as ModelItemRequirement,
  GenerationMediaPort as ModelArtifactField,
  GenerationMediaPortKind as ModelArtifactFieldKind,
  GenerationMediaRole as ModelArtifactRole,
  GenerationMediaValue as ModelArtifactValue,
  GenerationPort as ModelField,
  GenerationPortItemField as ModelArtifactItemField,
  GenerationPortKind as ModelFieldKind,
  GenerationPortRequirement as ModelFieldRequirement,
  GenerationPortScalarKind as ModelScalarKind,
  GenerationPortTable as ModelFieldTable,
  GenerationPortValue as ModelFieldValue,
  GenerationScalarPort as ModelScalarField,
} from "./ports.js";
export {
  bindGenerationMedia as bindModelArtifact,
  bindGenerationText as bindModelText,
  finalizeGenerationRequestDraft as finalizeModelFieldBuilder,
  mediaBindingSchemaFromPort as artifactBindingSchema,
  portsObjectSchema as modelFieldsSchema,
  requestDraftSchemaFromPorts as modelFieldBuilderSchema,
  requestSchemaFromPorts as modelFieldRequestSchema,
  sealGenerationMediaBinding as sealModelArtifactBinding,
  sealGenerationPortRequest as sealModelFieldRequest,
  sealGenerationRequestDraft as sealModelFieldBuilder,
  verifyGenerationMediaBinding as verifyModelArtifactBinding,
  verifyPortsAgainstTable as verifyModelFields,
  verifyRequestDraftAgainstPorts as verifyModelFieldBuilder,
  verifyRequestAgainstPorts as verifyModelFieldRequest,
} from "./request.js";
export {
  createExactModelGenerationFragment as createFieldModelGenerationFragment,
  createExactModelPrimaryGenerationFragment as createFieldModelPrimaryFragment,
  defineFieldModelModule,
  exactModelMediaInputNames as modelArtifactInputNames,
  exactModelTextInputName as modelTextInputName,
  standardGenerationResults,
} from "./model.js";
export type {
  DefineFieldModelModuleOptions,
  ExactModelEndpoint as FieldModelOperation,
  ExactModelMediaInput as ModelArtifactInput,
  ExactModelFragmentPublication as FieldModelFragmentPublication,
  ExactModelModule as FieldModelModule,
  ExactModelTextInput as ModelTextInput,
  FieldModelEndpointSpec as FieldModelOperationSpec,
} from "./model.js";
export type {
  GenerationMediaBinding as ModelArtifactBinding,
  GenerationPortSubset as ModelFieldSubset,
  GenerationRequest as ModelFieldRequest,
  GenerationRequestDraft as ModelFieldBuilder,
} from "./request.js";
