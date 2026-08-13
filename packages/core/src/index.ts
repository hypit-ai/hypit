export { canonicalStringify, canonicalize, digestOf, isDigest, recordDigest } from "./canonical.js";
export { CoreError } from "./error.js";
export {
  computeClosureDigest,
  computeModuleDigest,
  createResolvedClosure,
  link,
  resolveProducer,
  resolveType,
  sealRecord,
  verifyClosure,
  verifyRecord,
  verifyRecordStructure,
} from "./link.js";
export {
  operationResultRecord,
  operationResultType,
  resolveCandidate,
  resolveLogicalOutput,
  resolveOperation,
  sealBuildRequest,
  sealCompiledGraph,
  satisfiedCandidate,
  valueRefKey,
  verifyBuildRequest,
  verifyCompiledGraph,
} from "./graph.js";
export { compileBuild, plannedNeeds, validatePlan } from "./plan.js";
export type { PlannedNeed } from "./plan.js";
export { sliceExecution } from "./slice.js";
export { reduce, start } from "./reducer.js";
export { verifyBuildState } from "./verify.js";
export { validateStoredValue } from "./schema.js";
export type { TypedRecordDraft } from "./link.js";
