import { useEffect, useLayoutEffect, useRef } from "react";
import type { NleStudioOpenProjection } from "../protocol.js";
import { editableSelection } from "./selection.js";

type Position = { readonly frame: number; readonly selection: readonly string[] };
type EditorPosition = { previewExpanded: boolean; positions: Record<string, Position> };

function read(key: string): EditorPosition {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as EditorPosition | null;
    return { previewExpanded: value?.previewExpanded === true,
      positions: value?.positions && typeof value.positions === "object" && !Array.isArray(value.positions) ? value.positions : {} };
  } catch { return { previewExpanded: false, positions: {} }; }
}

export function useEditorPosition(session: NleStudioOpenProjection | undefined, value: Position & { readonly previewExpanded: boolean }, navigationFrame: { current: number | undefined }, restore: (position: Position & { readonly previewExpanded: boolean }) => void) {
  const key = session === undefined ? undefined : `hypit:nle:position:${session.project.name}/${session.project.document}`;
  const composition = session?.timeline.scene.composition;
  const active = useRef<{ key: string; composition: string; saved: EditorPosition } | undefined>(undefined);
  const restoring = useRef(false);
  const restoreRef = useRef(restore); restoreRef.current = restore;

  useLayoutEffect(() => {
    if (!key || !composition || !session) return;
    const initial = active.current?.key !== key;
    const saved = initial ? read(key) : active.current!.saved;
    active.current = { key, composition, saved };
    const position = saved.positions[composition];
    restoring.current = true;
    const frame = navigationFrame.current;
    navigationFrame.current = undefined;
    restoreRef.current({
      frame: frame ?? (Number.isSafeInteger(position?.frame)
        ? Math.max(0, Math.min(session.timeline.scene.maximumFrame - 1, position!.frame)) : 0),
      selection: editableSelection(session.timeline.scene, Array.isArray(position?.selection) ? position.selection.filter(id => typeof id === "string") : []),
      previewExpanded: initial ? saved.previewExpanded : value.previewExpanded,
    });
  }, [key, composition]);

  useEffect(() => {
    if (!key || !composition || !active.current) return;
    if (restoring.current) { restoring.current = false; return; }
    const saved = active.current.saved;
    saved.previewExpanded = value.previewExpanded;
    saved.positions[composition] = { frame: value.frame, selection: [...value.selection] };
    const write = () => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* The open editing session remains usable when browser storage is unavailable. */ } };
    const timer = setTimeout(write, 250);
    window.addEventListener("pagehide", write);
    return () => { clearTimeout(timer); write(); window.removeEventListener("pagehide", write); };
  }, [key, composition, value.frame, value.selection, value.previewExpanded]);
}
