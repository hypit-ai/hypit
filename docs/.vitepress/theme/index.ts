import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import SvmlPlayground from "./components/SvmlPlayground.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("SvmlPlayground", SvmlPlayground);
  },
} satisfies Theme;
