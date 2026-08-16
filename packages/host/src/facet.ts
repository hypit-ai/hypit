/** One package contribution understood only by the Host that owns its ABI. */
export type HostFacet = {
  readonly abi: string;
  readonly offers?: readonly string[];
  readonly implementation: unknown;
};
