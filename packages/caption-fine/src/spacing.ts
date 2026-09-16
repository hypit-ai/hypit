/**
 * Where a word gap belongs between two adjacent display surfaces.
 *
 * Karaoke draws each Display Word as its own box, so the space between two words is CSS rather
 * than text. Script records which boundaries the author wrote a space at, and a boundary either
 * carries the Style's `word-gap` or carries nothing.
 */

/** Every boundary in order. The first surface opens the run, so its entry is always `false`. */
export function wordGaps(spacedBefore: readonly boolean[]): readonly boolean[] {
  return spacedBefore.map((spaced, index) => index > 0 && spaced);
}

/**
 * A run whose boundaries all agree carries one `column-gap` on its container. A mixed run cannot,
 * because `column-gap` is uniform, and takes a margin per element instead.
 */
export function uniformGap(gaps: readonly boolean[]): boolean | undefined {
  const boundaries = gaps.slice(1);
  if (boundaries.length === 0) return false;
  if (boundaries.every((gap) => gap)) return true;
  return boundaries.some((gap) => gap) ? undefined : false;
}

/** Join surfaces back into prose, spacing only the boundaries that carry a gap. */
export function joinSurfaces(
  surfaces: readonly string[],
  gaps: readonly boolean[],
  separator: string,
): string {
  return surfaces.map((surface, index) => (gaps[index] ? `${separator}${surface}` : surface)).join("");
}
