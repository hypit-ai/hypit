import type { BlobRef, CanonicalValue, Value } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { ProductAddress } from "./address.js";
import type { StoredProduct } from "./materialize.js";

export type ProductFileRange = {
  readonly start: number;
  readonly endExclusive: number;
};

export type Product = {
  readonly address: ProductAddress;
  readonly type: TypeRef;
  readonly publisher: string;
  readonly publicationParameters?: CanonicalValue;
} & (
  | { readonly representation: "inline"; readonly value: null | boolean | number | string;
      readonly mediaType?: never; readonly size?: never }
  | { readonly representation: "structured"; readonly value?: never;
      readonly mediaType?: never; readonly size?: never }
  | { readonly representation: "file"; readonly mediaType: string; readonly size: number }
);

export type ResolvedProduct = {
  readonly address: ProductAddress;
  readonly type: TypeRef;
  readonly publisher: string;
  readonly publicationParameters?: CanonicalValue;
  readonly value: Value;
  openResource(
    blob: BlobRef,
    range?: ProductFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined>;
};

/** Exact Product lookup, independent of Build-history browsing and physical storage paths. */
export type ProductHistory = {
  readProduct(address: ProductAddress): Promise<Product | undefined>;
  resolveProduct(address: ProductAddress): Promise<ResolvedProduct | undefined>;
};

export function productFromStored(address: ProductAddress, stored: StoredProduct): Product {
  const common = {
    address,
    type: stored.type,
    publisher: stored.publisher,
    ...(stored.publicationParameters === undefined
      ? {}
      : { publicationParameters: stored.publicationParameters }),
  };
  if (stored.value.kind === "product-file") {
    return {
      ...common,
      representation: "file",
      mediaType: stored.value.mediaType,
      size: stored.value.size,
    };
  }
  return stored.value.kind === "inline"
    ? { ...common, representation: "inline", value: stored.value.value }
    : { ...common, representation: "structured" };
}
