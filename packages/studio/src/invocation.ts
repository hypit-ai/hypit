import type { PreparedBuild } from "@hypit/hypit/compiler";
import { InvocationCompiler } from "@hypit/hypit/compiler";
import type { Invocation } from "@hypit/hypit/protocol";
import type { InvocationRequest } from "@hypit/hypit/invocation";
import type { BlobAttachment } from "@hypit/hypit/workspace";
import {
  invocationFrontendsFromFacets,
  InvocationFrontendRegistry,
} from "@hypit/hypit/invocation";

import { observedCompiledSource } from "./compile.js";
import type { CompiledSource } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { observeAuthorDocument } from "./observe.js";

export type StudioPlan = {
  readonly invocationSource?: string;
  readonly authorSource: string;
  /** The observed Author graph used by this exact Invocation. */
  readonly source: CompiledSource;
  readonly invocation: Invocation;
  readonly targets: readonly string[];
  readonly attachments: readonly BlobAttachment[];
  readonly prepare: (invocation: Invocation, targets: readonly string[]) => PreparedBuild;
};

/** Compile either an explicit Author request or a saved Invocation preset through one path. */
export type StudioInvocationSelection =
  | { readonly kind: "author"; readonly source: string; readonly request: InvocationRequest }
  | { readonly kind: "preset"; readonly source: string };

export async function loadStudioPlan(input: {
  readonly selection: StudioInvocationSelection;
  readonly domain: StudioDomain;
  readonly registry: import("./studio-registry.js").StudioCompanionRegistry;
}): Promise<StudioPlan> {
  const frontends = new InvocationFrontendRegistry();
  for (const contribution of input.domain.contributions) {
    for (const frontend of invocationFrontendsFromFacets(contribution.facets ?? [])) {
      frontends.register(frontend);
    }
  }
  const compiler = new InvocationCompiler({
    authorCompiler: input.domain.createCompiler(),
    frontends,
  });
  const compiled = input.selection.kind === "preset"
    ? await compiler.compilePresetEntry(input.selection.source)
    : await compiler.compileAuthorEntry(input.selection.source, input.selection.request);
  const source = await observedCompiledSource(
    compiled.author,
    observeAuthorDocument(compiled.authorDocument, compiled.author, input.registry),
  );
  const targets = compiled.invocation.targets;
  return {
    ...(input.selection.kind === "preset" ? { invocationSource: input.selection.source } : {}),
    authorSource: compiled.authorSource,
    source,
    invocation: compiled.invocation,
    targets,
    attachments: compiled.attachments,
    prepare(invocation, selected) {
      return compiler.prepareVariant(compiled, { ...invocation, targets: selected });
    },
  };
}
