export { canonicalStringify, canonicalize, digestOf, isDigest, recordDigest } from "./canonical.js";
export {
  verifyGraphRecordAffinity,
  verifyInitialAffinities,
  verifyProducerRecordAffinity,
  verifyRecordAffinity,
} from "./affinity.js";
export { CoreError } from "./error.js";
export {
  computeClosureDigest,
  computeModuleDigest,
  createResolvedClosure,
  link,
  resolveCapability,
  resolveProducer,
  resolveType,
  sealRecord,
  sealTypedModule,
  verifyClosure,
  verifyRecord,
} from "./link.js";
export {
  EMPTY_REALIZATION_DIGEST,
  bindingForOutput,
  operationResultRecord,
  operationResultType,
  resolveCandidate,
  resolveLogicalOutput,
  resolveOperation,
  sealBuildRequest,
  sealCompiledGraph,
  selectedCandidate,
  valueRefKey,
  verifyBuildRequest,
  verifyCompiledGraph,
} from "./graph.js";
export { compileBuild, deriveBuildPlan, validatePlan } from "./plan.js";
export { reduce, start } from "./reducer.js";
export { verifyBuildState } from "./verify.js";
export { validateStoredValue } from "./schema.js";
export type { TypedRecordDraft } from "./link.js";
