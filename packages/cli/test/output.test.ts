import assert from "node:assert/strict";
import test from "node:test";

import type { BuildPlan } from "@hypit/protocol";

import { renderCliError, writeCliHelp, writeCliOutput } from "../src/output.js";
import type { PlanPreflight } from "../src/output.js";

const resource = "res_cli-output" as const;

function capture(
  options: Parameters<typeof writeCliOutput>[1],
  presentation: Parameters<typeof writeCliOutput>[2],
  terminal?: Parameters<typeof writeCliOutput>[0]["terminal"],
): string {
  let output = "";
  writeCliOutput({
    write(text) { output += text; },
    ...(terminal === undefined ? {} : { terminal }),
  }, options, presentation);
  return output;
}

const human = { json: false, color: "auto", verbose: false } as const;

test("author check renders a compact human summary without dumping identity", () => {
  const output = capture(human, {
    kind: "check-author",
    source: "/project/main.svml",
    frontend: "@hypit/markup@1",
    machine: {
      format: "hypit.cli-check@1",
      sourceKind: "author",
      ok: true,
      units: 2,
      sourceAssets: [{ resource }],
      modules: ["@hypit/script@1"],
      exports: [{
        name: "story",
        type: { module: { name: "@hypit/narrative", version: "1" }, name: "Narrative" },
        kind: "logical-output",
      }],
    },
  });
  assert.match(output, /✓ Source is valid/u);
  assert.match(output, /Frontend\s+@hypit\/markup@1/u);
  assert.match(output, /story\s+@hypit\/narrative@1\/Narrative/u);
  assert.doesNotMatch(output, /res_cli-output/u);
  assert.doesNotMatch(output, /\u001b\[/u);
});

test("large author exports are bounded until verbose output is requested", () => {
  const exports = Array.from({ length: 15 }, (_, index) => ({
    name: `output-${String(index).padStart(2, "0")}`,
    type: { module: { name: "example", version: "1" }, name: "Value" },
    kind: "logical-output",
  }));
  const presentation = {
    kind: "check-author" as const,
    source: "/project/main.svml",
    frontend: "example@1",
    machine: {
      format: "hypit.cli-check@1" as const,
      sourceKind: "author" as const,
      ok: true as const,
      units: 1,
      sourceAssets: [],
      modules: [],
      exports,
    },
  };
  const compact = capture(human, presentation);
  assert.match(compact, /3 more · use --verbose/u);
  assert.doesNotMatch(compact, /output-14/u);
  assert.match(capture({ ...human, verbose: true }, presentation), /output-14/u);
});

test("author check hides generated graph plumbing without deleting machine exports", () => {
  const machine = {
    format: "hypit.cli-check@1" as const,
    sourceKind: "author" as const,
    ok: true as const,
    units: 1,
    sourceAssets: [],
    modules: [],
    exports: [{
      name: "final.video",
      type: { module: { name: "example", version: "1" }, name: "Video" },
      kind: "logical-output",
    }, {
      name: "card.__canvas-frame",
      type: { module: { name: "example", version: "1" }, name: "Frame" },
      kind: "record",
    }, {
      name: "rendered.binding-0001",
      type: { module: { name: "example", version: "1" }, name: "Binding" },
      kind: "record",
    }],
  };
  const presentation = {
    kind: "check-author" as const,
    source: "/project/main.svml",
    frontend: "example@1",
    machine,
  };
  const compact = capture(human, presentation);
  assert.match(compact, /final\.video/u);
  assert.doesNotMatch(compact, /__canvas-frame|binding-0001/u);
  assert.match(capture({ ...human, verbose: true }, presentation), /__canvas-frame/u);
  assert.deepEqual(machine.exports.length, 3);
});

test("JSON mode is exact machine data with no terminal decoration", () => {
  const machine = {
    format: "hypit.cli-doctor@1" as const,
    ok: false,
    dataRoot: "/project",
    diagnostics: [{ severity: "error" as const, code: "MISSING", message: "not found" }],
  };
  const output = capture({ json: true, color: "always", verbose: true }, {
    kind: "doctor",
    profile: "/project/hypit.runtime.json",
    machine,
  }, { isTTY: true, color: true, unicode: true, columns: 100 });
  assert.deepEqual(JSON.parse(output), machine);
  assert.doesNotMatch(output, /Hypit Doctor/u);
  assert.doesNotMatch(output, /\u001b\[/u);
});

test("plan keeps named Run choices visible and leaves graph internals to verbose output", () => {
  const plan: BuildPlan = {
    format: "hypit.plan@1",
    steps: [{
      id: "step-1",
      producer: { module: { name: "@hypit/media", version: "1" }, name: "inspect" },
      inputs: {},
      outputs: {},
      needs: { generated: { id: "need-1", result: "record-1" } },
    }, {
      id: "step-2",
      producer: { module: { name: "@hypit/media", version: "1" }, name: "normalize" },
      inputs: {},
      outputs: {},
      needs: {},
    }],
    goals: [],
    selections: [{
      output: "logical:take",
      candidate: "candidate:preview",
      record: "record:take",
    }],
  };
  const output = capture(human, {
    kind: "plan",
    machine: { format: "hypit.cli-plan@1", ok: true, plan },
    run: "/project/build.svrun",
    outputNames: { "logical:take": "take.video" },
    satisfactionNames: { "logical:take": "preview" },
  });
  assert.match(output, /Run choices/u);
  assert.match(output, /take\.video\s+← preview/u);
  assert.doesNotMatch(output, /Operations/u);
  assert.match(output, /External requests/u);
  assert.match(output, /1\s+@hypit\/media@1#inspect/u);
  assert.doesNotMatch(output, /No external work was started\./u);
  assert.match(capture({ ...human, verbose: true }, {
    kind: "plan",
    machine: { format: "hypit.cli-plan@1", ok: true, plan },
    run: "/project/build.svrun",
    outputNames: { "logical:take": "take.video" },
    satisfactionNames: { "logical:take": "preview" },
  }), /2\s+@hypit\/media@1/u);
});

test("a plan with no Needs stays compact without knowing any Provider names", () => {
  const plan: BuildPlan = {
    format: "hypit.plan@1",
    steps: [],
    goals: [],
    selections: [],
  };
  const output = capture(human, {
    kind: "plan",
    machine: { format: "hypit.cli-plan@1", ok: true, plan },
    run: "/project/free.svrun",
  });
  assert.match(output, /External requests\s+0/u);
  assert.doesNotMatch(output, /No external requests/u);
});

test("plan runtime preflight presents only demanded capabilities", () => {
  const plan: BuildPlan = {
    format: "hypit.plan@1",
    steps: [],
    goals: [],
    selections: [],
  };
  const preflight: PlanPreflight = {
      ok: false,
      dataRoot: "/project",
      capabilities: ["@example/image@1#generate"],
      diagnostics: [{
        severity: "error",
        code: "RUNTIME_CREDENTIAL_MISSING",
        message: "Image key is absent",
      }],
  };
  const output = capture(human, {
    kind: "plan",
    machine: { format: "hypit.cli-plan@1", ok: false, plan, preflight },
    run: "/project/images.svrun",
  });
  assert.match(output, /Runtime preflight/u);
  assert.match(output, /@example\/image@1#generate/u);
  assert.match(output, /Image key is absent/u);
});

test("human errors expose stable codes while JSON errors remain parseable", () => {
  const error = Object.assign(new Error("credential is absent"), { code: "RUNTIME_CREDENTIAL_MISSING" });
  const humanError = renderCliError(error, { json: false, color: false, unicode: true, debug: false });
  assert.match(humanError, /× Command failed/u);
  assert.match(humanError, /RUNTIME_CREDENTIAL_MISSING/u);
  const machine = JSON.parse(renderCliError(error, {
    json: true,
    color: true,
    unicode: true,
    debug: false,
  })) as { readonly format: string; readonly error: { readonly code: string } };
  assert.equal(machine.format, "hypit.cli-error@1");
  assert.equal(machine.error.code, "RUNTIME_CREDENTIAL_MISSING");
});

test("help is a successful product surface rather than a usage error", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } });
  assert.match(output, /^Hypit\n/u);
  assert.match(output, /Authoring/u);
  assert.match(output, /--json/u);
  assert.doesNotMatch(output, /CLI_ERROR/u);
});

test("command help explains only the selected shell grammar", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } }, "build");
  assert.match(output, /^hypit build\n/u);
  assert.match(output, /--follow/u);
  assert.doesNotMatch(output, /Authoring/u);
});

test("archive commands have their own help instead of falling back to the global screen", () => {
  let output = "";
  writeCliHelp({ write(text) { output += text; } }, "get");
  assert.match(output, /^hypit get\n/u);
  assert.match(output, /copying never reruns work/u);
  assert.doesNotMatch(output, /Typical flow/u);
});
