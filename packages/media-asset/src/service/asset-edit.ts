import { normalizeMediaAssetDisplayName, verifyMediaAssetReference, type MediaAssetReference } from "../index.js";

export type ProjectMediaAssetChange =
  | { readonly kind: "asset.rename"; readonly asset: MediaAssetReference; readonly displayName: string }
  | { readonly kind: "asset.remove"; readonly asset: MediaAssetReference };

export type ProjectMediaAssetEdit = ProjectMediaAssetChange & { readonly expectedGeneration: number };

export function readProjectMediaAssetEdit(value: unknown): ProjectMediaAssetEdit {
  const request = value as Partial<ProjectMediaAssetEdit> | null | undefined;
  if (!request || (request.kind !== "asset.rename" && request.kind !== "asset.remove")
    || typeof request.expectedGeneration !== "number" || !Number.isSafeInteger(request.expectedGeneration)
    || request.expectedGeneration < 0) throw new Error("Project Media Asset edit is invalid.");
  verifyMediaAssetReference(request.asset);
  if (Object.keys(request).length !== (request.kind === "asset.rename" ? 4 : 3)) {
    throw new Error("Project Media Asset edit fields are invalid.");
  }
  const common = { asset: request.asset, expectedGeneration: request.expectedGeneration };
  return request.kind === "asset.rename"
    ? { ...common, kind: request.kind, displayName: normalizeMediaAssetDisplayName(request.displayName) }
    : { ...common, kind: request.kind };
}

export class ProjectMediaAssetRevisionConflict extends Error {
  constructor(expected: number, actual: number) {
    super(`Project Media Catalog changed: expected generation ${expected}, found ${actual}.`);
    this.name = "ProjectMediaAssetRevisionConflict";
  }
}
