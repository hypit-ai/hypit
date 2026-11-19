/** Zero-based indices into a Segment's spoken words. */
export type SpokenRange = { readonly startWord: number; readonly endWordExclusive: number };
export type ScriptBoundary =
  | { readonly edge: "start" | "end"; readonly word: number }
  | { readonly edge: "segment-start" | "segment-end" };

export type ScriptSelection = { readonly start: ScriptBoundary; readonly end: ScriptBoundary };

export type ScriptWordAttribute = { readonly name: string; readonly value: string | number | boolean };
export type ScriptDisplayWord = {
  readonly text: string;
  readonly separatorBefore: "" | " ";
  readonly attributes: readonly ScriptWordAttribute[];
};

/** One display-to-speech correspondence. Every display word in it shares one timing window. */
export type ScriptUnit = {
  readonly id: number;
  readonly spoken: SpokenRange;
  readonly words: readonly ScriptDisplayWord[];
};

export type ScriptCue = { readonly id: number; readonly role?: string; readonly units: readonly ScriptUnit[] };
export type ScriptTurn = { readonly role?: string; readonly spoken: SpokenRange };

export type ScriptSegment = {
  readonly id: string;
  readonly spokenWords: readonly string[];
  readonly turns: readonly ScriptTurn[];
  readonly cues: readonly ScriptCue[];
  readonly moments: ReadonlyMap<string, ScriptBoundary>;
  readonly selections: ReadonlyMap<string, ScriptSelection>;
};

export type ScriptDocument = { readonly segments: ReadonlyMap<string, ScriptSegment> };
