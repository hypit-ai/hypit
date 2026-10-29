import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationFieldShape,
} from "@hypit/hypit/author";
import { visualTrackTypes } from "@hypit/visual-track";
import type { VisualTransitionEffect } from "@hypit/visual-track";

import { visualTransitionModuleRef } from "./manifest.js";
import {
  blurDissolveEffect,
  crossDissolveEffect,
  dipToColorEffect,
  irisEffect,
  linearWipeEffect,
  pushEffect,
  slideEffect,
  zoomDissolveEffect,
  type IrisShape,
  type TransitionDirection,
  type TransitionEasing,
} from "./program.js";

const easingValues = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
const directionValues = ["left", "right", "up", "down"] as const;
const irisShapeValues = ["circle", "box", "diamond"] as const;

function literal(declaration: AuthorDeclaration, name: string, fallback?: string): string {
  const value = declarationField(declaration, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

function number(declaration: AuthorDeclaration, name: string, fallback: number): number {
  const value = Number(literal(declaration, name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${declaration.name}.${name} must be a finite number.`);
  return value;
}

function transitionDeclaration(
  declaration: string,
  summary: string,
  fields: readonly AuthorDeclarationFieldShape[],
  compileEffect: (declaration: AuthorDeclaration) => VisualTransitionEffect,
): AuthorDeclarationCompiler {
  return {
    module: visualTransitionModuleRef,
    declaration,
    outputs: [visualTrackTypes.transitionEffect],
    shape: {
      summary,
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names this reusable transition effect." },
        ...fields,
      ],
    },
    bindings(value) {
      const id = literal(value, "id");
      return [{ name: id, ref: { kind: "record", id }, type: visualTrackTypes.transitionEffect }];
    },
    compile({ declaration: value }) {
      const id = literal(value, "id");
      return {
        records: [{ id, type: visualTrackTypes.transitionEffect, value: compileEffect(value) as never, range: value.range }],
        components: [],
      };
    },
  };
}

const easingField = (fallback: TransitionEasing): AuthorDeclarationFieldShape => ({
  name: "easing", kind: "literal", required: false, values: easingValues, fallback,
  summary: "Shapes normalized transition progress.",
});

const directionField = (fallback: TransitionDirection, summary: string): AuthorDeclarationFieldShape => ({
  name: "direction", kind: "literal", required: false, values: directionValues, fallback, summary,
});

export const crossDissolveAuthorDeclaration = transitionDeclaration(
  "cross-dissolve",
  "Blends two premultiplied-alpha Pictures with complementary weights.",
  [easingField("linear")],
  (declaration) => crossDissolveEffect(literal(declaration, "easing", "linear") as TransitionEasing),
);

export const dipToColorAuthorDeclaration = transitionDeclaration(
  "dip-to-color",
  "Fades the outgoing Picture to one opaque color, then fades into the incoming Picture.",
  [
    { name: "color", kind: "literal", required: false, fallback: "#000000", summary: "Selects a six- or eight-digit hexadecimal bridge color." },
    easingField("linear"),
  ],
  (declaration) => dipToColorEffect(literal(declaration, "color", "#000000"), literal(declaration, "easing", "linear") as TransitionEasing),
);

export const pushAuthorDeclaration = transitionDeclaration(
  "push",
  "Moves outgoing and incoming Pictures together as one continuous strip.",
  [directionField("left", "Selects the travel direction of both Pictures."), easingField("ease-in-out")],
  (declaration) => pushEffect(literal(declaration, "direction", "left") as TransitionDirection, literal(declaration, "easing", "ease-in-out") as TransitionEasing),
);

export const slideAuthorDeclaration = transitionDeclaration(
  "slide",
  "Moves the incoming Picture over a stationary outgoing Picture.",
  [directionField("left", "Selects the incoming Picture's travel direction."), easingField("ease-in-out")],
  (declaration) => slideEffect(literal(declaration, "direction", "left") as TransitionDirection, literal(declaration, "easing", "ease-in-out") as TransitionEasing),
);

export const linearWipeAuthorDeclaration = transitionDeclaration(
  "linear-wipe",
  "Reveals the incoming Picture behind one straight moving boundary.",
  [directionField("right", "Selects the direction in which the reveal boundary travels."), easingField("ease-in-out")],
  (declaration) => linearWipeEffect(literal(declaration, "direction", "right") as TransitionDirection, literal(declaration, "easing", "ease-in-out") as TransitionEasing),
);

export const irisAuthorDeclaration = transitionDeclaration(
  "iris",
  "Reveals the incoming Picture from the center through one geometric aperture.",
  [
    { name: "shape", kind: "literal", required: false, values: irisShapeValues, fallback: "circle", summary: "Selects the aperture geometry." },
    easingField("ease-in-out"),
  ],
  (declaration) => irisEffect(literal(declaration, "shape", "circle") as IrisShape, literal(declaration, "easing", "ease-in-out") as TransitionEasing),
);

export const zoomDissolveAuthorDeclaration = transitionDeclaration(
  "zoom-dissolve",
  "Blends two Pictures while their scales converge on the incoming Picture.",
  [
    { name: "strength", kind: "literal", required: false, fallback: 0.16, summary: "Controls scale displacement from 0 to 1." },
    easingField("ease-in-out"),
  ],
  (declaration) => zoomDissolveEffect(number(declaration, "strength", 0.16), literal(declaration, "easing", "ease-in-out") as TransitionEasing),
);

export const blurDissolveAuthorDeclaration = transitionDeclaration(
  "blur-dissolve",
  "Blends two Pictures through a shared blur peak.",
  [
    { name: "radius", kind: "literal", required: false, fallback: 20, summary: "Controls the midpoint blur radius in pixels, from 0 to 200." },
    easingField("ease-in-out"),
  ],
  (declaration) => blurDissolveEffect(number(declaration, "radius", 20), literal(declaration, "easing", "ease-in-out") as TransitionEasing),
);

export const visualTransitionAuthorDeclarations = [
  crossDissolveAuthorDeclaration,
  dipToColorAuthorDeclaration,
  pushAuthorDeclaration,
  slideAuthorDeclaration,
  linearWipeAuthorDeclaration,
  irisAuthorDeclaration,
  zoomDissolveAuthorDeclaration,
  blurDissolveAuthorDeclaration,
] as const;

export const visualTransitionMarkupDeclarations = [
  { name: "cross-dissolve", tag: "CrossDissolve" },
  { name: "dip-to-color", tag: "DipToColor" },
  { name: "push", tag: "Push" },
  { name: "slide", tag: "Slide" },
  { name: "linear-wipe", tag: "LinearWipe" },
  { name: "iris", tag: "Iris" },
  { name: "zoom-dissolve", tag: "ZoomDissolve" },
  { name: "blur-dissolve", tag: "BlurDissolve" },
] as const;
