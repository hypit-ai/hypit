function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ORDERED_BUILD_ID = /^bld_(\d{8}T\d{9}Z)_([0-9A-Z]{10})$/u;

function timestampText(value: number): string {
  assert(Number.isSafeInteger(value) && value >= 0, "Build time must be a non-negative safe integer");
  return new Date(value).toISOString()
    .replace(/[-:.]/gu, "")
    .replace(/(\d{8}T\d{6})(\d{3})Z/u, "$1$2Z");
}

/**
 * Create the one public, chronologically sortable Build identity form.
 *
 * The nonce exists only to keep independent submissions in the same millisecond distinct. It is
 * not a content digest and has no reuse, equality or storage semantics.
 */
export function orderedBuildId(createdAt: number, nonce: string): string {
  assert(/^[0-9A-Z]{10}$/u.test(nonce), "Build nonce must be ten upper-case alphanumeric characters");
  return `bld_${timestampText(createdAt)}_${nonce}`;
}

/** Submission time carried by an ordered Build id, or undefined for a non-public/internal id. */
export function buildIdCreatedAt(value: string): number | undefined {
  const match = ORDERED_BUILD_ID.exec(value);
  if (match === null) return undefined;
  const raw = match[1]!;
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    + `T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}.${raw.slice(15, 18)}Z`;
  const createdAt = Date.parse(iso);
  return Number.isFinite(createdAt) && timestampText(createdAt) === raw ? createdAt : undefined;
}

export function assertOrderedBuildId(value: string): void {
  assertBuildId(value);
  assert(buildIdCreatedAt(value) !== undefined,
    "Build id must contain its UTC submission time and a ten-character nonce");
}

/**
 * Runtime Build ids are opaque identities, but every durable Host currently
 * uses one id as one filesystem/S3 path segment. Keep that boundary explicit:
 * an id is never a path and the two dot directory entries are never Builds.
 */
export function assertBuildId(value: string): void {
  assert(value.length > 0 && value === value.trim(), "Build id must be a non-empty unpadded name");
  assert(value !== "." && value !== "..", "Build id must not be a dot directory");
  assert(!value.includes("/") && !value.includes("\\") && !value.includes("\0"),
    "Build id must be one path-free name");
}
