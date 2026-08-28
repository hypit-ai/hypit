import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import "@fontsource-variable/hanken-grotesk";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout,
} satisfies Theme;
