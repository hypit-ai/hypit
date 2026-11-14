export { canonicalize, canonicalStringify, isResourceId } from "./canonical.js";
export { compareCodeUnits } from "./order.js";
export {
  assertBlobRef,
  blobRefSchema,
  isBlobRef,
  mapValueBlobs,
  normalizeValue,
  valueBlobRefs,
} from "./value.js";
export type { ResourceId } from "./resource-id.js";
export type * from "./value.js";
