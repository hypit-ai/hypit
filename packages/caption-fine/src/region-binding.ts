import type { FineCaptionRegionBindings } from "./types.js";

export function assertFineCaptionRegionBindings(value: FineCaptionRegionBindings): void {
  if (value === null || typeof value !== "object" || !Array.isArray(value.bindings) || value.bindings.length === 0) {
    throw new Error("FineCaptionRegionBindings must contain at least one binding.");
  }
  const roles = new Set<string>();
  for (const binding of value.bindings) {
    if (binding === null || typeof binding !== "object"
      || typeof binding.role !== "string" || binding.role.trim().length === 0
      || roles.has(binding.role)) {
      throw new Error(`FineCaptionRegionBindings repeats or omits role ${String(binding?.role)}.`);
    }
    roles.add(binding.role);
    if (typeof binding.seriesId !== "string" || binding.seriesId.trim().length === 0) {
      throw new Error(`FineCaptionRegionBindings role ${binding.role} must name one series.`);
    }
    if (binding.missing !== "hide" && binding.missing !== "authored-placement") {
      throw new Error(`FineCaptionRegionBindings role ${binding.role} has an invalid missing policy.`);
    }
  }
}
