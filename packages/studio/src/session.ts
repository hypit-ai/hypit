import { existsSync, readFileSync } from "node:fs";

import { markupDeclarationAuthorFrontendId } from "@hypit/hypit/markup";
import type { CliTransientExecution as RuntimeHostTransientExecution } from "@hypit/hypit/cli";
import { recipeFrontendId } from "@hypit/hypit/recipe";

import type { ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { resolveStudioProjection } from "./projection.js";
import { renderStudioHtmlProgram } from "./preview/render.js";
import type { StudioPlan } from "./build-plan.js";
import type { StudioSnapshot } from "./shared.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import { snapshot } from "./snapshot.js";
import { inspectStudioPlan } from "./studio-preflight.js";
import type { StudioSourceFile } from "./parameters.js";
import type { BuildView } from "@hypit/hypit/kernel";
import type { Placement } from "./observe.js";

function sourceFiles(plan: StudioPlan): readonly StudioSourceFile[] {
  const paths = [
    plan.authorSource,
    ...plan.source.compiled.closure.units.map((unit) => unit.id),
  ];
  return [...new Set(paths)].flatMap((path): StudioSourceFile[] => {
    if (!existsSync(path)) return [];
    try {
      const unit = plan.source.compiled.closure.units.find((candidate) => candidate.id === path);
      const language = unit?.frontend === recipeFrontendId
          ? "svs" as const
          : unit?.frontend === markupDeclarationAuthorFrontendId
            ? "svml" as const
            : undefined;
      if (language === undefined) return [];
      return [{
        path,
        text: readFileSync(path, "utf8"),
        language,
        role: path === plan.authorSource ? "author" : "dependency",
        ...(unit === undefined ? {} : { imports: unit.imports }),
      }];
    } catch {
      return [];
    }
  });
}

export type StudioSession = {
  readonly declarationIssues: readonly string[];
  readonly snapshot: StudioSnapshot;
  readonly document: import("@hypit/html-program").HtmlProgram;
  readonly visualHtml: string;
  readonly material: ReadonlyMap<string, ServedFile>;
  readonly temporalEdit: {
    readonly state: BuildView;
    readonly files: readonly StudioSourceFile[];
    readonly placements: readonly Placement[];
  };
};

export async function readStudioSession(input: {
  readonly domain: StudioDomain;
  readonly registry: StudioCompanionRegistry;
  readonly plan: StudioPlan;
  readonly revision: number;
  readonly sourcePath?: string;
  readonly workspaceRoot: string;
  readonly transientExecution?: RuntimeHostTransientExecution;
}): Promise<StudioSession> {
  const source = input.plan.source;
  const inspection = inspectStudioPlan(input.registry, source, input.plan);
  const outputRefs = [
    inspection.filmComposition,
    inspection.timeRef,
    ...inspection.tracks.map((track) => track.ref),
    ...inspection.requiredValues,
  ];
  const built = await resolveStudioProjection({
    source,
    registry: input.registry,
    plan: input.plan,
    domain: input.domain,
    outputRefs,
    compositionRef: inspection.filmComposition,
    timeRef: inspection.timeRef,
    tracks: inspection.tracks,
    ...(input.transientExecution === undefined ? {} : { transientExecution: input.transientExecution }),
  });
  const rendered = renderStudioHtmlProgram({
    composition: built.composition,
    served: new Set(built.served.keys()),
  });
  const text = readFileSync(input.plan.authorSource, "utf8");
  const files = sourceFiles(input.plan);
  return {
    declarationIssues: built.declarationIssues,
    document: rendered.document,
    visualHtml: rendered.html,
    snapshot: snapshot(input.registry, built, {
      revision: input.revision,
      path: input.sourcePath ?? input.plan.authorSource,
      text,
      selection: {
        targets: input.plan.targets,
      },
      canvas: built.canvas,
      frameRate: built.frameRate,
      preview: { kind: "html-program", srcdoc: rendered.preview },
      workspaceRoot: input.workspaceRoot,
      sourceFiles: files,
    }),
    material: built.served,
    temporalEdit: {
      state: built.state,
      files,
      placements: built.source.observations.placements,
    },
  };
}
