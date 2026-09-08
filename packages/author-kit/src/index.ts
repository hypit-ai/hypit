/**
 * Stable framework-facing author-package surface.
 *
 * Domain values stay with their owning packages; this module only joins the small set of framework
 * interfaces needed to declare a Module, lower a Surface into a Fragment and provide deterministic
 * handlers. It performs no discovery, registration, installation or execution.
 */
export {
  canonicalize,
  isResourceId,
  sameType,
} from "@hypit/protocol";
export type {
  BlobRef,
  CanonicalValue,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  StoredValue,
  TypeRef,
  TypedRecord,
  ValueSchema,
} from "@hypit/protocol";

export type {
  ComponentPackage,
  ProducerFacet,
  ProducerHandler,
  ProducerHandlerContext,
  ProducerHandlerResult,
  TypeValidatorFacet,
  TypeValidatorHandler,
} from "@hypit/component-kit";

export {
  sealGraphFragment,
} from "@hypit/elaborator";
export type {
  FragmentOperation,
  GraphFragment,
} from "@hypit/elaborator";

export {
  assertAttributes,
  assertEmptyElement,
  assertExactAttributes,
  createMarkupSurfaceHostFacet,
  localName,
  optionalTextAttribute,
  textAttribute,
} from "@hypit/markup";
export type {
  MarkupSurfaceHostFacetOptions,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceComponentDraft,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
} from "@hypit/markup";
