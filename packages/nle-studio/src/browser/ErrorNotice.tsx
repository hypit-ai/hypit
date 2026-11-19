import { AlertCircle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { enterMotion } from "./motion.js";
import "./notifications.css";

const NoticeHost = createContext<HTMLDivElement | null | undefined>(undefined);

export function NotificationScope({ children }: { readonly children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <NoticeHost.Provider value={host}>{children}<div ref={setHost} className="region-notices region-notices-viewport"/></NoticeHost.Provider>;
}

export function ErrorNotice({ message, children, onClose }: {
  readonly message: string | undefined;
  readonly children?: ReactNode;
  readonly onClose?: () => void;
}) {
  const reduced = useReducedMotion();
  const host = useContext(NoticeHost);
  const [dismissed, setDismissed] = useState<string>();
  useEffect(() => { setDismissed(undefined); }, [message]);
  const content = <AnimatePresence>{message && dismissed !== message && <motion.div key={message} role="alert" className="region-notice region-notice-error" {...enterMotion(reduced)}>
      <AlertCircle size={17}/><div className="region-notice-content"><div className="region-notice-message">{message}</div>
        {children && <div className="region-notice-actions">{children}</div>}
      </div>{onClose && <button type="button" className="icon-button region-notice-close" aria-label="关闭错误提示" onClick={() => { setDismissed(message); onClose(); }}><X size={15}/></button>}
    </motion.div>}</AnimatePresence>;
  if (host === null) return null;
  return host ? createPortal(content, host) : createPortal(<div className="region-notices region-notices-viewport">{content}</div>, document.body);
}
