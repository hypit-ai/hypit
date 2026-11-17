export type * from "./types.js";
export {
  assertNpmPackageName,
  assertProjectIdentity,
  assertProjectManifest,
  createProjectManifest,
  parseProjectManifest,
  sealProjectManifest,
  serializeProjectManifest,
} from "./manifest.js";
export {
  ProjectPackageEnvironment,
  createProjectPackageEnvironment,
  defineHypitPackage,
  type ProjectPackageCatalogResolution,
  type ProjectPackageContributionResolution,
} from "./package-environment.js";
export {
  ProjectDocumentRegistry,
  assertProjectRelativePath,
  type OpenProjectDocumentObservation,
  type ProjectDocumentLease,
  type ProjectOwnerProvider,
} from "./document-registry.js";
export {
  ProjectHost,
  openProjectHost,
  type OpenProjectHostOptions,
  type ProjectHostContext,
  type ProjectHostEvent,
  type ProjectHostEventListener,
  type ProjectHostProjection,
} from "./host.js";
export {
  ProjectResourceGateway,
  openProjectResourceGateway,
  type ProjectHostResource,
  type ProjectHostResourceResolution,
} from "./resources.js";
