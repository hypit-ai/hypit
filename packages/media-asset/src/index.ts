export {
  attachMediaRepresentation,
  detachMediaRepresentation,
  parseMediaAssetDocument,
  replaceMediaRepresentation,
  resolveMediaAssetMedia,
  resolveMediaAssetDocument,
  sealMediaAssetDocument,
  serializeMediaAssetDocument,
  verifyMediaAssetDocument,
  verifyMediaAssetReference,
} from "./document.js";
export { createMediaAssetDocumentFromInspection } from "./import.js";
export {
  createMediaRepresentationFacet,
  createMediaRepresentationHost,
  createMediaRepresentationHostFromFacets,
  mediaRepresentationFacetKind,
  mediaRepresentationPackagesFromFacets,
} from "./package.js";
export type {
  MediaRepresentationFacet,
  MediaRepresentationHost,
  MediaRepresentationOpenContext,
  MediaRepresentationOwner,
  MediaRepresentationPackage,
} from "./package.js";
export type * from "./types.js";
export { mediaAssetDocumentFormat } from "./types.js";
