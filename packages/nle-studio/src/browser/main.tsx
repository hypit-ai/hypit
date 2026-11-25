import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/hanken-grotesk";
import { Studio } from "./Studio.js";
import { NotificationScope } from "./ErrorNotice.js";
import "./base.css";
import "./overlays.css";
import "./motion.css";
import "./library.css";
import "./nle.css";
import "./studio.css";

const scheme = matchMedia("(prefers-color-scheme: dark)");
const syncTheme = () => {
  const override = localStorage.getItem("hypit:theme");
  document.documentElement.dataset.theme =
    override === "dark" || override === "light" ? override : scheme.matches ? "dark" : "light";
};
syncTheme();
scheme.addEventListener("change", syncTheme);
const root = document.querySelector("#studio");
if (root === null) throw new Error("NLE Studio root is missing.");
createRoot(root).render(<StrictMode><MotionConfig reducedMotion="user"><NotificationScope><Studio/></NotificationScope></MotionConfig></StrictMode>);
