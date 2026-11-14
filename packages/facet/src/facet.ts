/** One package contribution understood only by the owner of its exact kind. */
export type Facet = {
  readonly kind: string;
  /** Optional logical address interpreted only by the owner of this kind. */
  readonly address?: string;
  readonly implementation: unknown;
};
