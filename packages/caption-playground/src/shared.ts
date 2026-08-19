import type { CaptionStyleIntent } from "@hypit/caption";
import type { OpenFontCategory, OpenFontStyle } from "@hypit/fonts-open";
import type { CaptionDisplaySequence } from "@hypit/narrative";
import type { CanonicalValue, ValueSchema } from "@hypit/protocol";

export type CaptionPlaygroundFont = {
  readonly id: string;
  readonly label: string;
  readonly category: OpenFontCategory;
  readonly intendedUse: string;
  readonly license: string;
  readonly weights: readonly number[];
  readonly styles: readonly OpenFontStyle[];
  readonly previewWeight: number;
  readonly previewStyle: OpenFontStyle;
};

export type CaptionPlaygroundSnapshot = {
  readonly revision: number;
  readonly style: CaptionStyleIntent;
  readonly display: CaptionDisplaySequence;
  readonly recipe: {
    readonly file: string;
    readonly path: string;
    readonly values: Readonly<Record<string, CanonicalValue>>;
    readonly schema: ValueSchema;
  };
  readonly font: {
    readonly file: string;
    readonly id: string;
    readonly family: string;
    readonly weight: number;
    readonly style: OpenFontStyle;
  };
  readonly preview: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
  };
  readonly fonts: readonly CaptionPlaygroundFont[];
  readonly artifacts: readonly {
    readonly digest: string;
    readonly mediaType: string;
    readonly size: number;
  }[];
};

export type CaptionPlaygroundFailure = {
  readonly revision: number;
  readonly error: string;
};

export type RecipePatch = {
  readonly name: string;
  readonly value?: CanonicalValue;
  readonly remove?: true;
};

export type FontPatch = {
  readonly family: string;
  readonly weight: number;
  readonly style: OpenFontStyle;
};
