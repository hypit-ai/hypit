import assert from "node:assert/strict";
import test from "node:test";

import { renderCliError, writeCliHelp, writeCliOutput } from "../src/output.js";

function capture(
  options: Parameters<typeof writeCliOutput>[1],
  presentation: Parameters<typeof writeCliOutput>[2],
): string {
  let output = "";
  writeCliOutput({ write(text) { output += text; } }, options, presentation);
  return output;
}

const human = { json: false, color: "auto", verbose: false } as const;

test("author check exposes author-facing Outputs, not graph or resource identities", () => {
  const output = capture(human, {
    kind: "check-author",
    machine: {
      format: "hypit.cli-check@2",
      sourceKind: "author",
      ok: true,
      source: "/project/main.svml",
      frontend: "@hypit/markup@1",
      units: 2,
      assets: 1,
      modules: 1,
      outputCount: 1,
      outputs: [{ name: "story", type: "@hypit/narrative@1/Narrative" }],
    },
  });
  assert.match(output, /✓ Source is valid/u);
  assert.match(output, /story\s+@hypit\/narrative@1\/Narrative/u);
  assert.doesNotMatch(output, /resource|logical-output|res_/u);
});

test("JSON mode writes exactly the stable command view", () => {
  const machine = {
    format: "hypit.cli-doctor@2" as const,
    ok: false,
    profile: "/project/hypit.runtime.ts",
    diagnosticCount: 1,
    diagnostics: [{ severity: "error" as const, code: "MISSING", message: "not found" }],
  };
  const output = capture({ json: true, color: "always", verbose: true }, { kind: "doctor", machine });
  assert.deepEqual(JSON.parse(output), machine);
  assert.doesNotMatch(output, /Hypit Doctor|\u001b\[/u);
});

test("plan presents named choices and bounded external request summaries", () => {
  const output = capture(human, {
    kind: "plan",
    machine: {
      format: "hypit.cli-plan@2",
      ok: true,
      run: "/project/build.svrun",
      targetCount: 1,
      targets: ["take.video"],
      steps: 2,
      externalRequestCount: 1,
      externalRequests: [{ operation: "@hypit/media@1/inspect", count: 1 }],
      choiceCount: 1,
      choices: [{ output: "take.video", candidate: "preview" }],
    },
  });
  assert.match(output, /take\.video\s+← preview/u);
  assert.match(output, /1\s+@hypit\/media@1\/inspect/u);
  assert.doesNotMatch(output, /logical:|record:|step-/u);
});

test("help is concise and describes stable rather than complete output", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } });
  assert.match(output, /^Hypit\n/u);
  assert.match(output, /Results/u);
  assert.match(output, /stable machine view/u);
  assert.doesNotMatch(output, /Typical flow|complete machine-readable|image --prompt/u);
});

test("human errors expose stable codes while JSON errors stay parseable", () => {
  const error = Object.assign(new Error("credential is absent"), { code: "RUNTIME_CREDENTIAL_MISSING" });
  assert.match(renderCliError(error, { json: false, color: false, unicode: true, debug: false }),
    /RUNTIME_CREDENTIAL_MISSING/u);
  const machine = JSON.parse(renderCliError(error, {
    json: true, color: true, unicode: true, debug: false,
  })) as { readonly error: { readonly code: string } };
  assert.equal(machine.error.code, "RUNTIME_CREDENTIAL_MISSING");
});

test("Result help makes exact Output addressing explicit", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } }, "get");
  assert.match(output, /--output <name> --to <path>/u);
  assert.match(output, /Composite Output becomes a directory/u);
});
