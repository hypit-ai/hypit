import { captionTypes } from "@hypit/caption";
import {
  declarationField,
  sealGraphFragment,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type Awaitable,
} from "@hypit/hypit/author";
import { narrativeTemporalTypes } from "@hypit/narrative-temporal";

import { narrativeCaptionProducers, narrativeCaptionTypes, narrativeCaptionModuleRef } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const narrativeCaptionTimingFragment = sealGraphFragment({
  inputs: [
    { name: "document", type: captionTypes.document },
    { name: "binding", type: narrativeCaptionTypes.binding },
    { name: "timing", type: narrativeTemporalTypes.narrativeLocalTiming },
  ],
  operations: [{
    id: "project",
    producer: narrativeCaptionProducers.projectTiming,
    inputs: { document: input("document"), binding: input("binding"), timing: input("timing") },
    result: { kind: "output" as const, name: "timing" },
  }],
  exports: [{ name: "timing", type: captionTypes.timing, root: operation("project") }],
});

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal") throw new Error(`Narrative Caption Timing ${name} must be literal.`);
  return value.value;
}

async function reference(
  declaration: AuthorDeclaration,
  name: string,
  resolve: (path: string) => Awaitable<AuthorResolvedReference | undefined>,
): Promise<AuthorResolvedReference> {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`Narrative Caption Timing ${name} must be a reference.`);
  const resolved = await resolve(value.path);
  if (resolved === undefined) throw new Error(`Narrative Caption Timing cannot resolve ${value.path}.`);
  return resolved;
}

/** Syntax-neutral projection of Narrative timing into one LocalCaptionTiming output. */
export const narrativeCaptionTimingAuthorDeclaration: AuthorDeclarationCompiler = {
  module: narrativeCaptionModuleRef,
  declaration: "timing",
  outputs: [captionTypes.timing],
  shape: {
    summary: "Projects an explicit Narrative-to-Caption binding into source-local Caption timing.",
    fields: [
      {
        name: "id",
        kind: "identifier",
        required: true,
        summary: "Names the resolved LocalCaptionTiming.",
      },
      {
        name: "document",
        kind: "reference",
        required: true,
        accepts: [captionTypes.document],
        summary: "Chooses displayed Caption content.",
      },
      {
        name: "binding",
        kind: "reference",
        required: true,
        accepts: [narrativeCaptionTypes.binding],
        summary: "Relates Caption units to Narrative Tokens.",
      },
      {
        name: "timing",
        kind: "reference",
        required: true,
        accepts: [narrativeTemporalTypes.narrativeLocalTiming],
        summary: "Locates those Tokens in one exact source-local domain.",
      },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{
      name: id,
      ref: { kind: "component-output", component: id, output: "timing" },
      type: captionTypes.timing,
    }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const [document, binding, timing] = await Promise.all([
      reference(declaration, "document", resolveReference),
      reference(declaration, "binding", resolveReference),
      reference(declaration, "timing", resolveReference),
    ]);
    return {
      records: [],
      components: [{
        id,
        fragment: narrativeCaptionTimingFragment,
        inputs: { document: document.ref, binding: binding.ref, timing: timing.ref },
        outputs: { timing: id },
        range: declaration.range,
      }],
    };
  },
};

/** Markup spelling for the syntax-neutral Timing declaration. */
export const narrativeCaptionTimingMarkupDeclaration = { name: "timing", tag: "Timing" } as const;
