import { fail } from "./diagnostics.js";
import type {
  CompleteSemanticMap,
  NarrativeIR,
  ProgramBasis,
  SemanticAnchorPoint,
  SemanticMap,
  SpeechTimingEvidence,
  TemporalBasisProduction,
} from "./model.js";
import { normalizeWord, sha256, stableJson } from "./util.js";

const EPSILON = 1e-6;

export function basisFps(basis: ProgramBasis): number {
  return basis.frameRate.numerator / basis.frameRate.denominator;
}

function integer(value: number, label: string): void {
  if (!Number.isInteger(value)) fail("temporal_integer", `${label} must be an integer.`);
}

function normalizeFrameRate(fps: number): ProgramBasis["frameRate"] {
  if (!Number.isFinite(fps) || fps <= 0) {
    fail("basis_frame_rate", `ProgramBasis fps must be positive and finite; received ${fps}.`);
  }
  if (Number.isInteger(fps)) return { numerator: fps, denominator: 1 };
  const denominator = 1_000_000;
  const numerator = Math.round(fps * denominator);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function gcd(left: number, right: number): number {
  left = Math.abs(left);
  right = Math.abs(right);
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

export function createProgramBasis(args: {
  fps: number;
  durationFrames: number;
  outcomeDigest: string;
}): ProgramBasis {
  integer(args.durationFrames, "ProgramBasis durationFrames");
  if (args.durationFrames <= 0) {
    fail("basis_duration", "ProgramBasis durationFrames must be positive.");
  }
  const payload = {
    contract: "svml.program-basis.v1" as const,
    frameRate: normalizeFrameRate(args.fps),
    originFrame: 0 as const,
    durationFrames: args.durationFrames,
    outcomeDigest: args.outcomeDigest,
  };
  return {
    contract: payload.contract,
    frameRate: payload.frameRate,
    originFrame: payload.originFrame,
    durationFrames: payload.durationFrames,
    basisDigest: sha256(stableJson(payload)),
  };
}

export function validateProgramBasis(basis: ProgramBasis): void {
  if (basis.contract !== "svml.program-basis.v1") {
    fail("basis_contract", `Unsupported ProgramBasis contract "${basis.contract}".`);
  }
  integer(basis.frameRate.numerator, "ProgramBasis frameRate numerator");
  integer(basis.frameRate.denominator, "ProgramBasis frameRate denominator");
  integer(basis.durationFrames, "ProgramBasis durationFrames");
  if (
    basis.originFrame !== 0
    || basis.frameRate.numerator <= 0
    || basis.frameRate.denominator <= 0
    || basis.durationFrames <= 0
    || !/^[a-f0-9]{64}$/u.test(basis.basisDigest)
  ) {
    fail("basis_shape", "ProgramBasis has an invalid clock or digest.");
  }
}

function canonicalFacet(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalFacet);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !["source", "absoluteSource", "basisDigest"].includes(key))
    .map(([key, nested]) => [key, canonicalFacet(nested)]));
}

export function basisOutcome(production: TemporalBasisProduction): unknown {
  return {
    contract: "svml.program-basis-outcome.v1",
    frameRate: production.basis.frameRate,
    originFrame: production.basis.originFrame,
    durationFrames: production.basis.durationFrames,
    alignmentSubjects: production.alignmentSubjects,
    sourceMaps: production.sourceMaps,
    audio: production.audio.map(({ source: _source, ...contribution }) => contribution),
    facets: canonicalFacet(production.facets),
  };
}

function digest(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    fail("temporal_digest", `${label} must be a lowercase SHA-256 digest.`);
  }
}

function uniqueIds(values: Array<{ id: string }>, label: string): void {
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    fail("basis_identity_duplicate", `${label} contains duplicate ids.`);
  }
}

function validateProgramWindow(
  start: number,
  end: number,
  durationFrames: number,
  label: string,
): void {
  integer(start, `${label} start`);
  integer(end, `${label} end`);
  if (start < 0 || end <= start || end > durationFrames) {
    fail("basis_program_window", `${label} has invalid Program range ${start}..${end}.`);
  }
}

function validateFacetAffinity(value: unknown, basisDigest: string, path = "facets"): void {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => validateFacetAffinity(nested, basisDigest, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("basisDigest" in record && record.basisDigest !== basisDigest) {
    fail("basis_facet_affinity", `${path} is bound to a different ProgramBasis.`);
  }
  for (const [key, nested] of Object.entries(record)) {
    validateFacetAffinity(nested, basisDigest, `${path}.${key}`);
  }
}

export function validateTemporalBasisProduction(production: TemporalBasisProduction): void {
  if (production.contract !== "svml.temporal-basis-production.v1") {
    fail("basis_production_contract", "Unsupported TemporalBasisProduction contract.");
  }
  validateProgramBasis(production.basis);
  digest(production.productionDigest, "productionDigest");
  uniqueIds(production.alignmentSubjects, "alignmentSubjects");
  uniqueIds(production.sourceMaps, "sourceMaps");
  uniqueIds(production.audio, "Program audio");
  const maps = new Map(production.sourceMaps.map((map) => [map.id, map]));
  for (const map of production.sourceMaps) {
    digest(map.sourceDigest, `Source map "${map.id}" digest`);
    integer(map.sourceStartFrame, `Source map "${map.id}" source start`);
    integer(map.sourceEndFrameExclusive, `Source map "${map.id}" source end`);
    if (map.sourceStartFrame < 0 || map.sourceEndFrameExclusive <= map.sourceStartFrame) {
      fail("basis_source_window", `Source map "${map.id}" has an invalid source range.`);
    }
    validateProgramWindow(
      map.programStartFrame,
      map.programEndFrameExclusive,
      production.basis.durationFrames,
      `Source map "${map.id}"`,
    );
  }
  for (const subject of production.alignmentSubjects) {
    digest(subject.sourceDigest, `Alignment subject "${subject.id}" digest`);
    const map = maps.get(subject.sourceMapId);
    if (
      !map
      || map.sourceId !== subject.sourceId
      || map.sourceDigest !== subject.sourceDigest
    ) {
      fail("basis_alignment_subject", `Alignment subject "${subject.id}" has no matching source map.`);
    }
  }
  for (const contribution of production.audio) {
    digest(contribution.sourceDigest, `Program audio "${contribution.id}" digest`);
    const map = maps.get(contribution.sourceMapId);
    if (
      !map
      || map.sourceId !== contribution.sourceId
      || map.sourceDigest !== contribution.sourceDigest
    ) {
      fail("basis_audio_source_map", `Program audio "${contribution.id}" has no matching source map.`);
    }
    validateProgramWindow(
      contribution.programStartFrame,
      contribution.programEndFrameExclusive,
      production.basis.durationFrames,
      `Program audio "${contribution.id}"`,
    );
    const duration = contribution.programEndFrameExclusive - contribution.programStartFrame;
    for (const [name, value] of [
      ["fadeInFrames", contribution.fadeInFrames ?? 0],
      ["fadeOutFrames", contribution.fadeOutFrames ?? 0],
    ] as const) {
      integer(value, `Program audio "${contribution.id}" ${name}`);
      if (value < 0 || value > duration) {
        fail("basis_audio_fade", `Program audio "${contribution.id}" has invalid ${name}.`);
      }
    }
    if (!Number.isFinite(contribution.gain) || contribution.gain < 0) {
      fail("basis_audio_gain", `Program audio "${contribution.id}" has invalid gain.`);
    }
  }
  validateFacetAffinity(production.facets, production.basis.basisDigest);
  const expected = sha256(stableJson(basisOutcome(production)));
  if (production.basis.basisDigest !== expected) {
    fail(
      "basis_digest",
      `ProgramBasis digest ${production.basis.basisDigest} does not match canonical outcome ${expected}.`,
    );
  }
}

function frameAt(seconds: number, basis: ProgramBasis): number {
  return Math.round(seconds * basisFps(basis));
}

function semanticMapDigest(map: Omit<CompleteSemanticMap, "mapDigest">): string {
  return sha256(stableJson(map));
}

function validateSpeechTiming(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  evidence: SpeechTimingEvidence,
): void {
  if (evidence.contract !== "svml.speech-timing-evidence.v1") {
    fail("locator_evidence_contract", `Unsupported speech timing contract "${evidence.contract}".`);
  }
  if (
    !Number.isFinite(evidence.fps)
    || evidence.fps <= 0
    || !Number.isFinite(evidence.durationSec)
    || evidence.durationSec <= 0
  ) {
    fail("locator_evidence_clock", "SpeechTimingEvidence requires positive fps and duration.");
  }
  if (evidence.quality !== "measured" && evidence.quality !== "estimated") {
    fail("locator_evidence_quality", "SpeechTimingEvidence quality must be measured or estimated.");
  }
  if (Math.abs(evidence.fps - basisFps(basis)) > EPSILON) {
    fail(
      "locator_basis_frame_rate",
      `Speech timing fps ${evidence.fps} does not match ProgramBasis fps ${basisFps(basis)}.`,
    );
  }
  if (frameAt(evidence.durationSec, basis) !== basis.durationFrames) {
    fail(
      "locator_basis_duration",
      `Speech timing duration resolves to ${frameAt(evidence.durationSec, basis)} frames; ProgramBasis has ${basis.durationFrames}.`,
    );
  }
  if (evidence.segments.length !== narrative.segments.length) {
    fail(
      "locator_segment_cardinality",
      `Script has ${narrative.segments.length} Segments but speech timing has ${evidence.segments.length}.`,
    );
  }

  const segments = new Map(evidence.segments.map((segment) => [segment.id, segment]));
  if (segments.size !== evidence.segments.length) {
    fail("locator_segment_duplicate", "SpeechTimingEvidence repeats a Segment id.");
  }
  for (const [index, segment] of narrative.segments.entries()) {
    const aligned = segments.get(segment.id);
    if (!aligned) fail("locator_segment_missing", `Speech timing is missing Segment "${segment.id}".`);
    if (
      !Number.isFinite(aligned.startSec)
      || !Number.isFinite(aligned.endSec)
      || aligned.startSec < 0
      || aligned.endSec < aligned.startSec
      || aligned.endSec > evidence.durationSec + EPSILON
    ) {
      fail(
        "locator_segment_window",
        `Segment "${segment.id}" has invalid window ${aligned.startSec}..${aligned.endSec}.`,
      );
    }
    const previousScript = narrative.segments[index - 1];
    const previous = previousScript ? segments.get(previousScript.id) : undefined;
    if (
      previous
      && (
        aligned.startSec < previous.startSec - EPSILON
        || aligned.endSec < previous.endSec - EPSILON
      )
    ) {
      fail(
        "locator_segment_order",
        `Segment "${segment.id}" violates source-order start/end monotonicity.`,
      );
    }
  }

  const previousBySegment = new Map<string, SpeechTimingEvidence["units"][number]>();
  for (const [index, unit] of evidence.units.entries()) {
    const segment = segments.get(unit.segmentId);
    if (
      !segment
      || typeof unit.text !== "string"
      || !Number.isFinite(unit.startSec)
      || !Number.isFinite(unit.endSec)
      || unit.startSec < segment.startSec - EPSILON
      || unit.endSec < unit.startSec
      || unit.endSec > segment.endSec + EPSILON
    ) {
      fail(
        "locator_word_window",
        `Speech timing unit ${index + 1} falls outside Segment "${unit.segmentId}".`,
      );
    }
    const previous = previousBySegment.get(unit.segmentId);
    if (previous && unit.startSec < previous.endSec - EPSILON) {
      fail(
        "locator_word_overlap",
        `Speech timing unit ${index + 1} overlaps the preceding unit in Segment "${unit.segmentId}".`,
      );
    }
    previousBySegment.set(unit.segmentId, unit);
  }
}

type TokenFrame = {
  startFrame: number;
  endFrameExclusive: number;
  quality: "estimated" | "derived" | "measured";
};

function lcsMatches(
  tokens: NarrativeIR["tokens"],
  units: SpeechTimingEvidence["units"],
): Array<[number, number]> {
  const rows = Array.from({ length: tokens.length + 1 }, () =>
    Array<number>(units.length + 1).fill(0));
  for (let left = tokens.length - 1; left >= 0; left -= 1) {
    for (let right = units.length - 1; right >= 0; right -= 1) {
      rows[left]![right] = tokens[left]!.normalized === normalizeWord(units[right]!.text)
        ? rows[left + 1]![right + 1]! + 1
        : Math.max(rows[left + 1]![right]!, rows[left]![right + 1]!);
    }
  }
  const matches: Array<[number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < tokens.length && right < units.length) {
    if (
      tokens[left]!.normalized === normalizeWord(units[right]!.text)
      && rows[left]![right] === rows[left + 1]![right + 1]! + 1
    ) {
      matches.push([left, right]);
      left += 1;
      right += 1;
    } else if (rows[left + 1]![right]! >= rows[left]![right + 1]!) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return matches;
}

function distributeFrames(
  tokens: NarrativeIR["tokens"],
  startFrame: number,
  endFrameExclusive: number,
  quality: TokenFrame["quality"],
): TokenFrame[] {
  if (!tokens.length) return [];
  const weights = tokens.map((token) => Math.max(1, [...token.normalized].length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let accumulated = 0;
  return tokens.map((_, index) => {
    const start = startFrame + Math.round((endFrameExclusive - startFrame) * accumulated / total);
    accumulated += weights[index]!;
    const end = index === tokens.length - 1
      ? endFrameExclusive
      : startFrame + Math.round((endFrameExclusive - startFrame) * accumulated / total);
    return { startFrame: start, endFrameExclusive: Math.max(start, end), quality };
  });
}

function alignSegment(
  tokens: NarrativeIR["tokens"],
  units: SpeechTimingEvidence["units"],
  segmentStartFrame: number,
  segmentEndFrame: number,
  basis: ProgramBasis,
  evidenceQuality: SpeechTimingEvidence["quality"],
): TokenFrame[] {
  const output: Array<TokenFrame | undefined> = Array(tokens.length).fill(undefined);
  const matches = lcsMatches(tokens, units);
  let tokenCursor = 0;
  let unitCursor = 0;
  for (let matchIndex = 0; matchIndex <= matches.length; matchIndex += 1) {
    const match = matches[matchIndex];
    const tokenEnd = match?.[0] ?? tokens.length;
    const unitEnd = match?.[1] ?? units.length;
    const tokenRun = tokens.slice(tokenCursor, tokenEnd);
    const unitRun = units.slice(unitCursor, unitEnd);
    if (tokenRun.length) {
      const previous = tokenCursor > 0 ? output[tokenCursor - 1] : undefined;
      const nextUnit = match ? units[unitEnd] : undefined;
      const startFrame = unitRun.length
        ? frameAt(unitRun[0]!.startSec, basis)
        : previous?.endFrameExclusive ?? segmentStartFrame;
      const endFrame = unitRun.length
        ? frameAt(unitRun.at(-1)!.endSec, basis)
        : nextUnit
          ? frameAt(nextUnit.startSec, basis)
          : segmentEndFrame;
      const quality = evidenceQuality === "estimated" || !unitRun.length
        ? "estimated" as const
        : "derived" as const;
      for (const [offset, value] of distributeFrames(
        tokenRun,
        startFrame,
        Math.max(startFrame, endFrame),
        quality,
      ).entries()) output[tokenCursor + offset] = value;
    }
    if (match) {
      const [tokenIndex, unitIndex] = match;
      const unit = units[unitIndex]!;
      output[tokenIndex] = {
        startFrame: frameAt(unit.startSec, basis),
        endFrameExclusive: frameAt(unit.endSec, basis),
        quality: evidenceQuality === "measured" ? "measured" : "estimated",
      };
      tokenCursor = tokenIndex + 1;
      unitCursor = unitIndex + 1;
    }
  }
  return output.map((value, index) => value
    ?? fail("locator_token_unmapped", `Script token ${index + 1} could not be aligned.`));
}

export function semanticMapFromTiming(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  evidence: SpeechTimingEvidence,
  options: { locatorDigest?: string; evidenceDigest?: string } = {},
): CompleteSemanticMap {
  validateProgramBasis(basis);
  validateSpeechTiming(narrative, basis, evidence);
  const segmentEvidence = new Map(evidence.segments.map((segment) => [segment.id, segment]));
  const tokenFrames = new Map<string, TokenFrame>();
  for (const segment of narrative.segments) {
    const measuredSegment = segmentEvidence.get(segment.id)!;
    const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEnd);
    const units = evidence.units.filter((unit) => unit.segmentId === segment.id);
    const aligned = alignSegment(
      tokens,
      units,
      frameAt(measuredSegment.startSec, basis),
      frameAt(measuredSegment.endSec, basis),
      basis,
      evidence.quality,
    );
    tokens.forEach((token, index) => tokenFrames.set(token.id, aligned[index]!));
  }
  const anchors: SemanticAnchorPoint[] = narrative.semanticIndex.anchors.map((anchor) => {
    const segment = segmentEvidence.get(anchor.segmentId);
    if (!segment) fail("locator_segment_missing", `Speech timing is missing Segment "${anchor.segmentId}".`);
    const token = anchor.tokenId ? tokenFrames.get(anchor.tokenId) : undefined;
    const frame = anchor.kind === "segment-start"
      ? frameAt(segment.startSec, basis)
      : anchor.kind === "segment-end"
        ? frameAt(segment.endSec, basis)
        : anchor.kind === "token-start"
          ? token?.startFrame
          : token?.endFrameExclusive;
    if (frame === undefined) {
      fail("locator_anchor_missing", `No speech timing exists for anchor "${anchor.id}".`);
    }
    return {
      identity: anchor.id,
      point: { basisDigest: basis.basisDigest, frame },
      quality: token?.quality ?? evidence.quality,
    };
  });
  const payload = {
    contract: "svml.complete-semantic-map.v1" as const,
    semanticIndexDigest: narrative.semanticIndex.digest,
    basisDigest: basis.basisDigest,
    anchors,
    evidenceDigests: [options.evidenceDigest ?? sha256(stableJson(evidence))],
    locatorDigest: options.locatorDigest ?? sha256("svml.script-timing-locator.v1"),
    quantizationPolicy: "nearest-frame" as const,
  };
  const map = { ...payload, mapDigest: semanticMapDigest(payload) };
  validateSemanticMap(narrative, basis, map);
  return map;
}

export function validateSemanticMap(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  map: SemanticMap,
): void {
  validateProgramBasis(basis);
  if (
    map.contract !== "svml.complete-semantic-map.v1"
  ) {
    fail("semantic_map_contract", "Unsupported SemanticMap contract.");
  }
  if (map.semanticIndexDigest !== narrative.semanticIndex.digest) {
    fail("semantic_map_index", "SemanticMap was produced for a different SemanticIndex.");
  }
  if (map.basisDigest !== basis.basisDigest) {
    fail("semantic_map_basis", "SemanticMap was produced for a different ProgramBasis.");
  }
  const { mapDigest, ...canonicalMap } = map;
  if (semanticMapDigest(canonicalMap) !== mapDigest) {
    fail("semantic_map_digest", "SemanticMap digest does not match its canonical contents.");
  }
  if (map.anchors.length !== narrative.semanticIndex.anchors.length) {
    fail(
      "semantic_map_cardinality",
      `SemanticMap has ${map.anchors.length} anchors; expected ${narrative.semanticIndex.anchors.length}.`,
    );
  }
  const pointById = new Map<string, number>();
  for (const [index, expected] of narrative.semanticIndex.anchors.entries()) {
    const actual = map.anchors[index];
    if (!actual || actual.identity !== expected.id) {
      fail(
        "semantic_map_identity",
        `SemanticMap anchor ${index + 1} must be "${expected.id}".`,
      );
    }
    integer(actual.point.frame, `SemanticMap point ${actual.identity}`);
    if (
      actual.point.basisDigest !== basis.basisDigest
      || actual.point.frame < 0
      || actual.point.frame > basis.durationFrames
    ) {
      fail("semantic_map_point", `SemanticMap anchor "${actual.identity}" is outside ProgramBasis.`);
    }
    if (!["measured", "derived", "estimated"].includes(actual.quality)) {
      fail("semantic_map_quality", `SemanticMap anchor "${actual.identity}" has invalid quality.`);
    }
    if (pointById.has(actual.identity)) {
      fail("semantic_map_duplicate", `SemanticMap repeats anchor "${actual.identity}".`);
    }
    pointById.set(actual.identity, actual.point.frame);
  }
  for (const segment of narrative.segments) {
    const ordered = [
      segment.startAnchorId,
      ...narrative.tokens.slice(segment.tokenStart, segment.tokenEnd)
        .flatMap((token) => [token.startAnchorId, token.endAnchorId]),
      segment.endAnchorId,
    ];
    for (let index = 1; index < ordered.length; index += 1) {
      if (pointById.get(ordered[index]!)! < pointById.get(ordered[index - 1]!)!) {
        fail("semantic_map_segment_order", `SemanticMap runs backwards inside Segment "${segment.id}".`);
      }
    }
  }
  for (let index = 1; index < narrative.segments.length; index += 1) {
    const previous = narrative.segments[index - 1]!;
    const current = narrative.segments[index]!;
    if (
      pointById.get(current.startAnchorId)! < pointById.get(previous.startAnchorId)!
      || pointById.get(current.endAnchorId)! < pointById.get(previous.endAnchorId)!
    ) {
      fail("semantic_map_source_order", `SemanticMap reorders Segment "${current.id}".`);
    }
  }
}

export function semanticPoints(map: SemanticMap): ReadonlyMap<string, number> {
  return new Map(map.anchors.map((anchor) => [anchor.identity, anchor.point.frame]));
}
