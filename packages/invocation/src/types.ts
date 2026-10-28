import type { CompiledSourceClosure } from "@hypit/author";
import type { Invocation } from "@hypit/protocol";
import type { SourceUnit } from "@hypit/source";

export type InvocationAuthorSourceRequest = {
  readonly source: string;
};

/** Source-level spelling of a transient invocation choice. */
export type InvocationRequestOverride = {
  readonly output: string;
  readonly choice:
    | { readonly kind: "primary" }
    | { readonly kind: "record"; readonly record: string };
};

/** Author-facing names selected for one invocation before compilation resolves graph identities. */
export type InvocationRequest = {
  readonly targets: readonly string[];
  readonly overrides: readonly InvocationRequestOverride[];
};

export type InvocationSourceDocument = {
  readonly format: "hypit.invocation-source@1";
  readonly author: InvocationAuthorSourceRequest;
  readonly targets: readonly string[];
  readonly overrides: readonly InvocationRequestOverride[];
};

export type InvocationSourceDiscovery = {
  readonly author: InvocationAuthorSourceRequest;
};

export type InvocationFrontend = {
  readonly id: string;
  discover(source: SourceUnit): InvocationSourceDiscovery | Promise<InvocationSourceDiscovery>;
  decode(source: SourceUnit): InvocationSourceDocument | Promise<InvocationSourceDocument>;
};

export interface InvocationFrontendRegistryLike {
  resolve(id: string): InvocationFrontend | undefined;
}

export type ResolveInvocationPresetContext = {
  readonly compilation: CompiledSourceClosure;
};

export type ResolvedInvocationPreset = {
  readonly document: InvocationSourceDocument;
  readonly invocation: Invocation;
};
