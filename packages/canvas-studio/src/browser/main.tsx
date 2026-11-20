import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { CanvasBoard } from "./board.js";
import { notify, startSession, useCanvasSession } from "./session.js";
import { Notice, t, zh } from "./ui.js";
import "@fontsource-variable/hanken-grotesk";
import "./theme.css";
import "./motion.css";
import "./dropdowns.css";
import "./style.css";

document.documentElement.lang = zh ? "zh-CN" : "en";
const scheme = matchMedia("(prefers-color-scheme: dark)");
const syncTheme = () => { document.documentElement.dataset.theme = scheme.matches ? "dark" : "light"; };
syncTheme();
scheme.addEventListener("change", syncTheme);

function App() {
  const { board, catalog, busy, canUndo, canRedo, notice } = useCanvasSession();
  return <MotionConfig reducedMotion="user">
    {board && catalog ? <CanvasBoard key={board.document.id} board={board.document} revision={board.revision} catalog={catalog}
      busy={busy} canUndo={canUndo} canRedo={canRedo}/>
      : !notice.problem && <div className="canvas-loading" role="status" aria-label={t("Opening canvas", "正在打开画布")}><LoaderCircle size={22}/></div>}
    <Notice {...notice} close={() => notify("")}/>
  </MotionConfig>;
}

createRoot(document.getElementById("root")!).render(<App/>);
startSession();
