import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { relative } from "node:path";
import type { Plugin } from "vite";
import { createFeedbackStore, FeedbackConflict } from "./feedback-store.js";
import { readFeedbackMutation } from "./feedback.js";
import { allowsStudioMutation } from "./mutation-origin.js";
import type { FeedbackDocument, FeedbackView } from "./feedback.js";

/** Review storage is separate from compilation, Results and Agent delivery. */
export function studioFeedbackPlugin(workspaceRoot: string, contextPath: string): Plugin {
  const store = createFeedbackStore(workspaceRoot);
  const context = relative(workspaceRoot, contextPath).replaceAll("\\", "/");
  const view = (document: FeedbackDocument): FeedbackView => ({
    file: "FEEDBACK.json",
    context,
    comments: document.comments.filter((comment) => comment.context === context),
  });
  return {
    name: "hypit-studio-feedback",
    configureServer(server) {
      let watcher: FSWatcher | undefined;
      const watchFailed = (error: unknown): void => {
        watcher?.close();
        watcher = undefined;
        server.config.logger.warn(`Studio cannot watch ${workspaceRoot}/FEEDBACK.json: ${error instanceof Error ? error.message : String(error)}. External comment edits require a browser refresh; restart Studio to restore watching.`);
      };
      try {
        watcher = watch(workspaceRoot, (_event, filename) => {
          if (filename === null || filename.toString() === "FEEDBACK.json") {
            server.ws.send({ type: "custom", event: "studio:feedback-changed", data: {} });
          }
        });
        watcher.on("error", watchFailed);
      } catch (error) {
        watchFailed(error);
      }
      server.httpServer?.once("close", () => watcher?.close());
      server.middlewares.use((request, response, next) => {
        if (new URL(request.url ?? "/", "http://studio.hypit.local").pathname !== "/__studio/feedback") return next();
        if (request.method === "POST" && !allowsStudioMutation(request.headers)) {
          response.statusCode = 403;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "Studio mutation must come from this local Studio session." }));
          return;
        }
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        void (async () => {
          try {
            if (request.method === "GET") {
              response.end(JSON.stringify(view(await store.read())));
              return;
            }
            if (request.method !== "POST") { response.statusCode = 405; response.end(); return; }
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            const mutation = readFeedbackMutation(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            const comment = mutation.type === "delete" ? mutation.before : mutation.comment;
            if (comment.context !== context) throw new Error("The comment belongs to another authoring context.");
            const result = view(await store.mutate(mutation));
            response.end(JSON.stringify(result));
            server.ws.send({ type: "custom", event: "studio:feedback-changed", data: {} });
          } catch (error) {
            response.statusCode = error instanceof FeedbackConflict ? 409 : 400;
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        })();
      });
    },
  };
}
