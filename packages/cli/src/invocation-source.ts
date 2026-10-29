import { InvocationCompiler } from "@hypit/compiler";
import type {
  CompiledInvocation,
  InvocationAuthorCompiler,
} from "@hypit/compiler";
import type { PackageContribution } from "@hypit/loader";
import type { InvocationRequest, InvocationFrontend } from "@hypit/invocation";
import {
  invocationFrontendsFromFacets,
  InvocationFrontendRegistry,
} from "@hypit/invocation";
import type { WorkspaceSession } from "@hypit/workspace";

export type LoadedInvocation = CompiledInvocation & {
  readonly origin:
    | { readonly kind: "author"; readonly source: string }
    | { readonly kind: "preset"; readonly source: string };
  readonly compiler: InvocationCompiler;
};

function createInvocationCompiler(options: {
  readonly authorCompiler: InvocationAuthorCompiler;
  readonly frontends: readonly InvocationFrontend[];
}): InvocationCompiler {
  const frontends = new InvocationFrontendRegistry();
  for (const frontend of options.frontends) frontends.register(frontend);
  return new InvocationCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
  });
}

export async function checkInvocationPreset(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: InvocationAuthorCompiler;
  readonly frontends: readonly InvocationFrontend[];
}) {
  const compiler = createInvocationCompiler(options);
  return await compiler.checkPresetResolvedSource(options.workspace.entry, options.workspace);
}

export function collectInvocationFrontends(
  packages: readonly PackageContribution[],
): readonly InvocationFrontend[] {
  return packages.flatMap((item) => invocationFrontendsFromFacets(item.facets ?? []));
}

export async function loadInvocation(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: InvocationAuthorCompiler;
  readonly frontends: readonly InvocationFrontend[];
  readonly input:
    | { readonly kind: "author"; readonly request: InvocationRequest }
    | { readonly kind: "preset" };
}): Promise<LoadedInvocation> {
  const compiler = createInvocationCompiler(options);
  const compiled = options.input.kind === "preset"
    ? await compiler.compilePresetResolvedSource(options.workspace.entry, options.workspace)
    : await compiler.compileAuthorResolvedSource(options.workspace.entry, options.workspace, options.input.request);
  return {
    ...compiled,
    compiler,
    origin: {
      kind: options.input.kind,
      source: options.workspace.sourceLocation?.(options.workspace.entry.unit) ?? options.workspace.entry.unit.id,
    },
  };
}
