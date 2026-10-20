/** One package contribution understood only by the owner of its exact ABI. */
export type Facet = {
  readonly abi: string;
  /** Optional logical address interpreted only by the owner of this exact ABI. */
  readonly address?: string;
  readonly implementation: unknown;
};
