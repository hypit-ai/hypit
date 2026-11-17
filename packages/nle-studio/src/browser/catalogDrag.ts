import type { NleStudioAdjustCatalogEntry, NleStudioComponentCatalogEntry, NleStudioTransitionCatalogEntry } from "../protocol.js";
export type CatalogDrag =
  | { readonly kind: "component"; readonly entry: NleStudioComponentCatalogEntry }
  | { readonly kind: "effect"; readonly entry: NleStudioAdjustCatalogEntry }
  | { readonly kind: "transition"; readonly entry: NleStudioTransitionCatalogEntry };
export const catalogDragId = (value: CatalogDrag) => `catalog:${value.kind}:${value.entry.package}:${value.entry.offering}`;
