/** Parse the CLI's unsigned decimal-integer spelling without accepting JavaScript numeric syntax. */
export function parseCliDecimalInteger(value: string): number | undefined {
  if (!/^[0-9]+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
