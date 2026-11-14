import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  compareTemporalMapPoints,
  exactTemporalZero,
  type TemporalMapRegionSet,
} from "@hypit/temporal/algebra";

import type {
  AudiovisualTerminalBinding,
  PlannedSourceExecution,
  SourceExecutionTaskDemand,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sequentialExecution(
  task: SourceExecutionTaskDemand,
  origin: import("@hypit/temporal/algebra").ExactTemporalValue,
): TemporalMapRegionSet {
  assert(task.temporal.kind === "signal",
    `Constant Source execution task ${task.id} cannot have a sequential acquisition.`);
  assertExactTemporalValue(origin, `Source execution task ${task.id} origin`);
  const regions = task.temporal.regions;
  assert(regions.regions.length > 0, `Source execution task ${task.id} has no requested regions.`);
  const earliest = regions.regions.reduce((left, right) =>
    compareTemporalMapPoints(left.start, right.start) <= 0 ? left : right);
  assert(compareExactTemporalValues(origin, exactTemporalZero()) >= 0,
    `Source execution task ${task.id} origin is negative.`);
  assert(compareExactTemporalValues(origin, earliest.start.position) <= 0,
    `Source execution task ${task.id} origin lies after its first requested position.`);
  const latest = regions.regions.reduce((left, right) =>
    compareTemporalMapPoints(left.end, right.end) >= 0 ? left : right);
  return {
    domain: structuredClone(regions.domain),
    regions: [{
      start: { position: structuredClone(origin), side: "after" },
      end: structuredClone(latest.end),
    }],
  };
}

function wholeExecution(task: SourceExecutionTaskDemand): TemporalMapRegionSet {
  assert(task.temporal.kind === "signal",
    `Constant Source execution task ${task.id} cannot have a whole acquisition.`);
  const domain = structuredClone(task.temporal.regions.domain);
  return {
    domain,
    regions: [{
      start: { position: exactTemporalZero(), side: "after" },
      end: { position: structuredClone(domain.duration), side: "before" },
    }],
  };
}

/** Close one Source task under its already-selected implementation access mode. */
export function planSourceExecution(
  task: SourceExecutionTaskDemand,
  binding: AudiovisualTerminalBinding,
): PlannedSourceExecution {
  assert(binding.node === task.id,
    `Source Terminal binding ${binding.node} does not belong to task ${task.id}.`);
  assert(binding.sourceAccess !== undefined,
    `Source execution task ${task.id} has no temporal access declaration.`);
  const access = binding.sourceAccess;
  if (task.temporal.kind === "constant") {
    assert(access.kind === "constant",
      `Constant Source execution task ${task.id} requires constant access.`);
    return {
      task: task.id,
      signal: task.signal,
      terminal: binding.terminal,
      source: task.source,
      output: task.output,
      requested: { kind: "constant" },
      ...(task.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(task.pictureDomain) }),
      ...(task.spatial === undefined ? {} : { spatial: structuredClone(task.spatial) }),
      acquisition: { kind: "constant" },
    };
  }
  assert(access.kind !== "constant",
    `Signal Source execution task ${task.id} cannot use constant access.`);
  const requested = { kind: "signal" as const, regions: structuredClone(task.temporal.regions) };
  switch (access.kind) {
    case "point": return {
      task: task.id, signal: task.signal, terminal: binding.terminal,
      source: task.source, output: task.output,
      requested,
      ...(task.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(task.pictureDomain) }),
      ...(task.spatial === undefined ? {} : { spatial: structuredClone(task.spatial) }),
      ...(task.samples === undefined ? {} : { samples: structuredClone(task.samples) }),
      acquisition: { kind: "point" },
    };
    case "range": return {
      task: task.id, signal: task.signal, terminal: binding.terminal,
      source: task.source, output: task.output,
      requested,
      ...(task.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(task.pictureDomain) }),
      ...(task.spatial === undefined ? {} : { spatial: structuredClone(task.spatial) }),
      ...(task.samples === undefined ? {} : { samples: structuredClone(task.samples) }),
      acquisition: { kind: "range", regions: structuredClone(task.temporal.regions) },
    };
    case "whole": return {
      task: task.id, signal: task.signal, terminal: binding.terminal,
      source: task.source, output: task.output,
      requested,
      ...(task.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(task.pictureDomain) }),
      ...(task.spatial === undefined ? {} : { spatial: structuredClone(task.spatial) }),
      ...(task.samples === undefined ? {} : { samples: structuredClone(task.samples) }),
      acquisition: { kind: "whole", execution: wholeExecution(task) },
    };
    case "sequential": return {
      task: task.id, signal: task.signal, terminal: binding.terminal,
      source: task.source, output: task.output,
      requested,
      ...(task.pictureDomain === undefined ? {} : { pictureDomain: structuredClone(task.pictureDomain) }),
      ...(task.spatial === undefined ? {} : { spatial: structuredClone(task.spatial) }),
      ...(task.samples === undefined ? {} : { samples: structuredClone(task.samples) }),
      acquisition: {
        kind: "sequential",
        origin: structuredClone(access.origin),
        execution: sequentialExecution(task, access.origin),
      },
    };
  }
}
