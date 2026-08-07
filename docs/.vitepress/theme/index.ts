import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import HeroStatement from "./components/HeroStatement.vue";
import LocalePreference from "./components/LocalePreference.vue";
import SvmlDemoCarousel from "./components/SvmlDemoCarousel.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "layout-top": () => h(LocalePreference),
      "home-hero-info": () => h(HeroStatement),
    }),
  enhanceApp({ app }) {
    app.component("SvmlDemoCarousel", SvmlDemoCarousel);
  },
} satisfies Theme;
