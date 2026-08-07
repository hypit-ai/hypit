import assert from "node:assert/strict";
import test from "node:test";

import {
  compilePromptKit,
  sealPromptKitInvocation,
  sealPromptKitSpec,
  verifyPromptProgram,
} from "@svml/prompt-kit";

const emptyWhen = { parameters: {}, selectors: {} } as const;

const spec = sealPromptKitSpec({
  contract: "svml.prompt-kit-spec@1",
  id: "demo-v1",
  separator: "\n\n",
  defaults: { tone: "calm" },
  blocks: [
    { kind: "fixed", id: "base", order: 10, text: "BASE" },
    {
      kind: "axis", id: "tone", order: 20, parameter: "tone",
      choices: [
        { id: "calm", text: "CALM", when: emptyWhen },
        { id: "loud", text: "LOUD", when: emptyWhen },
      ],
    },
    {
      kind: "variant", id: "evidence", order: 30,
      choices: [
        { id: "none", text: "NO EVIDENCE", when: { parameters: {}, selectors: { evidence: "none" } } },
        { id: "present", text: "USE EVIDENCE", when: { parameters: {}, selectors: { evidence: "present" } } },
      ],
    },
    { kind: "slot", id: "subject", order: 40, slot: "subject", optional: false, label: "SUBJECT:" },
    { kind: "slot", id: "extra", order: 50, slot: "extra", optional: true },
  ],
});

function invocation(parameters: Record<string, string> = {}) {
  return sealPromptKitInvocation({
    contract: "svml.prompt-kit-invocation@1",
    parameters,
    selectors: { evidence: "present" },
    slots: { subject: "a toothbrush" },
  });
}

test("generic Prompt Kit resolves defaults, finite variants and required slots", () => {
  const program = compilePromptKit(spec, invocation());
  verifyPromptProgram(program);
  assert.deepEqual(program.blocks.map((block) => block.text), [
    "BASE", "CALM", "USE EVIDENCE", "SUBJECT:\na toothbrush",
  ]);
});

test("Invocation parameters override Spec defaults without changing the Spec", () => {
  const program = compilePromptKit(spec, invocation({ tone: "loud" }));
  assert.equal(program.blocks[1]?.text, "LOUD");
  assert.equal(spec.defaults.tone, "calm");
});

test("unknown inputs and non-unique finite branches fail closed", () => {
  assert.throws(
    () => compilePromptKit(spec, invocation({ typo: "loud" })),
    /parameter typo is not declared/u,
  );
  const ambiguous = sealPromptKitSpec({
    contract: "svml.prompt-kit-spec@1",
    id: "ambiguous-v1",
    separator: "\n\n",
    defaults: {},
    blocks: [{
      kind: "variant", id: "branch", order: 10,
      choices: [
        { id: "first", text: "FIRST", when: emptyWhen },
        { id: "second", text: "SECOND", when: emptyWhen },
      ],
    }],
  });
  const call = sealPromptKitInvocation({
    contract: "svml.prompt-kit-invocation@1",
    parameters: {}, selectors: {}, slots: {},
  });
  assert.throws(() => compilePromptKit(ambiguous, call), /matched 2 choices/u);
});
