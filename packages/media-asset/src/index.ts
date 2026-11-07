export {
  parseMediaAssetDocument,
  resolveMediaAssetMedia,
  resolveMediaAssetDocument,
  sealMediaAssetDocument,
  serializeMediaAssetDocument,
  verifyMediaAssetDocument,
  verifyMediaAssetReference,
} from "./document.js";
export {
  createMediaRepresentationFacet,
  createMediaRepresentationHost,
  createMediaRepresentationHostFromFacets,
  mediaRepresentationFacetAbi,
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
