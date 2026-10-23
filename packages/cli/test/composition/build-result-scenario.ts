import { join } from "node:path";

import { FileBuildResult, FileBuildResultRepository } from "@hypit/result/node";
import type { CapabilityRef, TypeRef, TypedRecord } from "@hypit/protocol";

import type { CliDistribution } from "../../src/distribution.js";
import { runCli } from "../../src/main.js";
import { cliDistribution } from "../distribution-scenario.js";

export const valueType: TypeRef = {
  module: { name: "example.result", version: "1" },
  name: "Value",
};

export const generationCapability: CapabilityRef = {
  module: valueType.module,
  name: "generation",
};

export function publication(
  outputs: readonly { readonly name: string; readonly output: string; readonly record?: string; readonly displayName?: string; readonly type?: TypeRef }[],
  targets: readonly string[] = [],
) {
  const selected = new Set(targets);
  return { outputs: outputs.map((output) => ({ ...output, target: selected.has(output.name),
    type: output.type ?? valueType,
    source: {
      kind: "current-record" as const,
      record: output.record ?? (output.output.startsWith("logical:")
        ? `record:${output.output.slice("logical:".length)}`
        : output.output),
    } })) };
}

export function completedRecords(): readonly TypedRecord[] {
  return [{ id: "record:stage", type: valueType, value: "ready" }];
}

export async function fixture(root: string, id = "bld_20260902T110000000Z_0000000001", source = "main.svml"): Promise<void> {
  const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
    id,
    title: "episode-stage",
    sourceId: source,
    runId: "build.svrun",
    publication: publication([{ name: "stage.value", output: "logical:stage" }], ["stage.value"]),
  });
  await result.sync({
    records: completedRecords(),
    resources: { async open() { throw new Error("inline Result has no files"); } },
  });
  await result.finish({ outcome: "complete" });
}

export function resultDistribution(): CliDistribution {
  return cliDistribution({
    async openProjectResults(projectRoot: string) {
      return {
        location: {
          root: projectRoot,
          selection: { use: "test.results", config: {} },
        },
        repository: new FileBuildResultRepository(join(projectRoot, ".hypit", "results")),
        close() {},
      };
    },
    async diagnoseProjectResults() { return { diagnostics: [] }; },
  });
}

export async function jsonCommand(args: readonly string[], root: string): Promise<unknown> {
  let output = "";
  await runCli([...args, "--project", root, "--json"], {
    write(text) { output += text; },
  }, resultDistribution());
  return JSON.parse(output);
}

export async function humanCommand(args: readonly string[], root: string): Promise<string> {
  let output = "";
  await runCli([...args, "--project", root], {
    write(text) { output += text; },
  }, resultDistribution());
  return output;
}
