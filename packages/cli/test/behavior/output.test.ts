import assert from "node:assert/strict";
import test from "node:test";

import { createPlanOutput, createPricingOutput, renderCliError, writeCliHelp, writeCliOutput } from "../../src/output.js";
import type { PlanRequest, PricingRequest } from "../../src/output.js";
import { parseCommand } from "../../src/arguments.js";

function capture(
  options: Parameters<typeof writeCliOutput>[1],
  presentation: Parameters<typeof writeCliOutput>[2],
): string {
  let output = "";
  writeCliOutput({ write(text) { output += text; } }, options, presentation);
  return output;
}

const human = { json: false, color: "auto", verbose: false } as const;

test("doctor makes its checked scope and explicit Runtime selection visible", () => {
  const machine = {
    format: "hypit.cli-doctor@1" as const, ok: true, project: "/project",
    diagnosticCount: 0, diagnostics: [],
  };
  const resultsOnly = capture(human, { kind: "doctor", machine });
  assert.match(resultsOnly, /Runtime Profile\s+not selected/u);
  assert.match(resultsOnly, /Scope\s+project Results only/u);
  const selected = capture(human, { kind: "doctor", machine: {
    ...machine, profile: "/project/chosen.json", profileSource: "argument",
  } });
  assert.match(selected, /command argument \(this command only\)/u);
  assert.match(selected, /Scope\s+selected Runtime and project Results/u);
});

test("author check keeps the default summary compact and reserves Output types for verbose", () => {
  const presentation = {
    kind: "check-author",
    machine: {
      format: "hypit.cli-check@1",
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
      requests: [{ capability: "@hypit/media@1/inspect", readiness: "concrete", pending: [] }],
      preflight: {
        ok: true,
        capabilityCount: 1,
        capabilities: ["@hypit/media@1/inspect"],
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
      { capability: "@hypit/seedance@1#seedance-2-mini", readiness: "concrete", pending: [] },
      { capability: "@example/downstream@1#generate", readiness: "blocked", pending: ["source"] },
    ],
  } as const;
  const without = capture(human, { kind: "plan", machine: base });
  assert.match(without, /Pass --runtime <profile>/u);
  assert.doesNotMatch(without, /Providers and price pages/u);

  const output = capture(human, { kind: "plan", machine: { ...base, providerRequestCount: 2, localRequestCount: 1, unresolvedRequestCount: 0, unsupportedRequestCount: 1, requests: [
    {
      capability: "@hypit/seedance@1#seedance-2-mini",
      readiness: "concrete",
      resolution: "resolved",
      support: "supported",
      endpoint: "hypihub.default",
      use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
      summary: [{ at: ["prompt"], value: "A concise scene" }, { at: ["duration"], value: 10 }, { at: ["resolution"], value: "720p" }],
      pending: [],
    },
    { capability: "@hypit/media@1#inspect", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "media.local", use: "@hypit/media-local", pricing: { kind: "local" } },
    { capability: "@hypit/whisperx@1#whisperx-transcription", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "whisperx.remote", use: "@hypit/provider-example" },
    {
      capability: "@hypit/gpt-image@1#gpt-image-2",
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
      capability: "@example/downstream@1#generate",
      readiness: "blocked",
      pending: ["source"],
      resolution: "resolved",
      support: "not-evaluated",
      endpoint: "downstream.default",
      use: "@example/provider-downstream",
    },
  ] } });
  assert.match(output, /Providers and price pages/u);
  assert.match(output, /@hypit\/seedance@1#seedance-2-mini\n\s+hypihub\.default \(@hypit\/provider-hypihub\)\s+·\s+https:\/\/hypit\.ai\/commercial\/pricing\//u);
  assert.match(output, /media\.local .*·\s+local, no Provider charge/u);
  assert.match(output, /whisperx\.remote .*·\s+price source unknown/u);
  assert.match(output, /Unsupported\s+1/u);
  assert.match(output, /gpt-image@1#gpt-image-2\n\s+hypihub\.default: transparent background is available only at 1K; requested 2K\s+·\s+price source unknown/u);
  assert.match(output, /prompt A concise scene · duration 10 · resolution 720p/u);
  assert.match(output, /downstream\.default \(@example\/provider-downstream\)/u);
  assert.doesNotMatch(output, /Requests not yet concrete/u);
  assert.match(output, /downstream@1#generate[\s\S]*input produced during Build/u);
  assert.doesNotMatch(output, /Pass --runtime/u);
  assert.match(output, /seedance@1#/u);

  const verbose = capture({ ...human, verbose: true }, { kind: "plan", machine: { ...base, requests: [
    { capability: "@hypit/seedance@1#seedance-2-mini", readiness: "concrete", pending: [], resolution: "ambiguous", support: "not-evaluated", endpoints: ["hypihub.default", "images.personal"] },
  ] } });
  assert.match(verbose, /@hypit\/seedance@1#seedance-2-mini\n\s+hypihub\.default, images\.personal all offer it/u);
});

test("pricing presents Provider-owned material beside the corresponding Needs", () => {
  const presentation = { kind: "pricing", machine: createPricingOutput("/project/main.svml", [{
      capability: "@hypit/seedance@1#seedance-2", readiness: "concrete", pending: [], resolution: "resolved",
      support: "supported",
      endpoint: "hypihub.default", use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
      summary: [{ at: ["duration"], value: 5 }, { at: ["resolution"], value: "720p" }],
      pricingDocuments: [{
        source: "https://hypit.ai/v1/pricing?model=seedance-2",
        data: { model: "seedance-2", pricing: { mode: "per_second", per_second_usd: 0.1045 } },
      }],
    }, {
      capability: "@hypit/gpt-image@1#gpt-image-2", readiness: "concrete", pending: [], resolution: "resolved",
      support: "supported",
      endpoint: "images.personal", use: "@studio/provider-images",
      pricing: { kind: "page", url: "https://images.example/pricing" },
    }, {
      capability: "@example/downstream@1#generate", readiness: "blocked", pending: ["source"], resolution: "resolved",
      support: "not-evaluated", endpoint: "downstream.default", use: "@example/provider-downstream",
      pricing: { kind: "page", url: "https://downstream.example/pricing" },
    }]),
  } as const;
  const output = capture(human, presentation);
  assert.match(output, /Provider pricing information/u);
  assert.match(output, /https:\/\/hypit\.ai\/v1\/pricing\?model=seedance-2/u);
  assert.match(output, /"per_second_usd": 0\.1045/u);
  assert.match(output, /duration 5 · resolution 720p/u);
  assert.match(output, /Pricing page\s+https:\/\/images\.example\/pricing/u);
  assert.match(output, /Request-sensitive pricing deferred until the request is concrete/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /"per_second_usd": 0\.1045/u);
});

test("pricing preserves every Producer failure alongside rates regardless of the group limit", () => {
  const failures = [
    "Timeline end must be after its start",
    "Frame width must be positive",
  ];
  const machine = createPricingOutput("main.svml", [{
    capability: "example.video@1#create", readiness: "concrete", pending: [], resolution: "resolved",
    support: "supported",
    endpoint: "vendor", pricing: { kind: "page", url: "https://vendor.example/pricing" },
  }, {
    capability: "example.image@1#create", readiness: "concrete", pending: [], resolution: "unresolved",
    support: "not-evaluated",
  }], false, failures);
  const presentation = { kind: "pricing", machine, limit: 1 } as const;
  const output = capture(human, presentation);
  assert.match(output, /Producer failures\s+2/u);
  for (const failure of failures) assert.ok(output.includes(failure));
  assert.match(output, /1 more groups/u);
  const json = JSON.parse(capture({ ...human, json: true }, presentation));
  assert.equal(json.producerFailureCount, 2);
  assert.deepEqual(json.producerFailures, failures);
  assert.equal(json.groups.length, 2);

  const clean = createPricingOutput("main.svml", []);
  assert.equal(clean.producerFailureCount, 0);
  assert.deepEqual(clean.producerFailures, []);
  assert.doesNotMatch(capture(human, { kind: "pricing", machine: clean }), /Producer failures/u);
});

test("pricing summarizes 24 no-charge requests and retains all 15 priced requests with shared rate documents", () => {
  const requests: PricingRequest[] = [];
  const add = (count: number, capability: string,
    metadata: Omit<PricingRequest, "capability" | "readiness" | "pending" | "summary">) => {
    for (let index = 0; index < count; index++) {
      requests.push({ capability, readiness: "concrete", pending: [],
        summary: [{ at: ["quantity"], value: index + 1 }], ...metadata });
    }
  };
  add(24, "example.processing@1#prepare", {
    resolution: "resolved", support: "supported", endpoint: "processing", pricing: { kind: "local" },
  });
  for (const [count, capability] of [[7, "example.work@1#create"], [7, "example.work@1#align"], [1, "example.work@1#draw"]] as const) {
    add(count, capability, {
      resolution: "resolved", support: "supported", endpoint: "vendor", pricing: { kind: "page", url: "https://vendor.example/prices" },
      pricingDocuments: [{ source: `https://vendor.example/prices/${capability}`, data: { creditsPerUnit: 3 } }],
    });
  }
  const machine = createPricingOutput("main.svml", requests);
  assert.equal(machine.requestCount, 39);
  assert.equal(machine.noChargeRequestCount, 24);
  assert.deepEqual(machine.groups.map((group) => group.requests.length), [7, 7, 1]);
  assert.deepEqual(machine.groups.flatMap((group) => group.requests).map((request) => request.summary?.[0]?.value),
    Array.from({ length: 15 }, (_, index) => index < 7 ? index + 1 : index < 14 ? index - 6 : 1));
  const output = capture(human, { kind: "pricing", machine });
  assert.doesNotMatch(output, /example.processing/u);
  assert.equal(output.match(/"creditsPerUnit": 3/gu)?.length, 3);
  assert.match(output, /quantity 7/u);
  assert.match(output, /example.work@1#draw/u);
  const detailed = createPricingOutput("main.svml", requests, true);
  assert.equal(detailed.groups.flatMap((group) => group.requests).length, 39);
});

test("pricing retains unknown and rejected requests and distinguishes Endpoint-specific rate material", () => {
  const requests: PricingRequest[] = [
    { capability: "example.local@1#free", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "free.local" },
    { capability: "example.local@1#free", readiness: "concrete", pending: [], resolution: "resolved", support: "unsupported", pricing: { kind: "local" },
      rejections: [{ endpoint: "free.local", message: "unsupported parameter" }] },
    { capability: "example@1#create", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "vendor",
      pricing: { kind: "page", url: "https://vendor.example/prices" }, pricingError: "pricing service unavailable" },
    ...["account-a", "account-b"].flatMap((endpoint) => [1, 2].map((tier) => ({
      capability: "example@1#create", readiness: "concrete" as const, pending: [], resolution: "resolved" as const, support: "supported" as const, endpoint,
      pricingDocuments: [{ source: "https://vendor.example/prices", data: { tier, amount: tier * 2 } }],
    }))),
  ];
  const machine = createPricingOutput("main.svml", requests);
  assert.equal(machine.noChargeRequestCount, 0);
  assert.equal(machine.groups.length, 7);
  const presentation = { kind: "pricing", machine } as const;
  const output = capture(human, presentation);
  assert.match(output, /Pricing unknown/u);
  assert.match(output, /unsupported parameter/u);
  assert.match(output, /pricing service unavailable/u);
  assert.match(output, /Pricing page\s+https:\/\/vendor.example\/prices/u);
  const limited = { ...presentation, limit: 1 };
  assert.match(capture(human, limited), /6 more groups/u);
  const json = JSON.parse(capture({ ...human, json: true }, limited));
  assert.deepEqual(json, machine);
  const firstJsonRequest = json.groups.at(0)?.requests.at(0);
  assert.ok(firstJsonRequest);
  assert.equal("need" in firstJsonRequest, false);
  assert.equal("step" in firstJsonRequest, false);
  assert.equal("record" in firstJsonRequest, false);
  const command = parseCommand(["pricing", "main.svml"]);
  assert.equal(command.command, "pricing");
  assert.equal("limit" in command, false);
  assert.equal((parseCommand(["pricing", "main.svml", "--limit", "1"]) as { limit: number }).limit, 1);
});

test("numeric options accept unsigned decimal integer spelling only", () => {
  assert.equal((parseCommand(["status", "bld_example", "--watch", "--max-wait-ms", "0"]) as { maxWaitMs: number }).maxWaitMs, 0);
  assert.throws(() => parseCommand(["status", "bld_example", "--limit", "1"]), /--limit does not apply to status/u);
  assert.equal((parseCommand(["builds", "--limit", "12"]) as { limit: number }).limit, 12);
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

test("Provider summaries keep raw pricing available and shared parameters preserve differing combinations", () => {
  const requests = ["first", "second", "third"].map((_name, index): PricingRequest => ({
    capability: "example@1#generate", readiness: "concrete", pending: [], resolution: "resolved", support: "supported", endpoint: "vendor",
    pricingDocuments: [{ source: "https://vendor.example/prices", summary: "Gold: 2 credits per unit",
      data: { actualRate: 2, marketingComparison: 99 } }],
    summary: [{ at: ["mode"], value: "gold" }, { at: ["duration"], value: index === 0 ? 5 : 10 },
      { at: ["size"], value: index === 2 ? "large" : "small" }],
  }));
  const machine = createPricingOutput("main.svml", requests);
  const presentation = { kind: "pricing", machine } as const;
  const output = capture(human, presentation);
  assert.equal(output.match(/mode gold/gu)?.length, 1);
  assert.match(output, /duration 5 · size small/u);
  assert.match(output, /duration 10 · size small/u);
  assert.match(output, /duration 10 · size large/u);
  assert.match(output, /Gold: 2 credits per unit/u);
  assert.doesNotMatch(output, /marketingComparison/u);
  assert.match(capture({ ...human, verbose: true }, presentation), /"marketingComparison": 99/u);
  assert.equal(JSON.parse(capture({ ...human, json: true }, presentation)).groups[0].pricingDocuments[0].data.marketingComparison, 99);
});

test("plan scope omits unused branches while retaining every demanded request and diagnostic", () => {
  const requests = Array.from({ length: 61 }, (_, index): PlanRequest => ({
    capability: "example@1#render", readiness: "concrete", pending: [],
    resolution: "resolved", support: "supported", endpoint: "local",
    ...(index === 60 ? { issue: "missing source" } : {}),
  }));
  const plan = {
    format: "hypit.cli-plan@1" as const, ok: false, source: "main.svml", targetCount: 2,
    targets: ["final.video", "poster.image"], requestCount: requests.length, requestIssueCount: 1,
    producerFailureCount: 1,
    producerFailures: ["Timeline end must be after its start"],
    requests,
    preflight: { ok: false, capabilityCount: 2, capabilities: ["a", "b"], diagnosticCount: 2,
      diagnostics: [{ severity: "warning" as const, code: "WARNING", message: "first" },
        { severity: "error" as const, code: "REQUIRED", message: "last required error" }] },
  };
  const machine = createPlanOutput(plan, { verbose: false, limit: 1 });
  const parsed = JSON.parse(capture({ ...human, json: true }, { kind: "plan", machine }));
  assert.equal("outputs" in parsed, false);
  assert.equal("steps" in parsed, false);
  assert.equal(parsed.requests.length, 61);
  assert.equal("need" in parsed.requests[0], false);
  assert.equal("step" in parsed.requests[0], false);
  assert.equal("record" in parsed.requests[0], false);
  assert.deepEqual(parsed.targets, plan.targets);
  assert.deepEqual(parsed.preflight.diagnostics, plan.preflight.diagnostics);
  const rendered = capture(human, { kind: "plan", machine });
  assert.match(rendered, /missing source/u);
  assert.match(rendered, /Timeline end must be after its start/u);
  assert.match(rendered, /last required error/u);
  assert.doesNotMatch(rendered, /output-\d/u);
  assert.match(rendered, /request summary unavailable/u);
  assert.doesNotMatch(rendered, /no parameters/u);

  const detailed = createPlanOutput(plan, { verbose: true, limit: 1 });
  assert.equal(detailed.requests.length, 61);
  assert.deepEqual(detailed.preflight?.diagnostics, plan.preflight.diagnostics);
});

test("help is concise and describes stable rather than complete output", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } });
  assert.match(output, /^Hypit\n/u);
  assert.match(output, /Results/u);
  assert.match(output, /stable machine view/u);
  assert.doesNotMatch(output, /programs prepare\|up\|status\|down/u);
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
