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

export type CaptionPlanningWord = {
  readonly id: string;
  readonly text: string;
};

export type CaptionPlanningRun = {
  readonly id: string;
  readonly styleId: string;
  readonly wordIds: readonly string[];
  readonly cueMinimumWords: number;
  readonly cueMaximumWords: number;
  readonly cueInstruction: string;
  readonly fields: readonly CaptionFieldDeclaration[];
};

export type CaptionGeminiRequest = {
  readonly contract: "svml.caption-gemini-request@1";
  readonly model: CaptionGeminiModel;
  readonly words: readonly CaptionPlanningWord[];
  readonly runs: readonly CaptionPlanningRun[];
  readonly systemInstruction: string;
  readonly prompt: string;
  readonly temperature: 0.2;
};

export type RawCaptionGeminiResponse = {
  readonly runs: readonly {
    readonly run_id: string;
    readonly cues: readonly {
      readonly after_word_id: string;
      readonly fields: readonly {
        readonly declaration_id: string;
        readonly word_id: string;
        readonly value: string;
      }[];
    }[];
  }[];
};
