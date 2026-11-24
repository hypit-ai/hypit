import { useMemo, useState } from "react";
import { flushSync } from "react-dom";

type Move = { readonly id: string; readonly before: string | undefined };

/** Project released moves onto an ordered list until their receipts arrive. */
export function useGestureOrder<T extends { readonly id: string }>(
  entries: readonly T[],
  onMove: (id: string, before?: string) => Promise<void>,
) {
  const [moves, setMoves] = useState<readonly Move[]>([]);
  const ordered = useMemo(() => {
    if (moves.length === 0) return entries;
    const next = [...entries];
    for (const { id, before } of moves) {
      const from = next.findIndex(entry => entry.id === id);
      const to = before === undefined ? next.length : next.findIndex(entry => entry.id === before);
      if (from < 0 || to < 0 || from === to) continue;
      const [entry] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, entry!);
    }
    return next;
  }, [entries, moves]);

  const submit = (id: string, before: string | undefined) => {
    const move = { id, before };
    flushSync(() => setMoves(previous => [...previous, move]));
    const settle = () => setMoves(previous => previous.filter(pending => pending !== move));
    void onMove(id, before).then(settle, settle);
  };

  return { ordered, order: ordered.map(entry => entry.id).join("\0"), pending: moves.length > 0, submit };
}
