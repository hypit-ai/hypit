import type { ProjectedCompiledAuthorSource, ProjectedPreparedBuild } from "@hypit/hypit/compiler";
import { BuildCompiler } from "@hypit/hypit/compiler";
import type { ResolvedTargetSelection, TargetSelection } from "@hypit/hypit/compiler";
import type { BlobAttachment } from "@hypit/hypit/workspace";

import { observedCompiledSource } from "./compile.js";
import type { CompiledSource } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { observeAuthorDocument } from "./observe.js";

export type StudioPlan = {
  readonly authorSource: string;
  readonly source: CompiledSource;
  readonly targets: readonly string[];
  readonly attachments: readonly BlobAttachment[];
  readonly prepare: (targets: readonly string[]) => ProjectedPreparedBuild;
};

export type StudioTargetSelection = {
  readonly source: string;
  readonly request: TargetSelection;
};

export async function loadStudioPlan(input: {
  readonly selection: StudioTargetSelection;
  readonly domain: StudioDomain;
  readonly registry: import("./studio-registry.js").StudioCompanionRegistry;
}): Promise<StudioPlan> {
  const authorCompiler = input.domain.createCompiler();
  const compiler = new BuildCompiler({ authorCompiler });
  const compiled = await compiler.compileAuthorEntry(
    input.selection.source,
    input.selection.request,
    { authorProjection: true },
  );
  if (!("provenance" in compiled.author)) throw new Error("Studio author projection was not compiled");
  const author = compiled.author as ProjectedCompiledAuthorSource;
  const authorWorkspace = await authorCompiler.openEntry(compiled.authorSource);
  const authorDocument = await authorCompiler.openAuthorDocument(authorWorkspace.entry);
  const source = await observedCompiledSource(
    author,
    observeAuthorDocument(authorDocument, author, input.registry),
  );
  const targets = compiled.selection.targets.map((target) => target.output);
  return {
    authorSource: compiled.authorSource,
    source,
    targets,
    attachments: compiled.author.attachments,
    prepare(selected) {
      const selection: ResolvedTargetSelection = {
        targets: selected.map((output) => {
          const target = source.exports.find((candidate) => candidate.ref === output);
          if (target === undefined) throw new Error(`Unknown Studio target ${output}`);
          return { name: target.name, output, type: target.typeRef };
        }),
      };
      return compiler.prepareSelection(compiled, selection, { executionView: true });
    },
  };
}
