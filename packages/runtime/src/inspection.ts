import type { CanonicalValue, CapabilityRef, TypeRef } from "@hypit/protocol";

type RuntimeEndpointQueryBase = {
  /** Caller-owned identity used to join this observation back to one structural Need. */
  readonly need: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
};

/** A structural deployment demand or one complete request; never a partial request. */
export type RuntimeEndpointQuery = RuntimeEndpointQueryBase & (
  | { readonly kind: "demand" }
  | { readonly kind: "concrete"; readonly constraints: CanonicalValue }
);

/** Runtime deployment selection and concrete Endpoint support are independent observations. */
type RuntimeEndpointObservationBase = {
  readonly need: string;
  readonly capability: CapabilityRef;
  readonly binding?: string;
};

type ResolvedEndpointObservation = {
  readonly status: "resolved";
  readonly endpoint: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: never;
} & (
  | { readonly support: "supported" | "not-evaluated"; readonly rejections?: never }
  | { readonly support: "unsupported"; readonly rejections: readonly { readonly endpoint: string; readonly message: string }[] }
);

type UnresolvedEndpointObservation = {
  readonly status: "unresolved";
  readonly support: "not-evaluated";
  readonly endpoint?: never;
  readonly use?: never;
  readonly pricing?: never;
  readonly endpoints?: never;
  readonly rejections?: never;
};

type AmbiguousEndpointObservation = {
  readonly status: "ambiguous";
  readonly support: "not-evaluated";
  readonly endpoints: readonly string[];
  readonly endpoint?: never;
  readonly use?: never;
  readonly pricing?: never;
  readonly rejections?: never;
};

/** Deployment selection is closed before optional pricing enrichment is attached. */
export type RuntimeEndpointObservation = RuntimeEndpointObservationBase & (
  | ResolvedEndpointObservation
  | UnresolvedEndpointObservation
  | AmbiguousEndpointObservation
);

/** Optional request-sensitive pricing enrichment of the same deployment observation. */
type RuntimePricingDocuments = readonly {
    readonly source: string;
    readonly data: CanonicalValue;
    readonly summary?: string;
  }[];

type RuntimePricingEnrichment = (
  | { readonly pricingDocuments?: never; readonly pricingError?: never }
  | { readonly pricingDocuments: RuntimePricingDocuments; readonly pricingError?: never }
  | { readonly pricingError: string; readonly pricingDocuments?: never }
);

type RuntimeNoPricingEnrichment = {
  readonly pricingDocuments?: never;
  readonly pricingError?: never;
};

/** Pricing evidence exists only for one resolved Endpoint that accepted or has not evaluated a request. */
export type RuntimeEndpointPricingObservation = RuntimeEndpointObservationBase & (
  | (ResolvedEndpointObservation & { readonly support: "supported" | "not-evaluated" } & RuntimePricingEnrichment)
  | (ResolvedEndpointObservation & { readonly support: "unsupported" } & RuntimeNoPricingEnrichment)
  | (UnresolvedEndpointObservation & RuntimeNoPricingEnrichment)
  | (AmbiguousEndpointObservation & RuntimeNoPricingEnrichment)
);
