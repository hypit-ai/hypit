import type { StoredProduct } from "./materialize.js";

export type StoredProductPublication = {
  readonly format: "hypit.product-publication@1";
  /** Injected from the repository address; product.json does not repeat it. */
  readonly publication: string;
  readonly products: Readonly<Record<string, StoredProduct>>;
  readonly closedAt?: number;
};
