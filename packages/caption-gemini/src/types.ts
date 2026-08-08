import type {
  CaptionFieldAssignment,
  CaptionFieldDeclaration,
  CaptionFieldValueSchema,
  CaptionPlan,
  CaptionPlannedCue,
  CaptionPlannedRun,
  CaptionProgram,
} from "@narratage/caption";

export type {
  CaptionFieldAssignment,
  CaptionFieldDeclaration,
  CaptionFieldValueSchema,
  CaptionPlannedCue,
  CaptionPlannedRun,
  CaptionProgram,
};
export type CaptionGeminiPlan = CaptionPlan;

export type CaptionGeminiModel = "gemini-2.5-flash" | "gemini-3.1-pro-preview";

/** Explicit model choice. Cue and field meaning comes from the Caption Program, not the Provider. */
export type CaptionGeminiProgram = {
  readonly contract: "svml.caption-gemini-program@1";
  readonly model: CaptionGeminiModel;
};

export type CaptionPlanningAtom = {
  readonly id: string;
  /** Stable identities stay inside the compiled request; the model sees only the word surfaces. */
  readonly words: readonly { readonly id: string; readonly text: string }[];
};

export type CaptionPlanningRun = {
  readonly id: string;
  readonly styleId: string;
  readonly atoms: readonly CaptionPlanningAtom[];
  readonly cueMinimumWords: number;
  readonly cueMaximumWords: number;
  readonly cueInstruction: string;
  readonly fields: readonly CaptionFieldDeclaration[];
};

export type CaptionGeminiRequest = {
  readonly contract: "svml.caption-gemini-request@1";
  readonly model: CaptionGeminiModel;
  readonly runs: readonly CaptionPlanningRun[];
  readonly systemInstruction: string;
  readonly prompt: string;
  readonly temperature: 0.2;
};

export type RawCaptionGeminiResponse = {
  readonly runs: readonly {
    readonly cues: readonly {
      /** Number of consecutive unread atoms consumed by this Cue. */
      readonly atom_count: number;
      readonly fields: readonly {
        readonly declaration_id: string;
        /** One-based Atom position inside this Cue. */
        readonly atom_number: number;
        /** One-based display-word position inside that Atom. */
        readonly word_number: number;
        readonly value: string;
      }[];
    }[];
  }[];
};
