import assert from "node:assert/strict";
import test from "node:test";

import { renderCliError } from "@hypit/cli";
import { createPricingOutput, writeCliHelp, writeCliOutput } from "@hypit/build-operations-cli";
import { parseCommand } from "@hypit/build-operations-cli";

function capture(
  options: Parameters<typeof writeCliOutput>[1],
  presentation: Parameters<typeof writeCliOutput>[2],
): string {
  let output = "";
  writeCliOutput({ write(text) { output += text; } }, options, presentation);
  return output;
}

const human = { json: false, color: "auto", verbose: false } as const;

test("doctor makes its checked scope and explicit execution Profile selection visible", () => {
  const machine = {
    format: "hypit.cli-doctor@1" as const, ok: true, project: "/project",
    diagnosticCount: 0, diagnostics: [],
  };
  const resultsOnly = capture(human, { kind: "doctor", machine });
  assert.match(resultsOnly, /Execution Profile\s+not selected/u);
  assert.match(resultsOnly, /Scope\s+project Results only/u);
  const selected = capture(human, { kind: "doctor", machine: {
    ...machine, profile: "/project/chosen.json", profileKind: "environment" as const, profileSource: "argument",
  } });
  assert.match(selected, /command argument \(this command only\)/u);
  assert.match(selected, /Scope\s+selected Environment and project Results/u);
});

test("author check keeps the default summary compact and reserves Output types for verbose", () => {
  const presentation = {
    kind: "check-author",
    machine: {
      format: "hypit.cli-check@1",
      sourceKind: "author",
      ok: true,
      source: "/project/main.svml",
      frontend: "@hypit/markup",
      units: 2,
      assets: 1,
      modules: 1,
      outputCount: 1,
      outputs: [{ name: "story", type: "@hypit/narrative/Narrative" }],
    },
  } as const;
  const output = capture(human, presentation);
  assert.match(output, /✓ Source is valid/u);
  assert.doesNotMatch(output, /story|@hypit\/narrative/u);
  assert.doesNotMatch(output, /resource|logical-output|res_/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /story\s+@hypit\/narrative\/Narrative/u);
});

test("JSON mode writes exactly the stable command view", () => {
  const machine = {
    format: "hypit.cli-doctor@1" as const,
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

test("plan presents target requests without exposing graph Record resolution", () => {
  const presentation = {
    kind: "plan",
    machine: {
      format: "hypit.cli-plan@1",
      ok: true,
      source: "/project/main.svml",
      targetCount: 1,
      targets: ["take.video"],
      requestCount: 1,
      requestIssueCount: 0,
      producerFailureCount: 0,
      producerFailures: [],
      requests: [{ capability: "@hypit/media/inspect", readiness: "concrete", pending: [] }],
      preflight: {
        ok: true,
        capabilityCount: 1,
        capabilities: ["@hypit/media/inspect"],
        diagnosticCount: 0,
        diagnostics: [],
      },
    },
  } as const;
  const output = capture(human, presentation);
  assert.doesNotMatch(output, /← record:preview/u);
  assert.match(output, /Requests\s+1/u);
  assert.match(output, /Preflight\s+ready/u);
  assert.doesNotMatch(output, /Runtime\s+ready/u);
  assert.doesNotMatch(output, /logical:|record:|step-/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /Requests\s+1/u);
  assert.match(verbose, /\[1\] @hypit\/media\/inspect/u);
  assert.match(verbose, /Use --request <number>/u);
  assert.doesNotMatch(verbose, /take\.video\s+← record:preview/u);
});

test("plan names the Provider and price page behind each request, and points at --runtime when it cannot", () => {
  const base = {
    format: "hypit.cli-plan@1",
    ok: true,
    source: "/project/main.svml",
    targetCount: 1,
    targets: ["take.video"],
    requestCount: 2,
    requestIssueCount: 0,
    producerFailureCount: 0,
    producerFailures: [],
    requests: [
      { capability: "@hypit/seedance#seedance-2-mini", readiness: "concrete", pending: [] },
      { capability: "@example/downstream#generate", readiness: "blocked", pending: ["source"] },
    ],
  } as const;
  const without = capture(human, { kind: "plan", machine: base });
  assert.match(without, /Pass --runtime <profile>/u);
  assert.doesNotMatch(without, /Providers and price pages/u);

  const output = capture(human, { kind: "plan", machine: { ...base, providerRequestCount: 2, localRequestCount: 1, unresolvedRequestCount: 0, unsupportedRequestCount: 1, requests: [
    {
      capability: "@hypit/seedance#seedance-2-mini",
      readiness: "concrete",
      resolution: "resolved",
      support: "supported",
      endpoint: "hypihub.default",
      use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
      pending: [],
    },
    { capability: "@hypit/media#inspect", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "media.local", use: "@hypit/provider-media-local", pricing: { kind: "local" } },
    { capability: "@hypit/whisperx#whisperx-transcription", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "whisperx.remote", use: "@hypit/provider-example" },
    {
      capability: "@hypit/gpt-image#gpt-image-2",
      readiness: "concrete",
      pending: [],
      resolution: "resolved",
      support: "unsupported",
      endpoint: "hypihub.default",
      use: "@hypit/provider-hypihub",
      rejections: [{
        endpoint: "hypihub.default",
        message: "transparent background is available only at 1K; requested 2K",
      }],
    },
    {
      capability: "@example/downstream#generate",
      readiness: "blocked",
      pending: ["source"],
      resolution: "resolved",
      support: "not-evaluated",
      endpoint: "downstream.default",
      use: "@example/provider-downstream",
    },
  ] } });
  assert.match(output, /External work/u);
  assert.match(output, /@hypit\/seedance#seedance-2-mini\n\s+hypihub\.default \(@hypit\/provider-hypihub\)\s+·\s+https:\/\/hypit\.ai\/commercial\/pricing\//u);
  assert.match(output, /media\.local .*·\s+local, no Provider charge/u);
  assert.match(output, /whisperx\.remote .*·\s+price source unknown/u);
  assert.match(output, /Unsupported\s+1/u);
  assert.match(output, /gpt-image#gpt-image-2\n\s+hypihub\.default: transparent background is available only at 1K; requested 2K\s+·\s+price source unknown/u);
  assert.match(output, /×1\s+concrete/u);
  assert.match(output, /downstream\.default \(@example\/provider-downstream\)/u);
  assert.doesNotMatch(output, /Requests not yet concrete/u);
  assert.match(output, /downstream#generate[\s\S]*source produced during Build/u);
  assert.doesNotMatch(output, /Pass --runtime/u);
  assert.match(output, /seedance#/u);

  const verbose = capture({ ...human, verbose: true }, { kind: "plan", machine: { ...base, requests: [
    { capability: "@hypit/seedance#seedance-2-mini", readiness: "concrete", pending: [], resolution: "ambiguous", support: "not-evaluated", endpoints: ["hypihub.default", "images.personal"] },
  ] } });
  assert.match(verbose, /@hypit\/seedance#seedance-2-mini\n\s+hypihub\.default, images\.personal all offer it/u);
});

test("pricing presents Provider-owned material beside the corresponding Needs", () => {
  const presentation = { kind: "pricing", machine: createPricingOutput("/project/main.svml", [{
      capability: "@hypit/seedance#seedance-2", readiness: "concrete", pending: [], resolution: "resolved",
      support: "supported",
      endpoint: "hypihub.default", use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
      pricingDocuments: [{
        source: "https://hypit.ai/v1/pricing?model=seedance-2",
        data: { model: "seedance-2", pricing: { mode: "per_second", per_second_usd: 0.1045 } },
      }],
    }, {
      capability: "@hypit/gpt-image#gpt-image-2", readiness: "concrete", pending: [], resolution: "resolved",
      support: "supported",
      endpoint: "images.personal", use: "@studio/provider-images",
      pricing: { kind: "page", url: "https://images.example/pricing" },
    }, {
      capability: "@example/downstream#generate", readiness: "blocked", pending: ["source"], resolution: "resolved",
      support: "not-evaluated", endpoint: "downstream.default", use: "@example/provider-downstream",
      pricing: { kind: "page", url: "https://downstream.example/pricing" },
    }]),
  } as const;
  const output = capture(human, presentation);
  assert.match(output, /Provider pricing information/u);
  assert.match(output, /https:\/\/hypit\.ai\/v1\/pricing\?model=seedance-2/u);
  assert.match(output, /"per_second_usd": 0\.1045/u);
  assert.match(output, /Requests\s+1/u);
  assert.match(output, /Pricing page\s+https:\/\/images\.example\/pricing/u);
  assert.match(output, /Request-sensitive pricing deferred until the request is concrete/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /"per_second_usd": 0\.1045/u);
});

test("numeric options accept unsigned decimal integer spelling only", () => {
  assert.equal((parseCommand(["status", "bld_example", "--watch", "--max-wait-ms", "0"]) as { maxWaitMs: number }).maxWaitMs, 0);
  assert.throws(() => parseCommand(["status", "bld_example", "--limit", "1"]), /--limit does not apply to status/u);
  assert.equal((parseCommand(["builds", "--limit", "12"]) as { limit: number }).limit, 12);
  assert.equal((parseCommand(["plan", "main.svml", "--request", "3"]) as { request: number }).request, 3);
  assert.throws(() => parseCommand(["pricing", "main.svml", "--request", "1"]), /--request does not apply to pricing/u);
  for (const value of ["", " ", "0x10", "0b11", "1e3", "-1", "1.5", "9007199254740992"]) {
    assert.throws(
      () => parseCommand(["status", "bld_example", "--watch", "--max-wait-ms", value]),
      /--max-wait-ms must be a non-negative safe integer/u,
      JSON.stringify(value),
    );
  }
  for (const value of ["", "0x10", "0b11", "0"]) {
    assert.throws(
      () => parseCommand(["builds", "--limit", value]),
      /--limit requires a positive integer/u,
      JSON.stringify(value),
    );
  }
});

test("a focused plan request is the only plan view that exposes complete constraints", () => {
  const machine = {
    format: "hypit.cli-plan-request@1" as const,
    source: "/project/main.svml",
    ordinal: 2,
    requestCount: 4,
    capability: "example.image#generate",
    returns: "example.image#ImageSet",
    readiness: "concrete" as const,
    resolution: "resolved" as const,
    support: "supported" as const,
    endpoint: "images.default",
    pricing: { kind: "page" as const, url: "https://images.example/pricing" },
    pending: [],
    constraints: { fields: { prompt: ["A red paper bird"], count: [1] } },
  };
  const output = capture(human, { kind: "plan-request", machine });
  assert.match(output, /Plan request 2 of 4/u);
  assert.match(output, /A red paper bird/u);
  assert.match(output, /resource identities/u);
  assert.deepEqual(JSON.parse(capture({ ...human, json: true }, { kind: "plan-request", machine })), machine);
});

test("help is concise and describes stable rather than complete output", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } });
  assert.match(output, /^Hypit\n/u);
  assert.match(output, /Installation/u);
  assert.match(output, /stable machine view/u);
  assert.doesNotMatch(output, /programs prepare\|up\|status\|down/u);
  assert.doesNotMatch(output, /Typical flow|complete machine-readable|image --prompt/u);
});

test("human errors expose stable codes while JSON errors stay parseable", () => {
  const error = Object.assign(new Error("credential is absent"), { code: "ENVIRONMENT_CREDENTIAL_MISSING" });
  assert.match(renderCliError(error, { json: false, color: false, unicode: true, debug: false }),
    /ENVIRONMENT_CREDENTIAL_MISSING/u);
  const machine = JSON.parse(renderCliError(error, {
    json: true, color: true, unicode: true, debug: false,
  })) as { readonly error: { readonly code: string } };
  assert.equal(machine.error.code, "ENVIRONMENT_CREDENTIAL_MISSING");
});

test("Result help makes exact Output addressing explicit", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } }, "result");
  assert.match(output, /--output <name> --to <path>/u);
  assert.match(output, /Type-owning package/u);
});

test("argument errors give command help in text and JSON without suggesting a stack trace", () => {
  for (const [args, help] of [
    [["plan"], "hypit help plan"],
    [["status", "a-build", "--typo"], "hypit help status"],
    [["plna"], "hypit help"],
  ] as const) {
    let failure: unknown;
    try { parseCommand(args); } catch (error) { failure = error; }
    assert.ok(failure instanceof Error);
    const text = renderCliError(failure, { json: false, color: false, unicode: false, debug: false });
    assert.ok(text.includes(help));
    assert.doesNotMatch(text, /--debug|stack trace/u);
    const json = JSON.parse(renderCliError(failure, { json: true, color: false, unicode: false, debug: false }));
    assert.equal(json.error.code, "CLI_USAGE");
    assert.equal(json.error.help, help);
  }
});

test("an unknown help topic reports the typo without dumping unrelated commands", () => {
  let output = "";
  assert.throws(() => writeCliHelp({ write(text) { output += text; } }, "plna"), /Unknown help topic "plna"/u);
  assert.equal(output, "");
});
