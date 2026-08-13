import type { FrameSpan, TriggerPoint, TriggeredSchedule } from "./types.js";

function assertFrame(frame: number, label: string): void {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error(`${label} must be a non-negative frame.`);
}

function assertSpan(span: FrameSpan): void {
  assertFrame(span.startFrame, "Triggered schedule outer start");
  assertFrame(span.endFrameExclusive, "Triggered schedule outer end");
  if (span.endFrameExclusive <= span.startFrame) throw new Error("Triggered schedule outer window is empty.");
}

export function resolveTriggeredSchedule(input: {
  readonly outer: FrameSpan;
  readonly terminalFrame: number;
  readonly triggers: readonly TriggerPoint[];
}): TriggeredSchedule {
  assertSpan(input.outer);
  assertFrame(input.terminalFrame, "Triggered schedule terminal");
  if (input.triggers.length === 0) throw new Error("Triggered schedule requires at least one trigger.");
  if (input.terminalFrame > input.outer.endFrameExclusive) {
    throw new Error("Triggered schedule terminal is after the outer window.");
  }
  const ids = new Set<string>();
  let previousFrame: number | undefined;
  for (const trigger of input.triggers) {
    if (trigger.id.length === 0 || ids.has(trigger.id)) throw new Error("Triggered schedule ids must be non-empty and unique.");
    ids.add(trigger.id);
    assertFrame(trigger.frame, `Triggered schedule ${trigger.id}`);
    if (trigger.frame < input.outer.startFrame || trigger.frame >= input.terminalFrame) {
      throw new Error(`Triggered schedule ${trigger.id} is outside [outer.start, terminal).`);
    }
    if (previousFrame !== undefined && trigger.frame <= previousFrame) {
      throw new Error("Triggered schedule points must be strictly increasing in authored order.");
    }
    previousFrame = trigger.frame;
  }
  const cumulative = input.triggers.map((trigger) => ({
    startFrame: trigger.frame,
    endFrameExclusive: input.outer.endFrameExclusive,
  }));
  const exclusive = input.triggers.map((trigger, index) => ({
    startFrame: trigger.frame,
    endFrameExclusive: input.triggers[index + 1]?.frame ?? input.terminalFrame,
  }));
  return {
    outer: { ...input.outer },
    terminalFrame: input.terminalFrame,
    cumulative,
    exclusive,
  };
}
