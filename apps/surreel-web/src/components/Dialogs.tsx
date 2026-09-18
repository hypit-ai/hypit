import { useEffect, useRef, type ReactNode } from "react";

function closeStudioDialog() {
  window.location.hash = "#/queue";
}

function DialogFrame({
  titleId,
  children,
}: {
  titleId: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const pick = () =>
      Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input, textarea, select")).filter(
        (element) => !element.hasAttribute("disabled"),
      );
    pick()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStudioDialog();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = pick();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="dialog-scrim" role="presentation" onClick={(event) => event.target === event.currentTarget && closeStudioDialog()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {children}
      </div>
    </div>
  );
}

export function HelpDialog() {
  return (
    <DialogFrame titleId="help-title">
      <h2 id="help-title">Paste a page. Keep a take.</h2>
      <p>Drop a product or site URL. Browser Use opens the live page, follows what explains the offer, and writes a facts-only brief. Swipe the format wheel to rotate the chosen type. Past takes use the same wheel — turn it, tap the front film to fill the screen, then Details if you need the project. Then each angle uses its Surreel packs and Hypit playbook. Motion renders on Seedance 2 Fast only. Captions come from Hypit caption craft on the finished plate, never burned by Seedance and never transcribed from the film. A take that skips those packs is refused. Keep what sells. Send copies the social caption and opens TikTok, Instagram, YouTube, or X. You still post the file there.</p>
      <div className="dialog-actions">
        <a className="btn" href="#/queue">
          Start a queue
        </a>
        <a className="btn btn-ghost" href="#/queue">
          Close
        </a>
      </div>
    </DialogFrame>
  );
}
