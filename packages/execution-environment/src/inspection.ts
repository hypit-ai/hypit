import type { CanonicalValue } from "@hypit/protocol";
import type { CapabilityRef, TypeRef } from "@hypit/module";

type ExecutionEnvironmentEndpointQueryBase = {
  /** Caller-owned identity used to join this observation back to one structural Need. */
  readonly need: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
};

/** A structural deployment demand or one complete request; never a partial request. */
export type ExecutionEnvironmentEndpointQuery = ExecutionEnvironmentEndpointQueryBase & (
  | { readonly kind: "demand" }
  | { readonly kind: "concrete"; readonly constraints: CanonicalValue }
);

/** Runtime deployment selection and concrete Endpoint support are independent observations. */
type ExecutionEnvironmentEndpointObservationBase = {
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
export type ExecutionEnvironmentEndpointObservation = ExecutionEnvironmentEndpointObservationBase & (
  | ResolvedEndpointObservation
  | UnresolvedEndpointObservation
  | AmbiguousEndpointObservation
);

/** Optional request-sensitive pricing enrichment of the same deployment observation. */
type ExecutionEnvironmentPricingDocuments = readonly {
    readonly source: string;
    readonly data: CanonicalValue;
    readonly summary?: string;
  }[];

type ExecutionEnvironmentPricingEnrichment = (
  | { readonly pricingDocuments?: never; readonly pricingError?: never }
  | { readonly pricingDocuments: ExecutionEnvironmentPricingDocuments; readonly pricingError?: never }
  | { readonly pricingError: string; readonly pricingDocuments?: never }
);

type ExecutionEnvironmentNoPricingEnrichment = {
  readonly pricingDocuments?: never;
  readonly pricingError?: never;
};

/** Pricing evidence exists only for one resolved Endpoint that accepted or has not evaluated a request. */
export type ExecutionEnvironmentEndpointPricingObservation = ExecutionEnvironmentEndpointObservationBase & (
  | (ResolvedEndpointObservation & { readonly support: "supported" | "not-evaluated" } & ExecutionEnvironmentPricingEnrichment)
  | (ResolvedEndpointObservation & { readonly support: "unsupported" } & ExecutionEnvironmentNoPricingEnrichment)
  | (UnresolvedEndpointObservation & ExecutionEnvironmentNoPricingEnrichment)
  | (AmbiguousEndpointObservation & ExecutionEnvironmentNoPricingEnrichment)
);
