import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, defineBuild, link } from "@hypit/kernel";
import { assertOrderedBuildId } from "@hypit/protocol";

import {
  createPublicBuildId,
  submitLongBuild,
  type BuildSubmissionHost,
  type BuildSubmissionInspection,
  type BuildSubmissionRuntime,
} from "../src/index.js";

const definition = defineBuild({
  program: link(createResolvedClosure([]), []),
  plan: { format: "hypit.plan@1", steps: [], goals: [] },
});

type Request = { readonly id: string; readonly definition: typeof definition; readonly payload: string };
type Submission = { readonly id: string; readonly accepted: true };
type Runtime = BuildSubmissionRuntime<Request, Submission>;
type Inspection = BuildSubmissionInspection<Runtime>;

function host(calls: string[]): BuildSubmissionHost<Inspection> {
  return {
    async openInspection() {
      calls.push("inspect");
      return {
        endpoints: async () => { calls.push("endpoints"); return []; },
        preflight: async () => { calls.push("preflight"); return { diagnostics: [] }; },
        ensureExecution: async () => { calls.push("ensure"); return { state: "running" as const }; },
        createRuntime: async () => {
          calls.push("runtime");
          return {
            async build(request) {
              calls.push(`build:${request.payload}`);
              return { id: request.id, accepted: true };
            },
            async close() { calls.push("runtime.close"); },
          };
        },
        async close() { calls.push("inspection.close"); },
      };
    },
  };
}

test("submission owns preflight, execution startup and durable acceptance", async () => {
  const calls: string[] = [];
  const id = createPublicBuildId(Date.parse("2026-11-08T13:00:00.000Z"));
  assertOrderedBuildId(id);
  const session = await submitLongBuild({
    host: host(calls),
    request: { id, definition, payload: "hero" },
    packageContributions: [],
    accepted(submission) {
      assert.equal(submission.id, id);
      calls.push("accepted");
    },
  });
  assert.equal(session.submission.id, id);
  assert.deepEqual(calls, ["inspect", "endpoints", "preflight", "ensure", "runtime", "build:hero", "accepted"]);
  await session.close();
  await session.close();
  assert.deepEqual(calls.slice(-2), ["runtime.close", "inspection.close"]);
});

test("an author acknowledgement failure closes the accepted command session", async () => {
  const calls: string[] = [];
  await assert.rejects(submitLongBuild({
    host: host(calls),
    request: {
      id: "bld_20261108T130000000Z_0000000001",
      definition,
      payload: "hero",
    },
    packageContributions: [],
    accepted() {
      calls.push("accepted");
      throw new Error("project revision changed");
    },
  }), /project revision changed/u);
  assert.deepEqual(calls.slice(-4), ["build:hero", "accepted", "runtime.close", "inspection.close"]);
});
