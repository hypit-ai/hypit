import { watchEffect, type Ref } from "vue";

const HOME_CLASS = "home-page";

/**
 * The home page keeps the branded always-dark design; documentation pages use the
 * stock VitePress theme with the light/dark toggle. All branded styling is scoped to
 * `html.home-page`, so the flag has to live on the document element — `html` and `body`
 * backgrounds sit outside the theme's `.Layout` root and cannot be scoped from inside it.
 *
 * The matching inline script in `config.ts` sets the same class before first paint;
 * this keeps it in sync across client-side navigation.
 */
export function useHomeThemeScope(isHome: Ref<boolean>): void {
  if (typeof document === "undefined") return;
  watchEffect(() => {
    document.documentElement.classList.toggle(HOME_CLASS, isHome.value);
  });
}
