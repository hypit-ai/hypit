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

test("author check keeps the default summary compact and reserves Output types for verbose", () => {
  const presentation = {
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
  } as const;
  const output = capture(human, presentation);
  assert.match(output, /✓ Source is valid/u);
  assert.doesNotMatch(output, /story|@hypit\/narrative/u);
  assert.doesNotMatch(output, /resource|logical-output|res_/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /story\s+@hypit\/narrative@1\/Narrative/u);
});

test("JSON mode writes exactly the stable command view", () => {
  const machine = {
    format: "hypit.cli-doctor@3" as const,
    ok: false,
    project: "/project",
    profile: "/project/hypit.runtime.ts",
    diagnosticCount: 1,
    diagnostics: [{ severity: "error" as const, code: "MISSING", message: "not found" }],
  };
  const output = capture({ json: true, color: "always", verbose: true }, { kind: "doctor", machine });
  assert.deepEqual(JSON.parse(output), machine);
  assert.doesNotMatch(output, /Hypit Doctor|\u001b\[/u);
});

test("plan presents useful choices and readable requests without default graph internals", () => {
  const presentation = {
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
      preflight: {
        ok: true,
        capabilityCount: 1,
        capabilities: ["@hypit/media@1/inspect"],
        diagnosticCount: 0,
        diagnostics: [],
      },
      choiceCount: 1,
      choices: [{ output: "take.video", candidate: "preview" }],
      unreached: [{ output: "unused.image", operation: "@hypit/gpt-image@1/request-gpt-image-2" }],
    },
  } as const;
  const output = capture(human, presentation);
  assert.match(output, /take\.video\s+← preview/u);
  assert.match(output, /1\s+inspect/u);
  assert.match(output, /Preflight\s+ready/u);
  assert.doesNotMatch(output, /Runtime\s+ready/u);
  assert.doesNotMatch(output, /@hypit\/media|unused\.image|Declared but not reached|logical:|record:|step-/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /1\s+@hypit\/media@1\/inspect/u);
  assert.match(verbose, /unused\.image/u);
});

test("plan names the Provider and price page behind each request, and points at --runtime when it cannot", () => {
  const base = {
    format: "hypit.cli-plan@2",
    ok: true,
    run: "/project/build.svrun",
    targetCount: 1,
    targets: ["take.video"],
    steps: 3,
    externalRequestCount: 2,
    externalRequests: [{ operation: "@hypit/seedance@1/request-seedance-2-mini", count: 2 }],
    choiceCount: 0,
    choices: [],
  } as const;
  const without = capture(human, { kind: "plan", machine: base });
  assert.match(without, /Pass --runtime <profile>/u);
  assert.doesNotMatch(without, /Providers and price pages/u);

  const output = capture(human, { kind: "plan", machine: { ...base, providers: [
    {
      capability: "@hypit/seedance@1#seedance-2-mini",
      status: "resolved",
      endpoint: "hypihub.default",
      use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
    },
    { capability: "@hypit/media@1#inspect", status: "resolved", endpoint: "media.local", use: "@hypit/provider-media-local", pricing: { kind: "local" } },
    { capability: "@hypit/whisperx@1#whisperx-alignment", status: "resolved", endpoint: "whisperx.remote", use: "@hypit/provider-example" },
    { capability: "@hypit/gpt-image@1#gpt-image-2", status: "unresolved" },
  ] } });
  assert.match(output, /Providers and price pages/u);
  assert.match(output, /@hypit\/seedance#seedance-2-mini\n\s+hypihub\.default \(@hypit\/provider-hypihub\)\s+·\s+https:\/\/hypit\.ai\/commercial\/pricing\//u);
  assert.match(output, /media\.local .*·\s+local, no Provider charge/u);
  assert.match(output, /whisperx\.remote .*·\s+price source unknown/u);
  assert.match(output, /gpt-image#gpt-image-2\n\s+no selected Endpoint\n/u);
  assert.doesNotMatch(output, /Pass --runtime/u);
  assert.doesNotMatch(output, /seedance@1#/u);

  const verbose = capture({ ...human, verbose: true }, { kind: "plan", machine: { ...base, providers: [
    { capability: "@hypit/seedance@1#seedance-2-mini", status: "ambiguous", endpoints: ["hypihub.default", "kie.default"] },
  ] } });
  assert.match(verbose, /@hypit\/seedance@1#seedance-2-mini\n\s+several selected Endpoints: hypihub\.default, kie\.default/u);
});

test("run check treats historical reuse as a normal summary", () => {
  const output = capture(human, {
    kind: "check-run",
    machine: {
      format: "hypit.cli-check@2",
      sourceKind: "run",
      ok: true,
      run: "/project/build.svrun",
      author: "/project/main.svml",
      frontend: "@hypit/run-markup@1",
      targetCount: 1,
      targets: ["final.video"],
      candidates: 1,
      satisfactions: 1,
      unresolvedHistoricalOutputs: [{ candidate: "previous", build: "bld_previous", output: "take.video" }],
    },
  });
  assert.match(output, /Targets\s+final\.video/u);
  assert.match(output, /Reuse\s+1 historical Output/u);
  assert.doesNotMatch(output, /unresolved|bld_previous|Candidate/u);
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
