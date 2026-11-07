export type ProductAddress = {
  /** Stable identity of one closed Product publication, independent of its storage location. */
  readonly publication: string;
  /** Exact author-facing name inside that publication. */
  readonly name: string;
};

export function productAddress(publication: string, name: string): ProductAddress {
  if (publication.trim().length === 0) throw new Error("Product publication identity must not be empty");
  if (name.trim().length === 0) throw new Error("Product name must not be empty");
  return { publication, name };
}
