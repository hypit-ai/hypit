/**
 * Optional helpers for Providers whose wire format is a field map plus URL-addressed resources.
 * Model packages do not depend on this entry point, and Providers may implement adapters directly.
 */
export {
  assertMappingCoversFields,
  mappingSupportsRequest,
  materializeWireRequest,
  planWireRequest,
  selectWireModel,
  selectWireModelForRequest,
} from "./mapping.js";
export type {
  GenerationArtifactUrlResolver,
  GenerationFieldMapping,
  GenerationWireMapping,
  GenerationWirePlan,
  GenerationWireRequest,
  GenerationWireResource,
  GenerationWireRoute,
  GenerationWireValuePlan,
} from "./mapping.js";
/** Request shape understood by the optional field-mapping helper, not by Generation itself. */
export type { ModelFieldRequest as ProviderFieldRequest } from "./request.js";
