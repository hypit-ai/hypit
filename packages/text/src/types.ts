export type Text = {
  readonly contract: "svml.text@1";
  readonly value: string;
};

export type TextScalar = string | number | boolean;
export type TextBindingValue = TextScalar | readonly TextScalar[];

export type TextBindings = {
  readonly contract: "svml.text-bindings@1";
  readonly values: Readonly<Record<string, TextBindingValue>>;
};

/** Instructions for attaching one graph Text edge to a named template input. */
export type TextBinding = {
  readonly contract: "svml.text-binding@1";
  readonly name: string;
  readonly mode: "set" | "append";
};

export type TextCondition =
  | { readonly kind: "present"; readonly binding: string }
  | { readonly kind: "equals"; readonly binding: string; readonly value: TextScalar }
  | { readonly kind: "all"; readonly conditions: readonly TextCondition[] }
  | { readonly kind: "any"; readonly conditions: readonly TextCondition[] }
  | { readonly kind: "not"; readonly condition: TextCondition };

export type TextTransform =
  | { readonly kind: "trim" }
  | { readonly kind: "trim-start" }
  | { readonly kind: "trim-end" }
  | { readonly kind: "uppercase" }
  | { readonly kind: "lowercase" }
  | { readonly kind: "collapse-whitespace" }
  | { readonly kind: "normalize-newlines" }
  | { readonly kind: "json-string" };

export type TextExpression =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "slot"; readonly binding: string }
  | { readonly kind: "sequence"; readonly items: readonly TextExpression[] }
  | {
      readonly kind: "join";
      readonly separator: string;
      readonly omitEmpty?: boolean;
      readonly items: readonly TextExpression[];
    }
  | {
      readonly kind: "choice";
      readonly cases: readonly { readonly when: TextCondition; readonly value: TextExpression }[];
      readonly otherwise?: TextExpression;
    }
  | { readonly kind: "optional"; readonly when: TextCondition; readonly value: TextExpression }
  | {
      readonly kind: "each";
      readonly binding: string;
      readonly as: string;
      readonly separator: string;
      readonly value: TextExpression;
    }
  | {
      readonly kind: "replace";
      readonly input: TextExpression;
      readonly replacements: readonly {
        readonly from: string;
        readonly to: string;
        readonly mode: "first" | "all";
      }[];
    }
  | {
      readonly kind: "transform";
      readonly input: TextExpression;
      readonly transforms: readonly TextTransform[];
    }
  | { readonly kind: "call"; readonly template: string };

/**
 * A finite, data-only text program. Definitions share the caller's explicit
 * bindings; `call` cannot pass hidden state or execute arbitrary code.
 */
export type TextTemplate = {
  readonly contract: "svml.text-template@1";
  readonly root: TextExpression;
  readonly defaults?: Readonly<Record<string, TextBindingValue>>;
  readonly definitions?: Readonly<Record<string, TextExpression>>;
};
