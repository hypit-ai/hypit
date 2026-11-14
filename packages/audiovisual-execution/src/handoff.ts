import type {
  AudiovisualExecutionPlan,
  BoundAudiovisualExecutionPlan,
  DerivedRenderProductBinding,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Bind every cross-terminal product to one explicitly selected representation.
 * Format selection and compatibility policy belong to the caller and terminal
 * packages; this step performs no discovery or fallback.
 */
export function bindAudiovisualExecutionProducts(
  plan: AudiovisualExecutionPlan,
  bindings: readonly DerivedRenderProductBinding[],
): BoundAudiovisualExecutionPlan {
  const requirements = new Map(plan.products.map((product) => [product.id, product]));
  const selected = new Map<string, DerivedRenderProductBinding>();
  for (const binding of bindings) {
    const requirement = requirements.get(binding.product);
    assert(requirement !== undefined,
      `Derived render product binding references unknown product ${binding.product}.`);
    assert(!selected.has(binding.product),
      `Derived render product ${binding.product} is bound more than once.`);
    assert(typeof binding.representation === "string" && binding.representation.length > 0,
      `Derived render product ${binding.product} representation is empty.`);
    selected.set(binding.product, structuredClone(binding));
  }
  for (const requirement of plan.products) assert(selected.has(requirement.id),
    `Derived render product ${requirement.id} has no representation binding.`);
  return {
    ...structuredClone(plan),
    productBindings: plan.products.map((product) => selected.get(product.id)!),
  };
}
