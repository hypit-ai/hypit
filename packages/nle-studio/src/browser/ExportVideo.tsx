import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";
import type { NleStudioActionObservation, NleStudioOpenProjection } from "../protocol.js";
import { cancelAction, readAction, startAction } from "./api.js";

export function ExportVideo({ session, disabled }: { session: NleStudioOpenProjection; disabled: boolean }) {
  const [action, setAction] = useState<NleStudioActionObservation>();
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const pending = action?.state === "queued" || action?.state === "running";
  const pendingHandle = pending ? action?.handle : undefined;
  useEffect(() => {
    if (pendingHandle === undefined) return;
    let active = true;
    const poll = async () => {
      while (active) {
        await new Promise<void>(resolve => window.setTimeout(resolve, 300));
        if (!active) return;
        try {
          const value = await readAction(pendingHandle);
          if (!active) return;
          setFailure("");
          setAction(value);
          if (value.state !== "queued" && value.state !== "running") return;
        } catch (error) {
          if (active) setFailure(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void poll();
    return () => { active = false; };
  }, [pendingHandle]);

  const delivery = session.delivery;
  if (delivery.state !== "available") return null;
  const filename = (session.project.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Hypit") + ".mp4";
  const begin = async () => {
    setStarting(true);
    setAction(undefined);
    setFailure("");
    try {
      setAction(await startAction({
        kind: "delivery",
        expectedProjectRevision: session.status.projectRevision,
        destination: `exports/${crypto.randomUUID()}.mp4`,
        profile: {
          picture: { width: delivery.width, height: delivery.height, frameRate: session.timeline.scene.editRate,
            background: "#000000", quality: "standard" },
          audio: { channels: 2, sampleRate: 48000 },
        },
      }));
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setStarting(false); }
  };
  const stop = async () => {
    if (action === undefined) return;
    setCancelling(true);
    try { setAction(await cancelAction(action.handle)); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setCancelling(false); }
  };
  const progress = pending && action ? Math.round(action.progress * 100) : 0;
  const error = failure || (action?.state === "failed" && action.diagnostic);
  return <Dialog.Root>
    <Dialog.Trigger className="button" disabled={!action && (disabled || !delivery.hasItems)}>导出</Dialog.Trigger>
    <Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/><Dialog.Popup className="studio-dialog modal">
      <Dialog.Title>导出 MP4</Dialog.Title>
      {error && <p role="alert">{error}</p>}
      {starting && <p role="status">正在准备导出</p>}
      {pending && <p role="status">正在导出 {progress}%</p>}
      {action?.state === "cancelled" && <p role="status">已取消导出</p>}
      {action?.state === "complete" && <p role="status">视频已导出</p>}
      <footer>
        <Dialog.Close className="button">关闭</Dialog.Close>
        {pending ? <button type="button" className="button" disabled={cancelling} onClick={() => void stop()}>取消导出</button>
          : <>
            {action?.state === "complete" && <a className="button primary" href={action.result.resource} download={filename}>下载 MP4</a>}
            <button type="button" className="button" disabled={starting || disabled || !delivery.hasItems} onClick={() => void begin()}>
              {action?.state === "complete" ? "再次导出" : "开始导出"}
            </button>
          </>}
      </footer>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
