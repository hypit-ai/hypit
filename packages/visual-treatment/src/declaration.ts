import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationFieldShape,
} from "@hypit/hypit/author";
import type { VisualAdjustmentEffect } from "@hypit/visual-adjustment";
import { visualAdjustmentTypes } from "@hypit/visual-adjustment";

import { visualTreatmentModuleRef } from "./manifest.js";
import {
  blurTreatment,
  colorTreatment,
  opacityTreatment,
  transformTreatment,
  type ColorTreatment,
  type TransformTreatment,
  type TreatmentEasing,
  type TreatmentKeyframe,
} from "./program.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string, fallback?: string): string {
  const value = field(node, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

function number(node: DeclarationNode, name: string, fallback: number): number {
  const value = Number(literal(node, name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${node.name}.${name} must be a finite number.`);
  return value;
}

function position(node: AuthorDeclarationChild): number {
  const source = literal(node, "at");
  if (source === "start") return 0;
  if (source === "end") return 1;
  const percentage = /^(?:100(?:\.0+)?|(?:\d|[1-9]\d)(?:\.\d+)?)%$/u.exec(source);
  if (percentage === null) throw new Error(`${node.name}.at must be start, end or a percentage from 0% to 100%.`);
  return Number(source.slice(0, -1)) / 100;
}

function easing(node: AuthorDeclarationChild): TreatmentEasing | undefined {
  return field(node, "easing") === undefined ? undefined : literal(node, "easing") as TreatmentEasing;
}

const easingValues = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
const keyframeFields = (fields: readonly AuthorDeclarationFieldShape[]): readonly AuthorDeclarationFieldShape[] => [
  { name: "at", kind: "literal", required: true, summary: "Places this complete state on normalized Adjustment progress." },
  ...fields.map((value) => ({ ...value, required: false })),
  { name: "easing", kind: "literal", required: false, values: easingValues, summary: "Shapes the interval leaving this state." },
];

function treatmentDeclaration(
  declaration: string,
  summary: string,
  fields: readonly AuthorDeclarationFieldShape[],
  compileStatic: (node: DeclarationNode, at: number, easing?: TreatmentEasing) => VisualAdjustmentEffect,
  compileAnimated: (children: readonly AuthorDeclarationChild[]) => VisualAdjustmentEffect,
): AuthorDeclarationCompiler {
  return {
    module: visualTreatmentModuleRef,
    declaration,
    outputs: [visualAdjustmentTypes.effect],
    shape: {
      summary,
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names this reusable Visual Adjustment Effect." },
        ...fields,
      ],
      children: [{ name: "Keyframe", cardinality: "many", summary: "Declares one complete effect state.", fields: keyframeFields(fields) }],
    },
    bindings(value) {
      const id = literal(value, "id");
      return [{ name: id, ref: { kind: "record", id }, type: visualAdjustmentTypes.effect }];
    },
    compile({ declaration: value }) {
      const id = literal(value, "id");
      const keyframes = value.children.filter((child) => child.name === "Keyframe");
      if (keyframes.length > 0 && fields.some(({ name }) => field(value, name) !== undefined)) {
        throw new Error(`${value.name} cannot combine top-level parameters with Keyframe children.`);
      }
      if (keyframes.length === 1) throw new Error(`${value.name} animated treatment requires at least two Keyframes.`);
      const effect = keyframes.length === 0 ? compileStatic(value, 0) : compileAnimated(keyframes);
      return { records: [{ id, type: visualAdjustmentTypes.effect, value: effect as never, range: value.range }], components: [] };
    },
  };
}

const transformFields = [
  ...["x", "y", "scale", "scale-x", "scale-y", "rotate", "origin-x", "origin-y"].map((name) => ({
    name, kind: "literal" as const, required: false, summary: `Supplies the Transform ${name} parameter.`,
  })),
] as const;

function transformState(node: DeclarationNode, at: number, keyframeEasing?: TreatmentEasing): TreatmentKeyframe<TransformTreatment> {
  const uniform = field(node, "scale") === undefined ? undefined : number(node, "scale", 1);
  if (uniform !== undefined && (field(node, "scale-x") !== undefined || field(node, "scale-y") !== undefined)) {
    throw new Error(`${node.name}.scale cannot be combined with scale-x or scale-y.`);
  }
  return {
    at,
    x: number(node, "x", 0), y: number(node, "y", 0),
    scaleX: uniform ?? number(node, "scale-x", 1), scaleY: uniform ?? number(node, "scale-y", 1),
    rotation: number(node, "rotate", 0), originX: number(node, "origin-x", 0.5), originY: number(node, "origin-y", 0.5),
    ...(keyframeEasing === undefined ? {} : { easing: keyframeEasing }),
  };
}

const colorFields = [
  ...["brightness", "contrast", "saturation", "hue", "grayscale", "sepia", "invert"].map((name) => ({
    name, kind: "literal" as const, required: false, summary: `Supplies the Color ${name} parameter.`,
  })),
] as const;

function colorState(node: DeclarationNode, at: number, keyframeEasing?: TreatmentEasing): TreatmentKeyframe<ColorTreatment> {
  return {
    at,
    brightness: number(node, "brightness", 1), contrast: number(node, "contrast", 1), saturation: number(node, "saturation", 1),
    hue: number(node, "hue", 0), grayscale: number(node, "grayscale", 0), sepia: number(node, "sepia", 0), invert: number(node, "invert", 0),
    ...(keyframeEasing === undefined ? {} : { easing: keyframeEasing }),
  };
}

export const transformAuthorDeclaration = treatmentDeclaration(
  "transform", "Applies an affine transform to one accumulated Picture.", transformFields,
  (node, at, value) => transformTreatment([transformState(node, at, value)]),
  (children) => transformTreatment(children.map((child) => transformState(child, position(child), easing(child)))),
);

export const opacityAuthorDeclaration = treatmentDeclaration(
  "opacity", "Changes the opacity of one accumulated Picture.",
  [{ name: "value", kind: "literal", required: false, fallback: 1, summary: "Supplies opacity from 0 to 1." }],
  (node, at, value) => opacityTreatment([{ at, value: number(node, "value", 1), ...(value === undefined ? {} : { easing: value }) }]),
  (children) => opacityTreatment(children.map((child) => ({ at: position(child), value: number(child, "value", 1), ...(easing(child) === undefined ? {} : { easing: easing(child)! }) }))),
);

export const blurAuthorDeclaration = treatmentDeclaration(
  "blur", "Applies Gaussian blur to one accumulated Picture.",
  [{ name: "radius", kind: "literal", required: false, fallback: 0, summary: "Supplies a non-negative blur radius in pixels." }],
  (node, at, value) => blurTreatment([{ at, radius: number(node, "radius", 0), ...(value === undefined ? {} : { easing: value }) }]),
  (children) => blurTreatment(children.map((child) => ({ at: position(child), radius: number(child, "radius", 0), ...(easing(child) === undefined ? {} : { easing: easing(child)! }) }))),
);

export const colorAuthorDeclaration = treatmentDeclaration(
  "color", "Applies one defined browser-sRGB basic colour operation.", colorFields,
  (node, at, value) => colorTreatment([colorState(node, at, value)]),
  (children) => colorTreatment(children.map((child) => colorState(child, position(child), easing(child)))),
);

export const visualTreatmentAuthorDeclarations = [
  transformAuthorDeclaration,
  opacityAuthorDeclaration,
  blurAuthorDeclaration,
  colorAuthorDeclaration,
] as const;

export const visualTreatmentMarkupDeclarations = [
  { name: "transform", tag: "Transform" },
  { name: "opacity", tag: "Opacity" },
  { name: "blur", tag: "Blur" },
  { name: "color", tag: "Color" },
] as const;
