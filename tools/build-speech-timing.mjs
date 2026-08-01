#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function takeOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  args.splice(index, 2);
  return value;
}

const timingOverrideFile = takeOption("--timing-overrides");
const fps = Number(takeOption("--fps") ?? 30);
const segmentFrames = Number(takeOption("--segment-frames") ?? 361);
const [scriptFile, outputFile, ...whisperFiles] = args;
if (!scriptFile || !outputFile || whisperFiles.length === 0) {
  throw new Error(
    "usage: build-speech-timing.mjs <script.json> <output.json> <whisper-1.json> ... "
    + "[--fps 30] [--segment-frames 361] [--timing-overrides <overrides.json>]",
  );
}
if (!Number.isFinite(fps) || fps <= 0 || !Number.isInteger(segmentFrames) || segmentFrames <= 0) {
  throw new Error("fps and segment-frames must define a positive clock.");
}

const script = JSON.parse(await readFile(resolve(scriptFile), "utf8"));
if (!Array.isArray(script.segments) || script.segments.length !== whisperFiles.length) {
  throw new Error("Script Segment count must match the supplied Whisper result count.");
}

const units = [];
for (const [segmentIndex, segment] of script.segments.entries()) {
  const whisper = JSON.parse(await readFile(resolve(whisperFiles[segmentIndex]), "utf8"));
  const offsetSec = segmentIndex * segmentFrames / fps;
  const segmentEndSec = (segmentIndex + 1) * segmentFrames / fps;
  for (const entry of whisper.transcription ?? []) {
    const text = String(entry.text ?? "").trim();
    if (!text) continue;
    const startSec = Number(entry.offsets?.from) / 1000 + offsetSec;
    const endSec = Number(entry.offsets?.to) / 1000 + offsetSec;
    units.push({
      text,
      startSec: Math.max(offsetSec, Math.min(segmentEndSec, startSec)),
      endSec: Math.max(offsetSec, Math.min(segmentEndSec, endSec)),
      segmentId: segment.id,
    });
  }
}

const evidence = {
  contract: "svml.speech-timing-evidence.v1",
  durationSec: script.segments.length * segmentFrames / fps,
  fps,
  quality: "measured",
  units,
  segments: script.segments.map((segment, index) => ({
    id: segment.id,
    startSec: index * segmentFrames / fps,
    endSec: (index + 1) * segmentFrames / fps,
  })),
  provenance: {
    method: "whisper.cpp raw word timestamps",
    source: "measured units are not corrected or projected to Script wording",
  },
};

if (timingOverrideFile) {
  const overrideDocument = JSON.parse(await readFile(resolve(timingOverrideFile), "utf8"));
  if (!Array.isArray(overrideDocument.units)) {
    throw new Error(`${timingOverrideFile} must contain a units array.`);
  }
  for (const override of overrideDocument.units) {
    const index = Number(override.index);
    const unit = evidence.units[index];
    if (!Number.isInteger(index) || !unit) {
      throw new Error(`${timingOverrideFile} contains invalid unit index ${String(override.index)}.`);
    }
    if (override.startSec !== undefined) unit.startSec = Number(override.startSec);
    if (override.endSec !== undefined) unit.endSec = Number(override.endSec);
  }
  evidence.provenance.timingOverrides = overrideDocument.provenance
    ?? "manual timing evidence correction";
}

await writeFile(resolve(outputFile), `${JSON.stringify(evidence, null, 2)}\n`);
