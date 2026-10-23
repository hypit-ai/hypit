/**
 * Host-independent lexical order for Protocol text.
 *
 * Locale collation belongs at a presentation boundary. Protocol values, graph
 * identities and canonical records instead need the same order in every
 * process, regardless of the machine's language settings.
 */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
