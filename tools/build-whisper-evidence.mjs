#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function takeOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${name} requires a file path.`);
  args.splice(index, 2);
  return value;
}
const cueFile = takeOption("--caption-cues");
const timingOverrideFile = takeOption("--timing-overrides");
const [sourceFile, outputFile, ...whisperFiles] = args;
if (!sourceFile || !outputFile || whisperFiles.length === 0) {
  throw new Error(
    "usage: build-whisper-evidence.mjs <tokens.json> <output.json> <whisper-1.json> ... "
    + "[--caption-cues <cues.json>] [--timing-overrides <overrides.json>]",
  );
}

const intended = JSON.parse(await readFile(resolve(sourceFile), "utf8"));
const normalize = (value) => String(value)
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

const lcs = (left, right) => {
  const table = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? 1 + table[leftIndex + 1][rightIndex + 1]
        : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }
  const matches = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      matches.push([leftIndex, rightIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1]) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return matches;
};

const evidenceWords = [];
const segmentFrames = 361;
for (let segmentIndex = 0; segmentIndex < intended.segments.length; segmentIndex += 1) {
  const segment = intended.segments[segmentIndex];
  const whisper = JSON.parse(await readFile(resolve(whisperFiles[segmentIndex]), "utf8"));
  const measured = whisper.transcription
    .filter((entry) => String(entry.text).trim())
    .map((entry) => ({
      text: String(entry.text).trim(),
      startSec: Number(entry.offsets.from) / 1000,
      endSec: Number(entry.offsets.to) / 1000,
    }));
  const target = intended.words.filter((word) => word.segmentId === segment.id);
  const matches = lcs(
    target.map((word) => normalize(word.text)),
    measured.map((word) => normalize(word.text)),
  );
  const anchors = [[-1, -1], ...matches, [target.length, measured.length]];
  const located = Array(target.length);
  for (const [targetIndex, measuredIndex] of matches) {
    located[targetIndex] = {
      text: target[targetIndex].text,
      startSec: measured[measuredIndex].startSec,
      endSec: measured[measuredIndex].endSec,
    };
  }
  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
    const [leftTarget, leftMeasured] = anchors[anchorIndex];
    const [rightTarget, rightMeasured] = anchors[anchorIndex + 1];
    const missing = rightTarget - leftTarget - 1;
    if (missing <= 0) continue;
    const measuredSlice = measured.slice(leftMeasured + 1, rightMeasured);
    const startSec = measuredSlice[0]?.startSec
      ?? measured[leftMeasured]?.endSec
      ?? 0;
    const endSec = measuredSlice.at(-1)?.endSec
      ?? measured[rightMeasured]?.startSec
      ?? segmentFrames / 30;
    const weights = target
      .slice(leftTarget + 1, rightTarget)
      .map((word) => Math.max(1, normalize(word.text).length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = startSec;
    for (let index = 0; index < missing; index += 1) {
      const duration = (endSec - startSec) * weights[index] / totalWeight;
      const targetIndex = leftTarget + 1 + index;
      located[targetIndex] = {
        text: target[targetIndex].text,
        startSec: cursor,
        endSec: index === missing - 1 ? endSec : cursor + duration,
      };
      cursor += duration;
    }
  }
  const offsetSec = segmentIndex * segmentFrames / 30;
  const segmentEndSec = (segmentIndex + 1) * segmentFrames / 30;
  for (const word of located) {
    evidenceWords.push({
      text: word.text,
      startSec: Math.max(offsetSec, Math.min(segmentEndSec, word.startSec + offsetSec)),
      endSec: Math.max(offsetSec, Math.min(segmentEndSec, word.endSec + offsetSec)),
      segmentId: segment.id,
    });
  }
}

const evidence = {
  contract: "svml.speech-alignment.v1",
  durationSec: intended.segments.length * segmentFrames / 30,
  fps: 30,
  words: evidenceWords,
  segments: intended.segments.map((segment, index) => ({
    id: segment.id,
    startSec: index * segmentFrames / 30,
    endSec: (index + 1) * segmentFrames / 30,
  })),
  provenance: {
    method: "whisper.cpp word timestamps + deterministic intended-script LCS projection",
    source: "existing pinned avatar audio; no generation call",
  },
};
if (cueFile) {
  const cueDocument = JSON.parse(await readFile(resolve(cueFile), "utf8"));
  evidence.captionCues = Array.isArray(cueDocument)
    ? cueDocument
    : cueDocument.captionCues;
  if (!Array.isArray(evidence.captionCues)) {
    throw new Error(`${cueFile} must contain an array or a captionCues array.`);
  }
  evidence.provenance.captionCues = cueDocument.provenance
    ?? "pinned cue partition from the reference Locate result";
}
if (timingOverrideFile) {
  const overrideDocument = JSON.parse(
    await readFile(resolve(timingOverrideFile), "utf8"),
  );
  if (!Array.isArray(overrideDocument.words)) {
    throw new Error(`${timingOverrideFile} must contain a words array.`);
  }
  for (const override of overrideDocument.words) {
    const index = Number(override.index);
    const word = evidence.words[index];
    if (!Number.isInteger(index) || !word) {
      throw new Error(`${timingOverrideFile} contains invalid word index ${String(override.index)}.`);
    }
    if (override.startSec !== undefined) word.startSec = Number(override.startSec);
    if (override.endSec !== undefined) word.endSec = Number(override.endSec);
  }
  evidence.provenance.timingOverrides = overrideDocument.provenance
    ?? "reference transition recovery";
}
await writeFile(resolve(outputFile), `${JSON.stringify(evidence, null, 2)}\n`);
