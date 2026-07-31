import { fail } from "./diagnostics.js";
import type {
  AlignmentEvidence,
  ExactSemanticMap,
  EstimatedSemanticMap,
  NarrativeIR,
  ProgramBasis,
  SemanticAnchorPoint,
  SemanticMap,
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

function semanticMapDigest(map: Omit<SemanticMap, "mapDigest">): string {
  return sha256(stableJson(map));
}

function validateAlignment(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  evidence: AlignmentEvidence,
): void {
  if (evidence.contract !== "svml.speech-alignment.v1") {
    fail("locator_evidence_contract", `Unsupported alignment contract "${evidence.contract}".`);
  }
  if (
    !Number.isFinite(evidence.fps)
    || evidence.fps <= 0
    || !Number.isFinite(evidence.durationSec)
    || evidence.durationSec <= 0
  ) {
    fail("locator_evidence_clock", "Alignment evidence requires positive fps and duration.");
  }
  if (Math.abs(evidence.fps - basisFps(basis)) > EPSILON) {
    fail(
      "locator_basis_frame_rate",
      `Alignment fps ${evidence.fps} does not match ProgramBasis fps ${basisFps(basis)}.`,
    );
  }
  if (frameAt(evidence.durationSec, basis) !== basis.durationFrames) {
    fail(
      "locator_basis_duration",
      `Alignment duration resolves to ${frameAt(evidence.durationSec, basis)} frames; ProgramBasis has ${basis.durationFrames}.`,
    );
  }
  if (evidence.words.length !== narrative.tokens.length) {
    fail(
      "locator_word_cardinality",
      `Script has ${narrative.tokens.length} tokens but alignment has ${evidence.words.length}.`,
    );
  }
  if (evidence.segments.length !== narrative.segments.length) {
    fail(
      "locator_segment_cardinality",
      `Script has ${narrative.segments.length} Segments but alignment has ${evidence.segments.length}.`,
    );
  }

  const segments = new Map(evidence.segments.map((segment) => [segment.id, segment]));
  if (segments.size !== evidence.segments.length) {
    fail("locator_segment_duplicate", "Alignment evidence repeats a Segment id.");
  }
  for (const [index, segment] of narrative.segments.entries()) {
    const aligned = segments.get(segment.id);
    if (!aligned) fail("locator_segment_missing", `Alignment is missing Segment "${segment.id}".`);
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

  const previousBySegment = new Map<string, AlignmentEvidence["words"][number]>();
  for (const [index, token] of narrative.tokens.entries()) {
    const word = evidence.words[index];
    if (!word) fail("locator_word_missing", `Alignment is missing token ${index + 1}.`);
    if (normalizeWord(word.text) !== token.normalized || word.segmentId !== token.segmentId) {
      fail(
        "locator_word_mismatch",
        `Token ${index + 1} does not match alignment word "${word.text}" in Segment "${word.segmentId}".`,
      );
    }
    const segment = segments.get(word.segmentId);
    if (
      !segment
      || !Number.isFinite(word.startSec)
      || !Number.isFinite(word.endSec)
      || word.startSec < segment.startSec - EPSILON
      || word.endSec < word.startSec
      || word.endSec > segment.endSec + EPSILON
    ) {
      fail(
        "locator_word_window",
        `Alignment token ${index + 1} falls outside Segment "${word.segmentId}".`,
      );
    }
    const previous = previousBySegment.get(word.segmentId);
    if (previous && word.startSec < previous.endSec - EPSILON) {
      fail(
        "locator_word_overlap",
        `Alignment token ${index + 1} overlaps the preceding token in Segment "${word.segmentId}".`,
      );
    }
    previousBySegment.set(word.segmentId, word);
  }
}

export function semanticMapFromAlignment(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  evidence: AlignmentEvidence,
  options: { precision: "exact"; locatorDigest?: string },
): ExactSemanticMap;
export function semanticMapFromAlignment(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  evidence: AlignmentEvidence,
  options: { precision: "estimated"; locatorDigest?: string },
): EstimatedSemanticMap;
export function semanticMapFromAlignment(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  evidence: AlignmentEvidence,
  options: {
    precision: "estimated" | "exact";
    locatorDigest?: string;
  },
): EstimatedSemanticMap | ExactSemanticMap {
  validateProgramBasis(basis);
  validateAlignment(narrative, basis, evidence);
  const segmentEvidence = new Map(evidence.segments.map((segment) => [segment.id, segment]));
  const wordEvidence = new Map(narrative.tokens.map((token, index) => [token.id, evidence.words[index]!]));
  const quality = options.precision === "exact" ? "measured" : "estimated";
  const anchors: SemanticAnchorPoint[] = narrative.semanticIndex.anchors.map((anchor) => {
    const segment = segmentEvidence.get(anchor.segmentId);
    if (!segment) fail("locator_segment_missing", `Alignment is missing Segment "${anchor.segmentId}".`);
    const word = anchor.tokenId ? wordEvidence.get(anchor.tokenId) : undefined;
    const seconds = anchor.kind === "segment-start"
      ? segment.startSec
      : anchor.kind === "segment-end"
        ? segment.endSec
        : anchor.kind === "token-start"
          ? word?.startSec
          : word?.endSec;
    if (seconds === undefined) {
      fail("locator_anchor_missing", `No alignment time exists for anchor "${anchor.id}".`);
    }
    return {
      identity: anchor.id,
      point: { basisDigest: basis.basisDigest, frame: frameAt(seconds, basis) },
      quality,
    };
  });
  const contract = options.precision === "exact"
    ? "svml.exact-semantic-map.v1" as const
    : "svml.estimated-semantic-map.v1" as const;
  const payload = {
    contract,
    semanticIndexDigest: narrative.semanticIndex.digest,
    basisDigest: basis.basisDigest,
    anchors,
    evidenceDigests: [sha256(stableJson(evidence))],
    locatorDigest: options.locatorDigest ?? sha256(`svml.${options.precision}-speech-locator.v1`),
    quantizationPolicy: "nearest-frame" as const,
    ...(evidence.captionCues ? { captionCues: evidence.captionCues } : {}),
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
    map.contract !== "svml.estimated-semantic-map.v1"
    && map.contract !== "svml.exact-semantic-map.v1"
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
    if (map.contract === "svml.exact-semantic-map.v1" && actual.quality === "estimated") {
      fail("semantic_map_precision", `ExactSemanticMap anchor "${actual.identity}" is estimated.`);
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
