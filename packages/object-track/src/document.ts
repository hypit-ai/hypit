import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
  type ExactTemporalValue,
  type LocalTemporalDomain,
} from "@hypit/temporal/algebra";

export type ObjectTrackRegion = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ObjectTrackSample = {
  readonly at: ExactTemporalValue;
  /** `null` is an authored missing observation, not a request to guess or interpolate. */
  readonly region: ObjectTrackRegion | null;
};

export type ObjectTrack = {
  readonly id: string;
  readonly label?: string;
  readonly samples: readonly ObjectTrackSample[];
};

export type ObjectTrackDocument = {
  readonly format: "hypit.object-track@1";
  readonly id: string;
  readonly domain: LocalTemporalDomain;
  readonly tracks: readonly ObjectTrack[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as Readonly<Record<string, unknown>>;
}

function exactFields(value: Readonly<Record<string, unknown>>, names: readonly string[], label: string): void {
  const expected = [...names].sort().join("\u0000");
  assert(Object.keys(value).sort().join("\u0000") === expected, `${label} has invalid fields.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertRegion(value: unknown, label: string): asserts value is ObjectTrackRegion {
  const region = object(value, label);
  exactFields(region, ["height", "width", "x", "y"], label);
  for (const [name, amount] of Object.entries(region)) {
    assert(typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= 1,
      `${label}.${name} is invalid.`);
  }
  assert((region.x as number) + (region.width as number) <= 1
    && (region.y as number) + (region.height as number) <= 1, `${label} exceeds normalized media display space.`);
}

export function assertObjectTrackDocument(value: unknown): asserts value is ObjectTrackDocument {
  const document = object(value, "ObjectTrackDocument");
  exactFields(document, ["domain", "format", "id", "tracks"], "ObjectTrackDocument");
  assert(document.format === "hypit.object-track@1", "Unsupported Object Track document format.");
  identity(document.id, "ObjectTrackDocument.id");
  assertLocalTemporalDomain(document.domain as LocalTemporalDomain);
  const domain = document.domain as LocalTemporalDomain;
  assert(Array.isArray(document.tracks) && document.tracks.length > 0, "ObjectTrackDocument.tracks is empty.");
  const identities = new Set<string>();
  for (const [trackIndex, valueTrack] of document.tracks.entries()) {
    const label = `ObjectTrackDocument.tracks[${trackIndex}]`;
    const track = object(valueTrack, label);
    exactFields(track, ["id", ...(track.label === undefined ? [] : ["label"]), "samples"], label);
    identity(track.id, `${label}.id`);
    assert(!identities.has(track.id), `ObjectTrackDocument repeats Track ${track.id}.`);
    identities.add(track.id);
    if (track.label !== undefined) {
      assert(typeof track.label === "string" && track.label.trim().length > 0, `${label}.label is invalid.`);
    }
    assert(Array.isArray(track.samples) && track.samples.length > 0, `${label}.samples is empty.`);
    let previous: ExactTemporalValue | undefined;
    for (const [sampleIndex, valueSample] of track.samples.entries()) {
      const sampleLabel = `${label}.samples[${sampleIndex}]`;
      const sample = object(valueSample, sampleLabel);
      exactFields(sample, ["at", "region"], sampleLabel);
      assertExactTemporalValue(sample.at as ExactTemporalValue, `${sampleLabel}.at`);
      const at = sample.at as ExactTemporalValue;
      assert(compareExactTemporalValues(at, exactTemporalZero()) >= 0
        && compareExactTemporalValues(at, domain.duration) <= 0, `${sampleLabel}.at lies outside the document domain.`);
      assert(previous === undefined || compareExactTemporalValues(previous, at) < 0,
        `${label} sample times must increase.`);
      previous = at;
      if (sample.region !== null) assertRegion(sample.region, `${sampleLabel}.region`);
    }
  }
}

export function sealObjectTrackDocument(value: ObjectTrackDocument): ObjectTrackDocument {
  assertObjectTrackDocument(value);
  return structuredClone(value);
}

export function parseObjectTrackDocument(source: string): ObjectTrackDocument {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) {
    throw new Error(`Object Track document is not JSON: ${error instanceof Error ? error.message : "invalid input"}`);
  }
  assertObjectTrackDocument(value);
  return structuredClone(value);
}

export function serializeObjectTrackDocument(value: ObjectTrackDocument): string {
  assertObjectTrackDocument(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

/** Select one direct observation; the caller explicitly chooses exact or previous sampling. */
export function objectTrackSampleAt(
  value: ObjectTrackDocument,
  trackId: string,
  at: ExactTemporalValue,
  sampling: "exact" | "previous",
): ObjectTrackSample | undefined {
  assertObjectTrackDocument(value);
  assertExactTemporalValue(at, "Object Track query time");
  const track = value.tracks.find((candidate) => candidate.id === trackId);
  if (track === undefined) throw new Error(`ObjectTrackDocument has no Track ${trackId}.`);
  const selected = sampling === "exact"
    ? track.samples.find((sample) => compareExactTemporalValues(sample.at, at) === 0)
    : [...track.samples].reverse().find((sample) => compareExactTemporalValues(sample.at, at) <= 0);
  return selected === undefined ? undefined : structuredClone(selected);
}
