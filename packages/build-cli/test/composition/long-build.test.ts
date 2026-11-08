import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, defineBuild, link, materializeBuild } from "@hypit/kernel";
import { assertOrderedBuildId } from "@hypit/protocol";

import {
  createPublicBuildId,
  submitLongBuild,
  type CliRuntimeHost,
  type LongBuildRequest,
} from "../../src/index.js";

const definition = defineBuild({
  program: link(createResolvedClosure([]), []),
  plan: { format: "hypit.plan@1", steps: [], goals: [] },
});

function request(id: string): LongBuildRequest {
  return {
    id,
    definition,
    authoring: {
      sourcePath: "/project/work.graph.json",
      targets: ["hero"],
      publication: { outputs: [] },
    },
    publicationStores: {
      root: "/project",
      historyPath: ".hypit/results",
      productsPath: ".hypit/products",
    },
  };
}

function host(calls: string[]): CliRuntimeHost {
  return {
    profile: "/project/hypit.runtime.json",
    executionStatus: async () => ({ state: "running" }),
    ensureExecution: async () => ({ state: "running" }),
    createRuntime: async () => { throw new Error("command-scoped inspection must create execution"); },
    openControl: async () => { throw new Error("unused"); },
    openCredentials: async () => { throw new Error("unused"); },
    preflight: async () => ({ dataRoot: "/runtime", diagnostics: [] }),
    doctor: async () => ({ dataRoot: "/runtime", diagnostics: [] }),
    endpoints: async () => [],
    pricing: async () => [],
    invoke: async () => { throw new Error("unused"); },
    openTransientExecution: async () => { throw new Error("unused"); },
    async openInspection() {
      calls.push("inspect");
      return {
        dataRoot: "/runtime",
        endpoints: async () => { calls.push("endpoints"); return []; },
        pricing: async () => [],
        preflight: async () => { calls.push("preflight"); return { dataRoot: "/runtime", diagnostics: [] }; },
        executionStatus: async () => ({ state: "running" }),
        ensureExecution: async () => { calls.push("ensure"); return { state: "running" }; },
        createRuntime: async () => {
          calls.push("runtime");
          return {
            async build(input) {
              calls.push("build");
              return {
                id: input.id,
                state: materializeBuild(input.definition, []),
                view: {
                  id: input.id,
                  activity: "ready" as const,
                  targets: [...input.authoring.targets],
                  operations: [],
                },
              };
            },
            inspect: async () => undefined,
            activity: async () => ({ builds: [], capacity: [] }),
            cancel: async () => undefined,
            describeCredentials: async () => [],
            credentials: async () => [],
            putCredential: async () => { throw new Error("unused"); },
            deleteCredential: async () => { throw new Error("unused"); },
            async close() { calls.push("runtime.close"); },
          };
        },
        async close() { calls.push("inspection.close"); },
      };
    },
  };
}

test("the long-running submission seam owns preflight, execution startup and acceptance", async () => {
  const calls: string[] = [];
  const id = createPublicBuildId(Date.parse("2026-11-08T13:00:00.000Z"));
  assertOrderedBuildId(id);
  const session = await submitLongBuild({
    host: host(calls),
    request: request(id),
    packageContributions: [],
    accepted(submission) {
      assert.equal(submission.id, id);
      calls.push("accepted");
    },
  });
  assert.equal(session.submission.id, id);
  assert.deepEqual(calls, ["inspect", "endpoints", "preflight", "ensure", "runtime", "build", "accepted"]);
  await session.close();
  await session.close();
  assert.deepEqual(calls.slice(-2), ["runtime.close", "inspection.close"]);
});

test("an author acknowledgement failure closes the command session after durable acceptance", async () => {
  const calls: string[] = [];
  await assert.rejects(submitLongBuild({
    host: host(calls),
    request: request("bld_20261108T130000000Z_0000000001"),
    packageContributions: [],
    accepted() {
      calls.push("accepted");
      throw new Error("project revision changed");
    },
  }), /project revision changed/u);
  assert.deepEqual(calls.slice(-4), ["build", "accepted", "runtime.close", "inspection.close"]);
});
