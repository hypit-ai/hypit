import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import SvmlDemoCarousel from "./components/SvmlDemoCarousel.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("SvmlDemoCarousel", SvmlDemoCarousel);
  },
} satisfies Theme;
