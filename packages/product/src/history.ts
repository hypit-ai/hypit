import type { BlobRef, CanonicalValue, TypeRef, Value } from "@hypit/protocol";
import type { ProductAddress } from "./address.js";

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

/** Exact Product lookup, independent of Run-history browsing and physical storage paths. */
export type ProductHistory = {
  readProduct(address: ProductAddress): Promise<Product | undefined>;
  resolveProduct(address: ProductAddress): Promise<ResolvedProduct | undefined>;
};
