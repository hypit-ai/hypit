export function commandId(kind: "producer" | "need", subject: string): string {
  return `${kind}:${subject}`;
}
