import { useSyncExternalStore } from "react";
import { studio, type StudioState } from "./store.ts";

export function useStudio(): StudioState {
  return useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
}

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type Tab = "queue" | "review" | "socials" | "formats";

export type Route =
  | { tab: Tab; projectId?: undefined; dialog?: undefined }
  | { tab: Tab; projectId: string; dialog?: undefined }
  | { tab: Tab; projectId?: undefined; dialog: "help" };

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [head, rest] = raw.split("/");
  if (head === "review" || head === "socials" || head === "formats" || head === "queue") {
    return { tab: head };
  }
  if (head === "project" && rest) return { tab: "queue", projectId: rest };
  if (head === "help") return { tab: "queue", dialog: "help" };
  return { tab: "queue" };
}

export function hrefFor(route: Route): string {
  if (route.dialog) return `#/${route.dialog}`;
  if (route.projectId) return `#/project/${route.projectId}`;
  return `#/${route.tab}`;
}
