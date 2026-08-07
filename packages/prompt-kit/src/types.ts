export type PromptKitScalar = string | number | boolean;

export type PromptKitConditions = {
  readonly parameters: Readonly<Record<string, PromptKitScalar>>;
  readonly selectors: Readonly<Record<string, string>>;
};

export type PromptKitChoice = {
  readonly id: string;
  readonly text: string;
  readonly when: PromptKitConditions;
};

export type PromptKitFixedBlock = {
  readonly kind: "fixed";
  readonly id: string;
  readonly order: number;
  readonly text: string;
};

export type PromptKitAxisBlock = {
  readonly kind: "axis";
  readonly id: string;
  readonly order: number;
  readonly parameter: string;
  readonly choices: readonly PromptKitChoice[];
};

export type PromptKitVariantBlock = {
  readonly kind: "variant";
  readonly id: string;
  readonly order: number;
  readonly choices: readonly PromptKitChoice[];
};

export type PromptKitSlotBlock = {
  readonly kind: "slot";
  readonly id: string;
  readonly order: number;
  readonly slot: string;
  readonly optional: boolean;
  readonly label?: string;
};

export type PromptKitBlockSpec =
  | PromptKitFixedBlock
  | PromptKitAxisBlock
  | PromptKitVariantBlock
  | PromptKitSlotBlock;

export type PromptKitSpec = {
  readonly contract: "svml.prompt-kit-spec@1";
  readonly id: string;
  readonly separator: "\n\n";
  readonly defaults: Readonly<Record<string, PromptKitScalar>>;
  readonly blocks: readonly PromptKitBlockSpec[];
};

export type PromptKitInvocation = {
  readonly contract: "svml.prompt-kit-invocation@1";
  readonly parameters: Readonly<Record<string, PromptKitScalar>>;
  readonly selectors: Readonly<Record<string, string>>;
  readonly slots: Readonly<Record<string, string>>;
};

export type PromptProgramBlock = {
  readonly id: string;
  readonly text: string;
};

export type PromptProgram = {
  readonly contract: "svml.prompt-program@1";
  readonly separator: "\n\n";
  readonly blocks: readonly PromptProgramBlock[];
};
