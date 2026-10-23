import { htmlAdjustment } from "@hypit/html-program";
import type { Recipe } from "@hypit/hypit/recipe";
import type { VisualAdjustmentSpec } from "./types.js";
import { visualAdjustmentProperties } from "./author.js";

const properties = visualAdjustmentProperties.map((property) => property.name);
const fallback = (name: string): number => visualAdjustmentProperties.find((property) => property.name === name)!.fallback;

function number(value: Recipe["properties"][string] | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`Visual Adjustment Recipe ${name} must be a finite number.`);
  return parsed;
}

export function visualAdjustmentSpecFromRecipe(
  id: string,
  recipe: Recipe,
): VisualAdjustmentSpec {
  const unknown = Object.keys(recipe.properties).filter((name) => !properties.includes(name as typeof properties[number]));
  if (unknown.length > 0) throw new Error(`Visual Adjustment Recipe has unknown properties: ${unknown.join(", ")}.`);
  const blur = number(recipe.properties.blur, "blur", fallback("blur"));
  const brightness = number(recipe.properties.brightness, "brightness", fallback("brightness"));
  const contrast = number(recipe.properties.contrast, "contrast", fallback("contrast"));
  const saturation = number(recipe.properties.saturation, "saturation", fallback("saturation"));
  const hue = number(recipe.properties.hue, "hue", fallback("hue"));
  const grayscale = number(recipe.properties.grayscale, "grayscale", fallback("grayscale"));
  const sepia = number(recipe.properties.sepia, "sepia", fallback("sepia"));
  const invert = number(recipe.properties.invert, "invert", fallback("invert"));
  const opacity = number(recipe.properties.opacity, "opacity", fallback("opacity"));
  const translateX = number(recipe.properties["translate-x"], "translate-x", fallback("translate-x"));
  const translateY = number(recipe.properties["translate-y"], "translate-y", fallback("translate-y"));
  const scaleX = number(recipe.properties["scale-x"], "scale-x", fallback("scale-x"));
  const scaleY = number(recipe.properties["scale-y"], "scale-y", fallback("scale-y"));
  const rotation = number(recipe.properties.rotation, "rotation", fallback("rotation"));
  const originX = number(recipe.properties["origin-x"], "origin-x", fallback("origin-x"));
  const originY = number(recipe.properties["origin-y"], "origin-y", fallback("origin-y"));
  if (blur < 0 || brightness < 0 || contrast < 0 || saturation < 0
    || grayscale < 0 || grayscale > 1 || sepia < 0 || sepia > 1 || invert < 0 || invert > 1
    || opacity < 0 || opacity > 1 || scaleX <= 0 || scaleY <= 0
    || originX < 0 || originX > 1 || originY < 0 || originY > 1) {
    throw new Error("Visual Adjustment Recipe values are outside their domains.");
  }
  const filter = [
    blur === 0 ? undefined : `blur(${blur}px)`,
    brightness === 1 ? undefined : `brightness(${brightness})`,
    contrast === 1 ? undefined : `contrast(${contrast})`,
    saturation === 1 ? undefined : `saturate(${saturation})`,
    hue === 0 ? undefined : `hue-rotate(${hue}deg)`,
    grayscale === 0 ? undefined : `grayscale(${grayscale})`,
    sepia === 0 ? undefined : `sepia(${sepia})`,
    invert === 0 ? undefined : `invert(${invert})`,
  ].filter((value): value is string => value !== undefined).join(" ") || "none";
  const transform = [
    translateX === 0 && translateY === 0 ? undefined : `translate(${translateX}px, ${translateY}px)`,
    rotation === 0 ? undefined : `rotate(${rotation}deg)`,
    scaleX === 1 && scaleY === 1 ? undefined : `scale(${scaleX}, ${scaleY})`,
  ].filter((value): value is string => value !== undefined).join(" ") || "none";
  return {
    id,
    program: htmlAdjustment({
      filter,
      ...(opacity === 1 ? {} : { opacity }),
      ...(transform === "none" ? {} : { transform, transformOrigin: `${originX * 100}% ${originY * 100}%` }),
    }),
  };
}
