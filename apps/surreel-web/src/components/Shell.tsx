import { ImagesIcon, PaperPlaneTiltIcon, QuestionIcon, QueueIcon, StackIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { hrefFor, type Route, type Tab } from "../useStudio.ts";

const tabs: { id: Tab; label: string; Icon: typeof QueueIcon }[] = [
  { id: "queue", label: "Queue", Icon: QueueIcon },
  { id: "review", label: "Review", Icon: StackIcon },
  { id: "socials", label: "Socials", Icon: PaperPlaneTiltIcon },
  { id: "formats", label: "Formats", Icon: ImagesIcon },
];

type Props = {
  route: Route;
  inboxCount: number;
  connected: boolean;
  agentAvailable: boolean;
  children: ReactNode;
};

export function Shell({ route, inboxCount, connected, agentAvailable, children }: Props) {
  const live = connected && agentAvailable;
  const liveLabel = live ? "Live" : connected ? "Agent off" : "Offline";
  const liveStatus = live ? "Studio live" : connected ? "Agent offline" : "Studio offline";
  return (
    <div className="canvas">
      <a className="skip-link" href="#main">
        Skip to studio
      </a>
      <div className="bloom" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="column">
        <header className="mast">
          <a className="brand" href="#/queue">
            <img src="/brand/surreel.svg" alt="" width={22} height={22} />
            Surreel
          </a>
          <p className={live ? "live is-on" : "live"} role="status" aria-atomic="true">
            <span aria-hidden />
            <span aria-hidden>{liveLabel}</span>
            <span className="sr-only">{liveStatus}</span>
          </p>
          <a className="icon-btn" href="#/help" aria-label="Getting started">
            <QuestionIcon size={20} weight="regular" aria-hidden />
          </a>
        </header>
        <main className="stage" id="main" tabIndex={-1}>
          {children}
        </main>
        <nav className="dock" aria-label="Studio">
          {tabs.map((item) => {
            const current = route.tab === item.id && !route.projectId && !route.dialog;
            const reviewWaiting = item.id === "review" && inboxCount > 0;
            return (
              <a
                key={item.id}
                className={current ? "dock-link is-current" : "dock-link"}
                href={hrefFor({ tab: item.id })}
                aria-current={current ? "page" : undefined}
                aria-label={reviewWaiting ? `Review, ${inboxCount} ${inboxCount === 1 ? "film" : "films"} waiting` : item.label}
              >
                <item.Icon size={20} weight={current ? "fill" : "regular"} aria-hidden />
                {item.label}
                {reviewWaiting ? (
                  <span className="dock-count" aria-hidden>
                    {inboxCount}
                  </span>
                ) : null}
              </a>
            );
          })}
        </nav>
        <p className="colophon">Paste a link. Queue the angles. Keep what sells.</p>
      </div>
    </div>
  );
}
