export type Prompt = {
  readonly value: string;
};

export type PromptTemplateFixedPart = {
  readonly kind: "fixed";
  readonly name: string;
  readonly text: string;
};

export type PromptTemplateChoicePart = {
  readonly kind: "choice";
  readonly name: string;
  readonly default: string;
  readonly options: readonly {
    readonly name: string;
    readonly text: string;
  }[];
};

export type PromptTemplateSlotPart = {
  readonly kind: "slot";
  readonly name: string;
  readonly required: boolean;
  readonly label?: string;
};

export type PromptTemplatePart =
  | PromptTemplateFixedPart
  | PromptTemplateChoicePart
  | PromptTemplateSlotPart;

/** One finite prompt assembly owned by its author package. Child order is output order. */
export type PromptTemplate = {
  readonly separator: "paragraph";
  readonly parts: readonly PromptTemplatePart[];
};

/** Reusable author choices. Every consumer validates them against its selected Template. */
export type PromptPreset = {
  readonly values: Readonly<Record<string, string>>;
};

export type PromptBindings = {
  readonly values: Readonly<Record<string, string>>;
  readonly slots: Readonly<Record<string, string>>;
};

export type PromptSlotBinding = {
  readonly name: string;
};
