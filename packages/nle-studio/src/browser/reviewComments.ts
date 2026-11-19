import { useCallback, useSyncExternalStore } from "react";
import type { NleStudioSession } from "../protocol.js";

/**
 * Review comments — a frontend-only demonstration prototype for Studio's review mode.
 *
 * Comments live in this browser's localStorage only: they are not Project facts, are not written to the NLE
 * document and never reach another browser or machine. The durable owner for review feedback is the Feedback
 * domain (design/system-constitution.md), which has no implementation yet.
 */
export type ReviewComment = {
  readonly id: string;
  /** Sequential label shown as #n, stable for the comment's lifetime within its composition. */
  readonly number: number;
  readonly composition: string;
  readonly frame: number;
  readonly text: string;
  readonly resolved: boolean;
  readonly created: number;
};

export function reviewStorageKey(session: NleStudioSession): string {
  return `hypit:nle:review-comments:${session.open.project.project.id}/${session.projectDocument.path}`;
}

const empty: readonly ReviewComment[] = [];
const cache = new Map<string, readonly ReviewComment[]>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): readonly ReviewComment[] {
  const cached = cache.get(key);
  if (cached) return cached;
  let value: readonly ReviewComment[] = empty;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(parsed)) value = parsed.filter((entry: Partial<ReviewComment>) => typeof entry?.number === "number") as ReviewComment[];
  } catch { /* unavailable or corrupt storage leaves the prototype empty */ }
  cache.set(key, value);
  return value;
}

function write(key: string, next: readonly ReviewComment[]) {
  cache.set(key, next);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* the prototype keeps working in memory */ }
  listeners.get(key)?.forEach(listener => listener());
}

if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === null || !listeners.has(event.key)) return;
  cache.delete(event.key);
  listeners.get(event.key)?.forEach(listener => listener());
});

export function useReviewComments(key: string, composition: string) {
  const all = useSyncExternalStore(useCallback((listener: () => void) => {
    const set = listeners.get(key) ?? new Set(); set.add(listener); listeners.set(key, set);
    return () => { set.delete(listener); };
  }, [key]), () => read(key));
  const comments = all.filter(comment => comment.composition === composition);
  const update = useCallback((id: string, change: Partial<Pick<ReviewComment, "text" | "resolved">>) => {
    write(key, read(key).map(comment => comment.id === id ? { ...comment, ...change } : comment));
  }, [key]);
  const add = useCallback((frame: number, text: string) => {
    const number = Math.max(0, ...read(key).filter(comment => comment.composition === composition).map(comment => comment.number)) + 1;
    write(key, [...read(key), { id: crypto.randomUUID(), number, composition, frame, text, resolved: false, created: Date.now() }]);
  }, [key, composition]);
  const remove = useCallback((id: string) => { write(key, read(key).filter(comment => comment.id !== id)); }, [key]);
  /** Replace this composition's comments: the prototype's sample-data action. */
  const replace = useCallback((next: readonly ReviewComment[]) => {
    write(key, [...read(key).filter(comment => comment.composition !== composition), ...next]);
  }, [key, composition]);
  return { comments, add, update, remove, replace };
}

/** `mm:ss.cc` — minutes, seconds and hundredths, as review timecodes read. */
export function reviewTime(frame: number, fps: number, padMinutes = true): string {
  const centis = Math.max(0, Math.round(frame / Math.max(1, fps) * 100));
  const minutes = Math.floor(centis / 6000), seconds = Math.floor(centis / 100) % 60, rest = centis % 100;
  return `${padMinutes ? String(minutes).padStart(2, "0") : minutes}:${String(seconds).padStart(2, "0")}.${String(rest).padStart(2, "0")}`;
}
