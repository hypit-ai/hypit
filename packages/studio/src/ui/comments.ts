import { t, uiLabel, uiAttribute, uiText, uiAttr, type Message } from "./i18n.js";
import { feedbackClock } from "../feedback.js";
import type { FeedbackComment, FeedbackMutation, FeedbackView } from "../feedback.js";
import { icon } from "./icons.js";
import type { Store } from "./selection.js";
import type { Stage } from "./stage.js";

type Anchor = Pick<FeedbackComment, "at">;

export function createComments(store: Store, stage: Stage) {
  const element = document.createElement("aside");
  element.className = "comments-panel";
  element.innerHTML = `
    <div class="pane-heading comments-heading">
      <div class="pane-title">${icon("comments")}<h2>${uiLabel("app.comments")}</h2><span data-count></span></div>
      <button type="button" class="comments-icon" data-refresh ${uiAttribute("aria-label", "comments.refresh-comments")} ${uiAttribute("title", "comments.refresh-comments")}>${icon("refresh")}</button>
    </div>
    <div class="comments-filters" role="group" ${uiAttribute("aria-label", "comments.filter-comments")}>
      <button type="button" data-filter="all" aria-pressed="true">${uiLabel("comments.all")}</button>
      <button type="button" data-filter="open" aria-pressed="false">${uiLabel("comments.open")}</button>
      <button type="button" data-filter="done" aria-pressed="false">${uiLabel("comments.done")}</button>
    </div>
    <div class="comments-error" role="status" aria-live="polite" hidden></div>
    <div class="comments-list" ${uiAttribute("aria-label", "app.comments")}></div>
    <form class="comment-composer">
      <div class="comment-anchor">
        <button type="button" class="comment-time" data-current-time ${uiAttribute("title", "comments.use-current-frame")} ${uiAttribute("aria-label", "comments.use-current-frame")}>${icon("when")}<span>00:00.00</span></button>
      </div>
      <div class="comment-input">
        <textarea rows="3" ${uiAttribute("aria-label", "comments.write-a-comment")} ${uiAttribute("placeholder", "comments.placeholder")} spellcheck="true" enterkeyhint="send"></textarea>
        <div class="comment-input-actions">
          <div class="comment-tools">
            <button type="button" class="comments-icon" ${uiAttribute("aria-label", "comments.emoji-soon")} ${uiAttribute("title", "comments.emoji-soon")} disabled>${icon("smile")}</button>
            <button type="button" class="comments-icon" ${uiAttribute("aria-label", "comments.draw-soon")} ${uiAttribute("title", "comments.draw-soon")} disabled>${icon("edit")}</button>
          </div>
          <button class="comment-submit" type="submit" ${uiAttribute("aria-label", "comments.send-comment")} ${uiAttribute("title", "comments.send-shortcut")} disabled>${icon("send")}</button>
        </div>
      </div>
    </form>`;
  const list = element.querySelector<HTMLElement>(".comments-list")!;
  const form = element.querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const submit = form.querySelector<HTMLButtonElement>(".comment-submit")!;
  const counter = element.querySelector<HTMLElement>("[data-count]")!;
  const timeLabel = form.querySelector<HTMLElement>("[data-current-time] span")!;
  const errorView = element.querySelector<HTMLElement>(".comments-error")!;
  let view: FeedbackView | undefined;
  let filter = "all";
  let selected: string | undefined;
  let anchor: Anchor | undefined;
  let busy = false;
  let active = false;
  let fetchId = 0;
  let editing: { id: string; before: FeedbackComment; text: string } | undefined;

  const showError = (error?: unknown): void => {
    errorView.hidden = error === undefined;
    errorView.textContent = error === undefined ? "" : error instanceof Error ? error.message : String(error);
  };
  const currentAnchor = (): Anchor | undefined => {
    const state = store.current();
    if (state === undefined) return undefined;
    return {
      at: state.playhead.frame * state.snapshot.timeline.frameRate.denominator / state.snapshot.timeline.frameRate.numerator,
    };
  };
  const renderAnchor = (): void => {
    timeLabel.textContent = feedbackClock(anchor?.at ?? 0);
    submit.disabled = busy || view === undefined || anchor === undefined || input.value.trim().length === 0;
  };
  const capture = (): void => { stage.pause(); anchor = currentAnchor(); renderAnchor(); };
  const button = (name: string, label: Message, action: () => void): HTMLButtonElement => {
    const node = document.createElement("button");
    node.type = "button"; node.className = "comments-icon";
    node.innerHTML = icon(name); uiAttr(node, "title", label); uiAttr(node, "aria-label", label);
    node.disabled = busy;
    node.addEventListener("click", (event) => { event.stopPropagation(); action(); });
    return node;
  };
  const locate = (comment: FeedbackComment): void => {
    stage.pause(); stage.showComposition();
    const state = store.current();
    if (state === undefined) return;
    const frame = Math.round(comment.at * state.snapshot.timeline.frameRate.numerator / state.snapshot.timeline.frameRate.denominator);
    store.seek(frame, "video");
    selected = comment.id;
    render();
  };
  const render = (): void => {
    const focusedEdit = list.querySelector<HTMLTextAreaElement>(".comment-edit textarea");
    const cursor = focusedEdit === document.activeElement && focusedEdit !== null
      ? { start: focusedEdit.selectionStart, end: focusedEdit.selectionEnd } : undefined;
    counter.textContent = view === undefined ? "" : String(view.comments.length);
    // Notes are appended to the file in submission order. Number that order;
    // time sorting and filters only change where a note is displayed.
    const comments = [...view?.comments ?? []]
      .map((comment, index) => ({ comment, number: index + 1 }))
      .sort((a, b) => a.comment.at - b.comment.at)
      .filter(({ comment }) => filter === "all" || (filter === "done") === (comment.resolved === true));
    list.replaceChildren();
    if (comments.length === 0) {
      const empty = document.createElement("div");
      empty.className = "comments-empty";
      empty.innerHTML = `${icon(filter === "done" ? "check" : "comments")}<strong></strong><p></p>`;
      uiText(empty.querySelector("strong")!, view === undefined ? "comments.loading-comments" : filter === "done" ? "comments.no-completed-comments" : filter === "open" ? "comments.caught-up" : "comments.empty");
      uiText(empty.querySelector("p")!, filter === "all" ? "comments.empty-hint" : "comments.filter-hint");
      list.append(empty);
    }
    for (const { comment, number } of comments) {
      const row = document.createElement("article");
      row.className = `comment-card${comment.resolved ? " resolved" : ""}${comment.id === selected ? " selected" : ""}`;
      row.dataset.commentId = comment.id;
      const head = document.createElement("div"); head.className = "comment-card-head";
      const location = document.createElement("button"); location.type = "button"; location.className = "comment-location";
      const label = document.createElement("span"); label.className = "comment-number"; label.textContent = `#${number}`;
      const time = document.createElement("span"); time.className = "comment-time"; time.textContent = feedbackClock(comment.at);
      location.append(time);
      uiAttr(location, "title", "comments.go-to-this-frame"); location.addEventListener("click", () => locate(comment));
      row.addEventListener("click", (event) => {
        if ((event.target as Element).closest("button, form") !== null || window.getSelection()?.isCollapsed === false) return;
        locate(comment);
      });
      const actions = document.createElement("div"); actions.className = "comment-actions";
      const resolve = button("check", comment.resolved ? "comments.reopen-comment" : "comments.mark-complete", () => {
        void mutate({ type: "replace", before: comment, comment: { ...comment, resolved: !comment.resolved } });
      });
      resolve.classList.toggle("is-done", comment.resolved === true);
      resolve.setAttribute("aria-pressed", String(comment.resolved === true));
      actions.append(label, resolve, button("edit", "comments.edit-comment", () => {
        editing = { id: comment.id, before: comment, text: comment.text }; selected = comment.id; render();
        list.querySelector<HTMLTextAreaElement>(".comment-edit textarea")?.focus();
      }), button("trash", "comments.delete-comment", () => { void mutate({ type: "delete", before: comment }); }));
      head.append(location, actions); row.append(head);
      if (editing?.id === comment.id) {
        const edit = document.createElement("form"); edit.className = "comment-edit";
        const text = document.createElement("textarea"); text.rows = 3; text.value = editing.text;
        uiAttr(text, "aria-label", "comments.edit-comment-text");
        text.addEventListener("input", () => { if (editing !== undefined) editing.text = text.value; });
        const controls = document.createElement("div"); controls.className = "comment-edit-actions";
        const cancel = document.createElement("button"); cancel.type = "button"; uiText(cancel, "common.cancel");
        cancel.addEventListener("click", () => { editing = undefined; render(); });
        const save = document.createElement("button"); save.type = "submit"; uiText(save, "common.save"); save.disabled = busy;
        controls.append(cancel, save); edit.append(text, controls);
        edit.addEventListener("submit", (event) => {
          event.preventDefault();
          if (editing === undefined || text.value.trim().length === 0) return;
          void mutate({ type: "replace", before: editing.before, comment: { ...editing.before, text: text.value.trim() } }, () => { editing = undefined; });
        }); row.append(edit);
      } else {
        const text = document.createElement("p"); text.className = "comment-text"; text.textContent = comment.text;
        row.append(text);
      }
      list.append(row);
    }
    if (cursor !== undefined) {
      const next = list.querySelector<HTMLTextAreaElement>(".comment-edit textarea");
      next?.focus({ preventScroll: true }); next?.setSelectionRange(cursor.start, cursor.end);
    }
  };
  const refresh = async (): Promise<void> => {
    const request = ++fetchId;
    try {
      const response = await fetch("/__studio/feedback");
      const data = await response.json() as FeedbackView & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("comments.read-failed"));
      if (request !== fetchId) return;
      if (JSON.stringify(view) !== JSON.stringify(data)) { view = data; render(); }
      showError(); renderAnchor();
    } catch (error) { if (request === fetchId) showError(error); }
  };
  const mutate = async (mutation: FeedbackMutation, saved?: () => void): Promise<void> => {
    if (busy) return;
    busy = true; showError(); renderAnchor();
    try {
      const response = await fetch("/__studio/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mutation) });
      const data = await response.json() as FeedbackView & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("comments.save-failed"));
      ++fetchId; view = data; busy = false; saved?.();
      if (mutation.type === "delete" && selected === mutation.before.id) selected = undefined;
      if (mutation.type === "delete" && editing?.id === mutation.before.id) editing = undefined;
      render();
    } catch (error) { showError(error); }
    finally { busy = false; renderAnchor(); }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (view === undefined || anchor === undefined || input.value.trim().length === 0) return;
    const comment: FeedbackComment = {
      id: `c-${crypto.randomUUID()}`,
      context: view.context,
      ...anchor,
      text: input.value.trim(),
    };
    void mutate({ type: "add", comment }, () => {
      input.value = ""; input.style.height = ""; selected = comment.id; anchor = currentAnchor();
    });
  });
  input.addEventListener("focus", () => { if (input.value.length === 0) capture(); else stage.pause(); });
  input.addEventListener("input", () => {
    input.style.height = "auto"; input.style.height = `${Math.min(180, input.scrollHeight)}px`; renderAnchor();
  });
  element.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLTextAreaElement) || event.key !== "Enter") return;
    // Some IMEs report the confirming Enter as keyCode 229 after compositionend.
    if (event.isComposing || event.keyCode === 229 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) event.target.form?.requestSubmit();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!active || selected === undefined) return;
    const row = event.target instanceof Element ? event.target.closest(".comment-card") : null;
    if (row?.getAttribute("data-comment-id") === selected) return;
    selected = undefined;
    // Keep the clicked control and any unsaved editor mounted through pointerup.
    list.querySelector(".comment-card.selected")?.classList.remove("selected");
  });
  form.querySelector("[data-current-time]")!.addEventListener("click", capture);
  element.querySelector("[data-refresh]")!.addEventListener("click", () => { void refresh(); });
  element.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.filter!;
    element.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    render();
  }));
  store.subscribe(() => {
    if (input.value.length === 0) { anchor = currentAnchor(); renderAnchor(); }
  });
  type Hot = { on(event: string, listener: () => void): void };
  (import.meta as ImportMeta & { hot?: Hot }).hot?.on("studio:feedback-changed", () => { if (active) void refresh(); });
  render();
  return {
    element,
    activate(value: boolean) {
      active = value;
      stage.setReviewMode(value);
      if (active) { stage.showComposition(); anchor ??= currentAnchor(); renderAnchor(); void refresh(); }
    },
  };
}
