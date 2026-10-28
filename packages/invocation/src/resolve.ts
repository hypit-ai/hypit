import { resolveCompiledSourceExport } from "@hypit/author";
import { sealInvocation } from "./invocation.js";

import type {
  ResolveInvocationPresetContext,
  InvocationRequest,
  ResolvedInvocationPreset,
  InvocationSourceDocument,
} from "./types.js";

function authorRef(context: ResolveInvocationPresetContext, name: string) {
  const exported = resolveCompiledSourceExport(context.compilation, name);
  return exported.ref;
}

function logicalOutput(context: ResolveInvocationPresetContext, name: string): string {
  const exported = resolveCompiledSourceExport(context.compilation, name);
  if (exported.ref.kind !== "logical-output") {
    throw new Error(`${name} is an authored Record, not a realizable Logical Output`);
  }
  return exported.ref.id;
}

/** Resolve author-facing Output and Record names into one source-neutral Invocation. */
export function resolveInvocationRequest(
  request: InvocationRequest,
  context: ResolveInvocationPresetContext,
): import("@hypit/protocol").Invocation {
  const targets = request.targets.map((item) => logicalOutput(context, item));
  return sealInvocation({
    targets,
    overrides: request.overrides.map((item) => {
      const output = logicalOutput(context, item.output);
      if (item.choice.kind === "primary") return { output, choice: item.choice };
      const ref = authorRef(context, item.choice.record);
      if (ref.kind !== "record") {
        throw new Error(`${item.choice.record} is not an authored Record`);
      }
      return { output, choice: { kind: "record" as const, record: ref.id } };
    }),
  });
}

/** Decode an optional saved Invocation preset against its explicitly named Author Source. */
export async function resolveInvocationSourceDocument(
  document: InvocationSourceDocument,
  context: ResolveInvocationPresetContext,
): Promise<ResolvedInvocationPreset> {
  const invocation = resolveInvocationRequest(document, context);
  return {
    document,
    invocation,
  };
}
