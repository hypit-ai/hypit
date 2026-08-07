import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import SvmlDemoCarousel from "./components/SvmlDemoCarousel.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("SvmlDemoCarousel", SvmlDemoCarousel);
  },
} satisfies Theme;
