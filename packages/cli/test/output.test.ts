import assert from "node:assert/strict";
import test from "node:test";

import { createPlanOutput, createPricingOutput, renderCliError, writeCliHelp, writeCliOutput } from "../src/output.js";
import type { PlanNeed, PricingEntry } from "../src/output.js";
import { parseCommand } from "../src/arguments.js";

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
  assert.match(selected, /command argument \(this invocation only\)/u);
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

test("plan presents useful choices and readable requests without default graph internals", () => {
  const presentation = {
    kind: "plan",
    machine: {
      format: "hypit.cli-plan@1",
      ok: true,
      run: "/project/build.svrun",
      targetCount: 1,
      targets: ["take.video"],
      steps: 2,
      requestCount: 1,
      requestIssueCount: 0,
      producerFailureCount: 0,
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
  assert.match(output, /Run choices\s+1/u);
  assert.doesNotMatch(output, /← preview/u);
  assert.match(output, /Requests\s+1/u);
  assert.match(output, /Preflight\s+ready/u);
  assert.doesNotMatch(output, /Runtime\s+ready/u);
  assert.doesNotMatch(output, /@hypit\/media|unused\.image|Declared but not reached|logical:|record:|step-/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /Requests\s+1/u);
  assert.match(verbose, /unused\.image/u);
  assert.match(verbose, /take\.video\s+← preview/u);
});

test("plan does not call a plan valid when a Producer failed outside every request", () => {
  const machine = {
    format: "hypit.cli-plan@1" as const,
    ok: false,
    run: "build.svrun",
    targetCount: 1,
    targets: ["final.video"],
    steps: 6,
    requestCount: 3,
    requestIssueCount: 0,
    producerFailureCount: 1,
    producerFailures: [{
      step: "assemble-timeline",
      message: "Timeline duration 8s must land on an exact frame boundary.",
    }],
    choiceCount: 0,
    choices: [],
  };

  const rendered = capture(human, { kind: "plan", machine });
  assert.match(rendered, /Build plan needs attention/u);
  assert.match(rendered, /Producer failures\s+1/u);
  assert.match(rendered, /assemble-timeline: Timeline duration 8s must land on an exact frame boundary\./u);
  assert.deepEqual(createPlanOutput(machine, { verbose: false, limit: 1 }).producerFailures, machine.producerFailures);

  const parsed = JSON.parse(capture({ ...human, json: true }, { kind: "plan", machine }));
  assert.equal(parsed.producerFailureCount, 1);
  assert.deepEqual(parsed.producerFailures, machine.producerFailures);
});

test("plan names the Provider and price page behind each request, and points at --runtime when it cannot", () => {
  const base = {
    format: "hypit.cli-plan@1",
    ok: true,
    run: "/project/build.svrun",
    targetCount: 1,
    targets: ["take.video"],
    steps: 3,
    requestCount: 2,
    requestIssueCount: 0,
    producerFailureCount: 0,
    choiceCount: 0,
    choices: [],
  } as const;
  const without = capture(human, { kind: "plan", machine: base });
  assert.match(without, /Pass --runtime <profile>/u);
  assert.doesNotMatch(without, /Providers and price pages/u);

  const output = capture(human, { kind: "plan", machine: { ...base, providerRequestCount: 2, localRequestCount: 1, unresolvedRequestCount: 0, unsupportedRequestCount: 1, providers: [
    {
      request: "seedance:one",
      capability: "@hypit/seedance@1#seedance-2-mini",
      status: "resolved",
      endpoint: "hypihub.default",
      use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
    },
    { request: "media:one", capability: "@hypit/media@1#inspect", status: "resolved", endpoint: "media.local", use: "@hypit/provider-media-local", pricing: { kind: "local" } },
    { request: "whisper:one", capability: "@hypit/whisperx@1#whisperx-alignment", status: "resolved", endpoint: "whisperx.remote", use: "@hypit/provider-example" },
    {
      request: "image:one",
      capability: "@hypit/gpt-image@1#gpt-image-2",
      status: "unsupported",
      endpoint: "hypihub.default",
      use: "@hypit/provider-hypihub",
      rejections: [{
        endpoint: "hypihub.default",
        message: "transparent background is available only at 1K; requested 2K",
      }],
    },
  ], needs: [{
    request: "seedance:one",
    step: "video::component::presenter.generate",
    port: "request",
    capability: "@hypit/seedance@1#seedance-2-mini",
    summary: { fields: { prompt: "42 chars", duration: 10, resolution: "720p" }, references: { image: 1 } },
    pending: [{ input: "referenceImages", record: "presenter:image", sourceStep: "presenter.generate", kind: "image" }],
  }] } });
  assert.match(output, /Providers and price pages/u);
  assert.match(output, /@hypit\/seedance#seedance-2-mini\n\s+hypihub\.default \(@hypit\/provider-hypihub\)\s+·\s+https:\/\/hypit\.ai\/commercial\/pricing\//u);
  assert.match(output, /media\.local .*·\s+local, no Provider charge/u);
  assert.match(output, /whisperx\.remote .*·\s+price source unknown/u);
  assert.match(output, /Unsupported\s+1/u);
  assert.match(output, /gpt-image#gpt-image-2\n\s+hypihub\.default: transparent background is available only at 1K; requested 2K\n/u);
  assert.match(output, /prompt 42 chars · duration 10 · resolution 720p · 1 image reference · input produced during Build/u);
  assert.doesNotMatch(output, /Pass --runtime/u);
  assert.doesNotMatch(output, /seedance@1#/u);

  const verbose = capture({ ...human, verbose: true }, { kind: "plan", machine: { ...base, providers: [
    { request: "seedance:one", capability: "@hypit/seedance@1#seedance-2-mini", status: "ambiguous", endpoints: ["hypihub.default", "images.personal"] },
  ] } });
  assert.match(verbose, /@hypit\/seedance@1#seedance-2-mini\n\s+hypihub\.default, images\.personal all offer it/u);
});

test("pricing presents Provider-owned material beside the corresponding Needs", () => {
  const presentation = { kind: "pricing", machine: createPricingOutput("/project/build.svrun", [{
      request: "seedance:one", capability: "@hypit/seedance@1#seedance-2", status: "resolved",
      endpoint: "hypihub.default", use: "@hypit/provider-hypihub",
      pricing: { kind: "page", url: "https://hypit.ai/commercial/pricing/" },
      pricingDocuments: [{
        source: "https://hypit.ai/v1/pricing?model=seedance-2",
        data: { model: "seedance-2", pricing: { mode: "per_second", per_second_usd: 0.1045 } },
      }],
    }, {
      request: "image:one", capability: "@hypit/gpt-image@1#gpt-image-2", status: "resolved",
      endpoint: "images.personal", use: "@studio/provider-images",
      pricing: { kind: "page", url: "https://images.example/pricing" },
    }], [{
      request: "seedance:one", step: "video::component::presenter.generate", port: "generation",
      capability: "@hypit/seedance@1#seedance-2", endpoint: "hypihub.default",
      summary: { fields: { duration: 5, resolution: "720p" }, references: {} }, pending: [],
    }, {
      request: "image:one", step: "video::component::portrait.generate", port: "generation",
      capability: "@hypit/gpt-image@1#gpt-image-2", endpoint: "images.personal", pending: [],
    }]),
  } as const;
  const output = capture(human, presentation);
  assert.match(output, /Provider pricing information/u);
  assert.match(output, /https:\/\/hypit\.ai\/v1\/pricing\?model=seedance-2/u);
  assert.match(output, /"per_second_usd": 0\.1045/u);
  assert.match(output, /duration 5 · resolution 720p/u);
  assert.match(output, /Pricing page\s+https:\/\/images\.example\/pricing/u);

  const verbose = capture({ ...human, verbose: true }, presentation);
  assert.match(verbose, /"per_second_usd": 0\.1045/u);
});

test("pricing summarizes 24 no-charge requests and retains all 15 priced requests with shared rate documents", () => {
  const entries: PricingEntry[] = [];
  const needs: PlanNeed[] = [];
  const add = (count: number, capability: string, metadata: Omit<PricingEntry, "request" | "capability">) => {
    for (let index = 0; index < count; index++) {
      const request = `${capability}:${index}`;
      entries.push({ request, capability, ...metadata });
      needs.push({ request, capability, step: request, port: "result", pending: [],
        summary: { fields: { quantity: index + 1 }, references: {} } });
    }
  };
  add(24, "example.processing@1#prepare", {
    status: "resolved", endpoint: "processing", pricing: { kind: "local" },
  });
  for (const [count, capability] of [[7, "example.work@1#create"], [7, "example.work@1#align"], [1, "example.work@1#draw"]] as const) {
    add(count, capability, {
      status: "resolved", endpoint: "vendor", pricing: { kind: "page", url: "https://vendor.example/prices" },
      pricingDocuments: [{ source: `https://vendor.example/prices/${capability}`, data: { creditsPerUnit: 3 } }],
    });
  }
  const machine = createPricingOutput("build.svrun", entries, needs);
  assert.equal(machine.requestCount, 39);
  assert.equal(machine.noChargeRequestCount, 24);
  assert.deepEqual(machine.groups.map((group) => group.requests.length), [7, 7, 1]);
  assert.deepEqual(machine.groups.flatMap((group) => group.requests), needs.slice(24));
  const output = capture(human, { kind: "pricing", machine });
  assert.doesNotMatch(output, /example.processing/u);
  assert.equal(output.match(/"creditsPerUnit": 3/gu)?.length, 3);
  assert.match(output, /quantity 7/u);
  assert.match(output, /example.work#draw/u);
  const detailed = createPricingOutput("build.svrun", entries, needs, true);
  assert.equal(detailed.groups.flatMap((group) => group.requests).length, 39);
});

test("pricing retains unknown and rejected requests and distinguishes Endpoint-specific rate material", () => {
  const entries: PricingEntry[] = [
    { request: "unknown", capability: "example.local@1#free", status: "resolved", endpoint: "free.local" },
    { request: "rejected", capability: "example.local@1#free", status: "unsupported", pricing: { kind: "local" },
      rejections: [{ endpoint: "free.local", message: "unsupported parameter" }] },
    { request: "failed", capability: "example@1#create", status: "resolved", endpoint: "vendor",
      pricing: { kind: "page", url: "https://vendor.example/prices" }, pricingError: "pricing service unavailable" },
    ...["account-a", "account-b"].flatMap((endpoint) => [1, 2].map((tier) => ({
      request: `${endpoint}:${tier}`, capability: "example@1#create", status: "resolved" as const, endpoint,
      pricingDocuments: [{ source: "https://vendor.example/prices", data: { tier, amount: tier * 2 } }],
    }))),
  ];
  const needs = entries.map(({ request, capability }) => ({ request, capability, step: request, port: "result", pending: [] }));
  const machine = createPricingOutput("build.svrun", entries, needs);
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
  assert.deepEqual(JSON.parse(capture({ ...human, json: true }, limited)), machine);
  const command = parseCommand(["pricing", "build.svrun"]);
  assert.equal(command.command, "pricing");
  assert.equal("limit" in command, false);
  assert.equal((parseCommand(["pricing", "build.svrun", "--limit", "1"]) as { limit: number }).limit, 1);
});

test("Provider summaries keep raw pricing available and shared parameters preserve differing combinations", () => {
  const entries = ["first", "second", "third"].map((request) => ({
    request, capability: "example@1#generate", status: "resolved" as const, endpoint: "vendor",
    pricingDocuments: [{ source: "https://vendor.example/prices", summary: "Gold: 2 credits per unit",
      data: { actualRate: 2, marketingComparison: 99 } }],
  }));
  const needs = entries.map(({ request, capability }, index) => ({
    request, capability, step: request, port: "result", pending: [],
    summary: { fields: { mode: "gold", duration: index === 0 ? 5 : 10, size: index === 2 ? "large" : "small" }, references: {} },
  }));
  const machine = createPricingOutput("build.svrun", entries, needs);
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

test("run check treats historical reuse as a normal summary", () => {
  const output = capture(human, {
    kind: "check-run",
    machine: {
      format: "hypit.cli-check@1",
      sourceKind: "run",
      ok: true,
      run: "/project/build.svrun",
      author: "/project/main.svml",
      frontend: "@hypit/run-markup@1",
      targetCount: 1,
      targets: ["final.video"],
      candidates: 1,
      satisfactions: 1,
      historicalOutputCount: 1,
      unresolvedHistoricalOutputs: [{ candidate: "previous", build: "bld_previous", output: "take.video" }],
    },
  });
  assert.match(output, /Targets\s+final\.video/u);
  assert.match(output, /Reuse\s+1 historical Output/u);
  assert.doesNotMatch(output, /unresolved|bld_previous|Candidate/u);
});

test("plan scope omits unused branches while retaining every demanded request and diagnostic", () => {
  const needs = Array.from({ length: 61 }, (_, index): PlanNeed => ({
    request: `need-${index}`, step: `item-${index}`, port: "request", capability: "example@1#render", pending: [],
    ...(index === 60 ? { issue: "missing source" } : {}),
  }));
  const plan = {
    format: "hypit.cli-plan@1" as const, ok: false, run: "build.svrun", targetCount: 2,
    targets: ["final.video", "poster.image"], steps: 400, requestCount: needs.length, requestIssueCount: 1,
    producerFailureCount: 0,
    choiceCount: 35, choices: Array.from({ length: 35 }, (_, i) => ({ output: `old-${i}`, candidate: `selected-${i}` })),
    unreached: Array.from({ length: 125 }, (_, i) => ({ output: `unused-${i}`, operation: "old-producer" })),
    needs, providers: needs.map((need) => ({ request: need.request, capability: need.capability, status: "resolved" as const, endpoint: "local" })),
    preflight: { ok: false, capabilityCount: 2, capabilities: ["a", "b"], diagnosticCount: 2,
      diagnostics: [{ severity: "warning" as const, code: "WARNING", message: "first" },
        { severity: "error" as const, code: "REQUIRED", message: "last required error" }] },
  };
  const machine = createPlanOutput(plan, { verbose: false, limit: 1 });
  const parsed = JSON.parse(capture({ ...human, json: true }, { kind: "plan", machine }));
  assert.equal(parsed.choiceCount, 35);
  assert.equal("choices" in parsed, false);
  assert.equal("unreached" in parsed, false);
  assert.equal("steps" in parsed, false);
  assert.equal(parsed.needs.length, 61);
  assert.equal(parsed.providers.length, 61);
  assert.deepEqual(parsed.targets, plan.targets);
  assert.deepEqual(parsed.preflight.diagnostics, plan.preflight.diagnostics);
  const rendered = capture(human, { kind: "plan", machine });
  assert.match(rendered, /missing source/u);
  assert.match(rendered, /last required error/u);
  assert.doesNotMatch(rendered, /old-\d|unused-\d/u);
  assert.match(rendered, /request summary unavailable/u);
  assert.doesNotMatch(rendered, /no parameters/u);

  const detailed = createPlanOutput(plan, { verbose: true, limit: 1 });
  assert.equal(detailed.choices?.length, 1);
  assert.equal(detailed.omittedChoices, 34);
  assert.equal(detailed.unreached?.length, 1);
  assert.equal(detailed.omittedUnreached, 124);
  assert.equal(detailed.needs?.length, 61);
  assert.deepEqual(detailed.preflight?.diagnostics, plan.preflight.diagnostics);
});

test("help is concise and describes stable rather than complete output", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } });
  assert.match(output, /^Hypit\n/u);
  assert.match(output, /Results/u);
  assert.match(output, /stable machine view/u);
  assert.match(output, /programs prepare\|up\|status\|down/u);
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
