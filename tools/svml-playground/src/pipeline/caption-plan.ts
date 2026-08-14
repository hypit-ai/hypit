/**
 * Provisional caption phrasing, for a Source nobody has planned yet.
 *
 * Deciding which words share a screen is a judgement, and the package that
 * makes it asks a model. A preview cannot, so it falls back to the plainest
 * rule there is - a fixed number of Atoms per cue, in the order they were
 * written - and says the phrasing is a stand-in rather than a plan.
 */

/** The words a Source declared as captionable, in display order. */
type DisplaySequence = {
  readonly id: string;
  readonly atoms: readonly { readonly id: string; readonly wordIds?: readonly string[] }[];
};

/** Which words each run covers, and in which Style. The Program decides this. */
type Program = {
  readonly runs: readonly {
    readonly id: string;
    readonly styleId: string;
    readonly wordIds: readonly string[];
  }[];
};

/** How many Atoms share a screen when nobody has decided. */
const ATOMS_PER_CUE = 3;

/**
 * One run over the whole sequence, cut every few Atoms.
 *
 * Every Atom appears exactly once and in order, so the captions say what the
 * Source says; only where the line breaks fall is invented.
 */
export function evenCaptionPlan(display: DisplaySequence, program: Program): unknown {
  const runs = program.runs.map((run) => {
    const words = new Set(run.wordIds);
    // An Atom belongs to the run that covers the words it holds, so the phrasing
    // never moves a word out of the Style the Program gave it.
    const own = display.atoms.filter((atom) => (atom.wordIds ?? []).some((id) => words.has(id)));
    const cues: { id: string; atomIds: string[]; fields: never[] }[] = [];
    for (let index = 0; index < own.length; index += ATOMS_PER_CUE) {
      const atoms = own.slice(index, index + ATOMS_PER_CUE);
      cues.push({
        id: `${run.id}:cue:${String(cues.length + 1).padStart(4, "0")}`,
        atomIds: atoms.map((atom) => atom.id),
        fields: [],
      });
    }
    return { id: run.id, styleId: run.styleId, cues };
  });
  return { runs };
}

/** Whether a sequence has anything to phrase at all. */
export function hasAtoms(value: unknown): value is DisplaySequence {
  const held = value as DisplaySequence | undefined;
  return Array.isArray(held?.atoms) && held.atoms.length > 0;
}
