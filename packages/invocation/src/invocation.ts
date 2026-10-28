import { compareCodeUnits } from "@hypit/protocol";
import type { Invocation } from "@hypit/protocol";

export class InvocationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InvocationError";
    this.code = code;
  }
}

function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new InvocationError(code, message);
}

function content(invocation: Invocation): Invocation {
  return {
    format: "hypit.invocation@1",
    targets: [...invocation.targets].sort(compareCodeUnits),
    overrides: [...invocation.overrides].sort((left, right) => compareCodeUnits(left.output, right.output)),
  };
}

export function sealInvocation(input: Omit<Invocation, "format">): Invocation {
  const invocation = content({ format: "hypit.invocation@1", ...input });
  verifyInvocation(invocation);
  return invocation;
}

export function verifyInvocation(invocation: Invocation): void {
  assert(invocation.format === "hypit.invocation@1", "UNSUPPORTED_INVOCATION", "unsupported Invocation");
  assert(invocation.targets.length > 0, "EMPTY_INVOCATION_TARGETS", "Invocation has no Targets");
  const targets = new Set<string>();
  for (const target of invocation.targets) {
    assert(target.length > 0, "EMPTY_INVOCATION_TARGET", "Invocation has an empty Target");
    assert(!targets.has(target), "DUPLICATE_INVOCATION_TARGET", `Invocation repeats Target ${target}`);
    targets.add(target);
  }
  const outputs = new Set<string>();
  for (const override of invocation.overrides) {
    assert(override.output.length > 0, "EMPTY_INVOCATION_OVERRIDE", "Invocation has an empty override Output");
    assert(!outputs.has(override.output), "DUPLICATE_INVOCATION_OVERRIDE",
      `Invocation overrides ${override.output} more than once`);
    outputs.add(override.output);
    if (override.choice.kind === "record") {
      assert(override.choice.record.length > 0, "EMPTY_INVOCATION_RECORD",
        `Invocation override ${override.output} has an empty Record`);
    }
  }
}
